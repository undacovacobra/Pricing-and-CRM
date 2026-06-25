// Tool definitions + executors for the in-app AI assistant.
//
// Every tool runs against the *authenticated* Supabase server client, so row-
// level security applies exactly as it would for the logged-in user. Read tools
// answer questions; action tools (create_appointment, add_job_note) make
// changes. Executors return human-readable strings — the model reads them back.

import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_TIME_ZONE, formatTime } from "@/components/calendar/eventStyles";
import { jobBalance, jobPaidSince, type JobPaymentFields } from "@/lib/payments";
import { taskCalendarStart } from "@/lib/tasks/shared";

// Renders a UTC ISO timestamp as "YYYY-MM-DD h:mm AM/PM" in the business's
// local timezone — never raw-slice a UTC string, it silently shows UTC.
function formatLocal(iso: string): string {
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return `${dayKey} ${formatTime(iso)}`;
}

// Resolves what UTC instant corresponds to a given wall-clock time
// (YYYY-MM-DD HH:mm:ss) in the business's timezone, accounting for DST.
function zonedToUtcIso(dateStr: string, time: string, tz: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi, s] = time.split(":").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, h, mi, s ?? 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcGuess)).reduce((acc: Record<string, string>, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  const offset = asUtc - utcGuess;
  return new Date(utcGuess - offset).toISOString();
}

// Provider-neutral JSON-schema-ish shape for a tool's parameters.
interface ToolSchema {
  type: string;
  description?: string;
  properties?: Record<string, ToolSchema>;
  required?: string[];
  items?: ToolSchema;
  enum?: string[];
}
interface ToolDef {
  name: string;
  description: string;
  input_schema: ToolSchema;
}

// "owner" = Travis, "designer" = Carol — the values stored in assigned_to / author.
export type TeamRole = "owner" | "designer";

// A file the user attached to the chat, already uploaded to a staging path in
// the job-attachments bucket. The assistant can file it into a job on request.
export interface StagedAttachment {
  file_name: string;
  storage_path: string;
  file_size?: number;
  file_type?: string;
}

export interface AssistantContext {
  // Who is chatting — resolves "me"/"my" and attributes notes.
  role: TeamRole;
  name: string;
  // Files attached to the current message, staged and awaiting filing.
  attachments?: StagedAttachment[];
}

function personLabel(v: string | null | undefined): string {
  if (v === "owner") return "Travis";
  if (v === "designer") return "Carol";
  return v || "Unassigned";
}

// Maps a free-text person reference to the stored role value, defaulting to the
// current user when the model passes "me"/"self" or leaves it blank.
function resolveRole(value: string | null | undefined, ctx: AssistantContext): TeamRole {
  const v = (value ?? "").toLowerCase().trim();
  if (!v || v === "me" || v === "self" || v === "myself") return ctx.role;
  if (v.includes("travis") || v === "owner") return "owner";
  if (v.includes("carol") || v === "designer") return "designer";
  return ctx.role;
}

export const ASSISTANT_TOOLS: ToolDef[] = [
  {
    name: "search_jobs",
    description:
      "Search jobs by customer name, title, or address, and/or filter by stage. Returns matching jobs with their stage, customer, assigned person, and outstanding balance. Use this to answer questions about jobs.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free text to match against job title, address, or customer name. Omit to list all." },
        stage: { type: "string", description: "Optional stage filter: lead, proposal_sent, contract_signed, in_progress, in_install, finished, or cancelled." },
        limit: { type: "integer", description: "Max results (default 15)." },
      },
    },
  },
  {
    name: "get_job_details",
    description:
      "Get full detail for one job: customer, stage, dates, contract/payment status, recent notes, material orders, and upcoming appointments. Call search_jobs first to find the job_id if you only have a name.",
    input_schema: {
      type: "object",
      properties: { job_id: { type: "string", description: "The job's UUID." } },
      required: ["job_id"],
    },
  },
  {
    name: "search_customers",
    description: "Search customers by name, email, or phone. Returns contact info and how many jobs each has.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free text to match name/email/phone. Omit to list recent customers." },
        limit: { type: "integer", description: "Max results (default 15)." },
      },
    },
  },
  {
    name: "list_appointments",
    description:
      "List scheduled calendar events (appointments, installs, deliveries, personal) in a date range, optionally for one person. Use for 'what's on the calendar' / 'what do I have this week' questions.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO date (YYYY-MM-DD) start of range. Defaults to today." },
        to: { type: "string", description: "ISO date (YYYY-MM-DD) end of range. Defaults to 14 days out." },
        person: { type: "string", description: "Optional: 'me', 'Travis', or 'Carol' to filter by who it's assigned to." },
      },
    },
  },
  {
    name: "list_commissions",
    description: "List designer commission invoices, optionally filtered by status (pending or paid). Use for commission/payout questions.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string", description: "Optional: 'pending' or 'paid'." } },
    },
  },
  {
    name: "create_appointment",
    description:
      "Create a calendar event. Confirm the date, time, and who it's for before calling. If a customer or job is mentioned, look up its id first (search_customers / search_jobs) and pass it so the event links correctly.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title, e.g. 'Measure at Smith kitchen'." },
        start_time: { type: "string", description: "ISO 8601 datetime with timezone offset, e.g. 2026-06-26T14:00:00-04:00." },
        end_time: { type: "string", description: "Optional ISO 8601 end datetime." },
        event_type: { type: "string", description: "appointment, install, delivery, or personal. Default appointment." },
        person: { type: "string", description: "Who it's for: 'me', 'Travis', or 'Carol'. Defaults to the current user." },
        location: { type: "string", description: "Optional address or place." },
        customer_id: { type: "string", description: "Optional linked customer UUID." },
        job_id: { type: "string", description: "Optional linked job UUID." },
        notes: { type: "string", description: "Optional notes." },
      },
      required: ["title", "start_time"],
    },
  },
  {
    name: "add_job_note",
    description: "Add a note to a job's activity log. Look up the job_id via search_jobs first if you only have a name.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The job's UUID." },
        content: { type: "string", description: "The note text." },
      },
      required: ["job_id", "content"],
    },
  },
  {
    name: "list_job_files",
    description:
      "List every file and drawing attached to a job: uploaded attachments (PDFs, photos, receipts), hand drawings, job photos, contract/change-order documents, and generated documents. Use to answer 'what files / drawings / photos does job X have'.",
    input_schema: {
      type: "object",
      properties: { job_id: { type: "string", description: "The job's UUID." } },
      required: ["job_id"],
    },
  },
  {
    name: "read_team_chat",
    description:
      "Read the most recent messages from the internal team chat between Travis and Carol. Use for 'what did Carol say', 'catch me up on the chat', etc.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", description: "How many recent messages (default 20, max 50)." } },
    },
  },
  {
    name: "list_documents",
    description:
      "List generated documents (contracts, invoices, change orders, quotes), optionally for one job or by type/status. Use for 'what invoices are out', 'unsigned contracts', etc.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Optional job UUID to scope to." },
        document_type: { type: "string", description: "Optional: contract, invoice, change_order, or quote." },
        status: { type: "string", description: "Optional: draft, sent, viewed, signed, paid, or void." },
      },
    },
  },
  {
    name: "list_estimates",
    description: "List estimates, optionally for one job. Shows name, status, and margin. Use for estimate/quote questions.",
    input_schema: {
      type: "object",
      properties: { job_id: { type: "string", description: "Optional job UUID to scope to." } },
    },
  },
  {
    name: "search_pricing",
    description:
      "Search the pricing catalog (cabinets, countertops, labor, hardware, etc.) by name or category. Returns unit and unit price. Use for 'how much do we charge for X'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free text to match item name or category. Omit to list by category." },
        limit: { type: "integer", description: "Max results (default 20, max 50)." },
      },
    },
  },
  {
    name: "list_material_orders",
    description: "List material orders for a job: vendor, description, order/arrival dates. Use for 'what's on order' / 'has the cabinet shipment arrived'.",
    input_schema: {
      type: "object",
      properties: { job_id: { type: "string", description: "The job's UUID." } },
      required: ["job_id"],
    },
  },
  {
    name: "get_money_summary",
    description:
      "Get a business-wide money snapshot: total outstanding balance across all jobs, payments received in the last 7 days, and a list of jobs still owing. Use for 'how much are we owed', 'who still owes money', 'what came in this week'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "attach_file_to_job",
    description:
      "File a user-attached document into a job, so it shows up under the job's files. Only works when the user has attached one or more files to the current message. Look up the job_id first with search_jobs if you only have a name. If multiple files are attached and the user only wants some, pass file_name to pick.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The job's UUID to file the attachment into." },
        file_name: { type: "string", description: "Optional: the name of the specific attached file to file. Omit to file all attached files." },
      },
      required: ["job_id"],
    },
  },
  {
    name: "update_job",
    description:
      "Update fields on a job: stage, assigned person, dates, address, contract amount, description, or notes. Look up the job_id with search_jobs first. Only pass the fields you want to change.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The job's UUID." },
        stage: { type: "string", description: "lead, proposal_sent, contract_signed, in_progress, in_install, finished, or cancelled." },
        assigned_to: { type: "string", description: "'me', 'Travis', or 'Carol'." },
        start_date: { type: "string", description: "YYYY-MM-DD." },
        estimated_end_date: { type: "string", description: "YYYY-MM-DD." },
        job_address: { type: "string", description: "Job site address." },
        contract_amount: { type: "number", description: "Contract dollar amount." },
        description: { type: "string", description: "Job description." },
        notes: { type: "string", description: "Job notes (overwrites the notes field)." },
      },
      required: ["job_id"],
    },
  },
  {
    name: "create_customer",
    description: "Create a new customer record. Confirm at least a name before calling. Returns the new customer id.",
    input_schema: {
      type: "object",
      properties: {
        first_name: { type: "string", description: "First name." },
        last_name: { type: "string", description: "Last name." },
        email: { type: "string", description: "Optional email." },
        phone: { type: "string", description: "Optional phone." },
        address_line1: { type: "string", description: "Optional street address." },
        city: { type: "string", description: "Optional city." },
        state: { type: "string", description: "Optional state." },
        zip: { type: "string", description: "Optional ZIP." },
        notes: { type: "string", description: "Optional notes." },
      },
      required: ["first_name"],
    },
  },
  {
    name: "update_commission",
    description:
      "Update a designer commission: mark it paid (with amount, method) or change its amount/notes. List commissions first to get context. Identify by job name or commission description.",
    input_schema: {
      type: "object",
      properties: {
        commission_id: { type: "string", description: "The commission's UUID (from list_commissions if available)." },
        job_id: { type: "string", description: "Alternatively, the job UUID to find the commission by." },
        mark_paid: { type: "boolean", description: "Set true to mark it paid." },
        paid_amount: { type: "number", description: "Amount paid." },
        payment_method: { type: "string", description: "check, cash, Zelle, etc." },
        amount: { type: "number", description: "Change the commission's billed amount." },
        notes: { type: "string", description: "Update notes." },
      },
    },
  },
  {
    name: "set_payment_milestone",
    description:
      "Mark a job's payment milestone paid or unpaid: deposit (50%), delivery (40%), completion (10%), or change_orders (100% of change orders). Stamps the paid date. Use for 'mark the deposit on the Smith job as paid'.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The job's UUID." },
        milestone: { type: "string", description: "deposit, delivery, completion, or change_orders." },
        paid: { type: "boolean", description: "true to mark paid, false to unmark. Default true." },
      },
      required: ["job_id", "milestone"],
    },
  },
  {
    name: "list_tasks",
    description:
      "List to-do tasks for Travis and Carol. Defaults to open tasks. Use for 'what's on my list', 'what tasks does Carol have', 'what's overdue', 'tasks for the Smith job'.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "open (default) or done." },
        person: { type: "string", description: "Optional: 'me', 'Travis', or 'Carol' to filter by owner." },
        job_id: { type: "string", description: "Optional job UUID to scope to." },
      },
    },
  },
  {
    name: "create_task",
    description:
      "Create a to-do task. With a due date it shows on the calendar and reminds the owner daily until done. If it relates to a job, look up the job_id with search_jobs and pass it.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "What needs doing." },
        due_date: { type: "string", description: "Optional due date, YYYY-MM-DD." },
        due_time: { type: "string", description: "Optional due time, 24h HH:MM (only with a due date)." },
        person: { type: "string", description: "Who it's for: 'me', 'Travis', or 'Carol'. Defaults to the current user." },
        job_id: { type: "string", description: "Optional linked job UUID." },
        description: { type: "string", description: "Optional extra detail." },
      },
      required: ["title"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task done. Identify it by task_id, or by title text (matches an open task). Use 'mark X as done'.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task's UUID (from list_tasks)." },
        title: { type: "string", description: "Alternatively, text to match against an open task's title." },
      },
    },
  },
  {
    name: "reopen_task",
    description: "Reopen a completed task. Identify by task_id or title.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task's UUID." },
        title: { type: "string", description: "Alternatively, text to match against a task's title." },
      },
    },
  },
  {
    name: "update_task",
    description: "Change a task: its title, due date/time, owner, or job link. Identify by task_id or current title.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task's UUID." },
        title: { type: "string", description: "Text to match the task to change (if no task_id)." },
        new_title: { type: "string", description: "New title." },
        due_date: { type: "string", description: "New due date YYYY-MM-DD (empty string clears it)." },
        due_time: { type: "string", description: "New due time HH:MM." },
        person: { type: "string", description: "New owner: 'me', 'Travis', or 'Carol'." },
        job_id: { type: "string", description: "Link to a job UUID." },
      },
    },
  },
  {
    name: "delete_task",
    description: "Delete a task entirely. Identify by task_id or title. Prefer complete_task unless the user really wants it removed.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task's UUID." },
        title: { type: "string", description: "Alternatively, text to match against a task's title." },
      },
    },
  },
];

// ---- Gemini function declarations ------------------------------------------

// Gemini's function-declaration schema is JSON-schema-like but wants uppercase
// type names ("STRING", "OBJECT", …) and uses `parameters` rather than
// `input_schema`. Convert our neutral definitions once.
interface GeminiSchema {
  type: string;
  description?: string;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
  enum?: string[];
}

function toGeminiSchema(s: ToolSchema): GeminiSchema {
  const out: GeminiSchema = { type: s.type.toUpperCase() };
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.required) out.required = s.required;
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(s.properties)) out.properties[k] = toGeminiSchema(v);
  }
  return out;
}

export const GEMINI_TOOL_DECLARATIONS = ASSISTANT_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  parameters: toGeminiSchema(t.input_schema),
}));

type Json = Record<string, unknown>;

export async function executeAssistantTool(
  supabase: SupabaseClient,
  name: string,
  input: Json,
  ctx: AssistantContext,
): Promise<string> {
  switch (name) {
    case "search_jobs":
      return searchJobs(supabase, input);
    case "get_job_details":
      return getJobDetails(supabase, input);
    case "search_customers":
      return searchCustomers(supabase, input);
    case "list_appointments":
      return listAppointments(supabase, input, ctx);
    case "list_commissions":
      return listCommissions(supabase, input);
    case "create_appointment":
      return createAppointment(supabase, input, ctx);
    case "add_job_note":
      return addJobNote(supabase, input, ctx);
    case "list_job_files":
      return listJobFiles(supabase, input);
    case "read_team_chat":
      return readTeamChat(supabase, input);
    case "list_documents":
      return listDocuments(supabase, input);
    case "list_estimates":
      return listEstimates(supabase, input);
    case "search_pricing":
      return searchPricing(supabase, input);
    case "list_material_orders":
      return listMaterialOrders(supabase, input);
    case "get_money_summary":
      return getMoneySummary(supabase);
    case "attach_file_to_job":
      return attachFileToJob(supabase, input, ctx);
    case "update_job":
      return updateJob(supabase, input, ctx);
    case "create_customer":
      return createCustomer(supabase, input);
    case "update_commission":
      return updateCommission(supabase, input);
    case "set_payment_milestone":
      return setPaymentMilestone(supabase, input);
    case "list_tasks":
      return listTasks(supabase, input, ctx);
    case "create_task":
      return createTaskTool(supabase, input, ctx);
    case "complete_task":
      return setTaskStatus(supabase, input, "done");
    case "reopen_task":
      return setTaskStatus(supabase, input, "open");
    case "update_task":
      return updateTaskTool(supabase, input, ctx);
    case "delete_task":
      return deleteTaskTool(supabase, input);
    default:
      return `Unknown tool: ${name}`;
  }
}

// ---- Read tools -------------------------------------------------------------

async function searchJobs(supabase: SupabaseClient, input: Json): Promise<string> {
  const query = (input.query as string | undefined)?.trim();
  const stage = (input.stage as string | undefined)?.trim();
  const limit = Math.min(Number(input.limit) || 15, 40);

  let q = supabase
    .from("jobs")
    .select("id, title, stage, job_address, assigned_to, customer:customers!jobs_customer_id_fkey(first_name, last_name), contract_documents(kind, amount), pay_deposit_paid, pay_deposit_amount, pay_delivery_paid, pay_delivery_amount, pay_completion_paid, pay_completion_amount, change_orders_paid, retainer_amount")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (stage) q = q.eq("stage", stage);

  const { data, error } = await q;
  if (error) return `Error searching jobs: ${error.message}`;
  let rows = data ?? [];

  if (query) {
    const ql = query.toLowerCase();
    rows = rows.filter((j) => {
      const c = j.customer as { first_name?: string; last_name?: string } | null;
      const hay = `${j.title ?? ""} ${j.job_address ?? ""} ${c?.first_name ?? ""} ${c?.last_name ?? ""}`.toLowerCase();
      return hay.includes(ql);
    });
  }
  if (!rows.length) return "No matching jobs found.";

  return rows
    .map((j) => {
      const c = j.customer as { first_name?: string; last_name?: string } | null;
      const cust = c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "—";
      const docs = (j.contract_documents as { kind: string; amount: number | null }[]) ?? [];
      const contract = docs.filter((d) => d.kind !== "change_order").reduce((s, d) => s + (d.amount ?? 0), 0);
      const co = docs.filter((d) => d.kind === "change_order").reduce((s, d) => s + (d.amount ?? 0), 0);
      const paid =
        (j.retainer_amount ?? 0) +
        (j.pay_deposit_paid ? j.pay_deposit_amount ?? contract * 0.5 : 0) +
        (j.pay_delivery_paid ? j.pay_delivery_amount ?? contract * 0.4 : 0) +
        (j.pay_completion_paid ? j.pay_completion_amount ?? contract * 0.1 : 0) +
        (j.change_orders_paid ? co : 0);
      const balance = contract + co - paid;
      return `- [${j.id}] "${j.title}" — ${cust} · stage: ${j.stage} · for ${personLabel(j.assigned_to)}${
        contract ? ` · balance due $${balance.toFixed(0)}` : ""
      }`;
    })
    .join("\n");
}

async function getJobDetails(supabase: SupabaseClient, input: Json): Promise<string> {
  const jobId = input.job_id as string;
  const { data: job, error } = await supabase
    .from("jobs")
    .select("*, customer:customers!jobs_customer_id_fkey(first_name, last_name, email, phone)")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return `Error: ${error.message}`;
  if (!job) return "No job found with that id.";

  const [{ data: notes }, { data: mats }, { data: events }] = await Promise.all([
    supabase.from("job_notes").select("author, content, created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(5),
    supabase.from("material_orders").select("vendor, description, estimated_arrival, actual_arrival").eq("job_id", jobId).order("ordered_at", { ascending: false }).limit(5),
    supabase.from("calendar_events").select("title, start_time, event_type").eq("job_id", jobId).eq("status", "scheduled").gte("start_time", new Date().toISOString()).order("start_time").limit(5),
  ]);

  const c = job.customer as { first_name?: string; last_name?: string; email?: string; phone?: string } | null;
  const lines: string[] = [];
  lines.push(`Job "${job.title}" [${job.id}]`);
  lines.push(`Stage: ${job.stage} · Assigned to: ${personLabel(job.assigned_to)}`);
  if (c) lines.push(`Customer: ${`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()}${c.phone ? ` · ${c.phone}` : ""}${c.email ? ` · ${c.email}` : ""}`);
  if (job.job_address) lines.push(`Address: ${job.job_address}`);
  if (job.start_date) lines.push(`Start: ${job.start_date}`);
  if (job.estimated_end_date) lines.push(`Est. completion: ${job.estimated_end_date}`);
  if (job.description) lines.push(`Description: ${job.description}`);
  if (notes?.length) {
    lines.push("Recent notes:");
    notes.forEach((n) => lines.push(`  · ${personLabel(n.author)} (${String(n.created_at).slice(0, 10)}): ${n.content}`));
  }
  if (mats?.length) {
    lines.push("Material orders:");
    mats.forEach((m) => lines.push(`  · ${m.vendor}${m.description ? ` — ${m.description}` : ""}${m.actual_arrival ? ` (received ${m.actual_arrival})` : m.estimated_arrival ? ` (est. ${m.estimated_arrival})` : ""}`));
  }
  if (events?.length) {
    lines.push("Upcoming appointments:");
    events.forEach((e) => lines.push(`  · ${e.event_type}: ${e.title} on ${formatLocal(e.start_time as string)}`));
  }
  return lines.join("\n");
}

async function searchCustomers(supabase: SupabaseClient, input: Json): Promise<string> {
  const query = (input.query as string | undefined)?.trim();
  const limit = Math.min(Number(input.limit) || 15, 40);
  const { data, error } = await supabase
    .from("customers")
    .select("id, first_name, last_name, email, phone, customer_type, jobs:jobs!jobs_customer_id_fkey(id)")
    .order("last_name")
    .limit(200);
  if (error) return `Error searching customers: ${error.message}`;
  let rows = data ?? [];
  if (query) {
    const ql = query.toLowerCase();
    rows = rows.filter((c) =>
      `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(ql),
    );
  }
  rows = rows.slice(0, limit);
  if (!rows.length) return "No matching customers found.";
  return rows
    .map((c) => {
      const jobs = (c.jobs as { id: string }[]) ?? [];
      return `- [${c.id}] ${`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()}${c.phone ? ` · ${c.phone}` : ""}${c.email ? ` · ${c.email}` : ""} · ${jobs.length} job(s)`;
    })
    .join("\n");
}

async function listAppointments(supabase: SupabaseClient, input: Json, ctx: AssistantContext): Promise<string> {
  const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const from = (input.from as string | undefined) || todayLocal;
  const to =
    (input.to as string | undefined) ||
    new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(Date.now() + 14 * 86400000),
    );
  const fromIso = zonedToUtcIso(from, "00:00:00", APP_TIME_ZONE);
  const toIso = zonedToUtcIso(to, "23:59:59", APP_TIME_ZONE);

  let q = supabase
    .from("calendar_events")
    .select("title, event_type, assigned_to, start_time, end_time, location, customer:customers(first_name, last_name), job:jobs(title)")
    .eq("status", "scheduled")
    .gte("start_time", fromIso)
    .lte("start_time", toIso)
    .order("start_time");
  if (input.person) q = q.eq("assigned_to", resolveRole(input.person as string, ctx));

  const { data, error } = await q;
  if (error) return `Error listing appointments: ${error.message}`;
  if (!data?.length) return `No scheduled events between ${from} and ${to}.`;
  return data
    .map((e) => {
      const cust = e.customer as { first_name?: string; last_name?: string } | null;
      const job = e.job as { title?: string } | null;
      const link = job?.title ? ` · job: ${job.title}` : cust ? ` · ${`${cust.first_name ?? ""} ${cust.last_name ?? ""}`.trim()}` : "";
      return `- ${formatLocal(e.start_time as string)} ${e.event_type}: ${e.title} (${personLabel(e.assigned_to)})${e.location ? ` @ ${e.location}` : ""}${link}`;
    })
    .join("\n");
}

async function listCommissions(supabase: SupabaseClient, input: Json): Promise<string> {
  const status = (input.status as string | undefined)?.trim();
  let q = supabase
    .from("designer_commissions")
    .select("amount, paid_amount, status, submitted_at, paid_at, notes, job_name_freeform, job:jobs(title)")
    .order("submitted_at", { ascending: false })
    .limit(40);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return `Error listing commissions: ${error.message}`;
  if (!data?.length) return "No commissions found.";
  return data
    .map((c) => {
      const job = c.job as { title?: string } | null;
      const desc = c.notes || job?.title || c.job_name_freeform || "Commission";
      const amt = c.status === "paid" ? c.paid_amount ?? c.amount : c.amount;
      return `- ${desc}: $${Number(amt ?? 0).toFixed(0)} · ${c.status}${c.status === "paid" && c.paid_at ? ` (${String(c.paid_at).slice(0, 10)})` : c.submitted_at ? ` (submitted ${String(c.submitted_at).slice(0, 10)})` : ""}`;
    })
    .join("\n");
}

// ---- Action tools -----------------------------------------------------------

async function createAppointment(supabase: SupabaseClient, input: Json, ctx: AssistantContext): Promise<string> {
  const title = (input.title as string)?.trim();
  const startTime = input.start_time as string;
  if (!title || !startTime) return "Need at least a title and start_time to create an appointment.";
  const eventType = (() => {
    const t = (input.event_type as string | undefined)?.toLowerCase();
    return t === "install" || t === "delivery" || t === "personal" ? t : "appointment";
  })();

  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      title,
      event_type: eventType,
      assigned_to: resolveRole(input.person as string, ctx),
      start_time: new Date(startTime).toISOString(),
      end_time: input.end_time ? new Date(input.end_time as string).toISOString() : null,
      location: (input.location as string) || null,
      customer_id: (input.customer_id as string) || null,
      job_id: (input.job_id as string) || null,
      notes: (input.notes as string) || null,
      status: "scheduled",
    })
    .select("id, start_time")
    .single();
  if (error) return `Could not create the appointment: ${error.message}`;
  return `Created ${eventType} "${title}" for ${personLabel(resolveRole(input.person as string, ctx))} on ${formatLocal(data.start_time as string)}. [${data.id}]`;
}

async function addJobNote(supabase: SupabaseClient, input: Json, ctx: AssistantContext): Promise<string> {
  const jobId = input.job_id as string;
  const content = (input.content as string)?.trim();
  if (!jobId || !content) return "Need a job_id and content to add a note.";
  const { data: job } = await supabase.from("jobs").select("title").eq("id", jobId).maybeSingle();
  if (!job) return "No job found with that id — look it up with search_jobs first.";
  const { error } = await supabase.from("job_notes").insert({ job_id: jobId, author: ctx.role, content });
  if (error) return `Could not add the note: ${error.message}`;
  return `Added a note to "${job.title}".`;
}

// ---- Additional read tools --------------------------------------------------

async function listJobFiles(supabase: SupabaseClient, input: Json): Promise<string> {
  const jobId = input.job_id as string;
  if (!jobId) return "Need a job_id — look it up with search_jobs first.";
  const { data: job } = await supabase.from("jobs").select("title").eq("id", jobId).maybeSingle();
  if (!job) return "No job found with that id.";

  const [att, draw, photos, contracts, docs] = await Promise.all([
    supabase.from("job_attachments").select("file_name, file_size, created_at").eq("job_id", jobId).order("created_at", { ascending: false }),
    supabase.from("job_drawings").select("label, updated_at").eq("job_id", jobId).order("updated_at", { ascending: false }),
    supabase.from("job_photos").select("caption, phase, created_at").eq("job_id", jobId).order("created_at", { ascending: false }),
    supabase.from("contract_documents").select("kind, file_name, amount, created_at").eq("job_id", jobId).order("created_at", { ascending: false }),
    supabase.from("documents").select("document_type, document_number, title, status").eq("job_id", jobId).order("created_at", { ascending: false }),
  ]);

  const lines: string[] = [`Files for "${job.title}":`];
  const a = att.data ?? [];
  const d = draw.data ?? [];
  const p = photos.data ?? [];
  const c = contracts.data ?? [];
  const g = docs.data ?? [];
  if (a.length) {
    lines.push(`Attachments (${a.length}):`);
    a.forEach((r) => lines.push(`  · ${r.file_name}${r.file_size ? ` (${Math.round((r.file_size as number) / 1024)} KB)` : ""}`));
  }
  if (d.length) {
    lines.push(`Drawings (${d.length}):`);
    d.forEach((r) => lines.push(`  · ${r.label || "Untitled"}`));
  }
  if (p.length) {
    lines.push(`Photos (${p.length}):`);
    p.forEach((r) => lines.push(`  · ${r.caption || "(no caption)"}${r.phase ? ` [${r.phase}]` : ""}`));
  }
  if (c.length) {
    lines.push(`Contract docs (${c.length}):`);
    c.forEach((r) => lines.push(`  · ${r.kind}${r.file_name ? `: ${r.file_name}` : ""}${r.amount != null ? ` — $${Number(r.amount).toFixed(0)}` : ""}`));
  }
  if (g.length) {
    lines.push(`Generated documents (${g.length}):`);
    g.forEach((r) => lines.push(`  · ${r.document_type} ${r.document_number || ""} — ${r.title || ""} (${r.status})`));
  }
  if (lines.length === 1) lines.push("(no files yet)");
  return lines.join("\n");
}

async function readTeamChat(supabase: SupabaseClient, input: Json): Promise<string> {
  const limit = Math.min(Number(input.limit) || 20, 50);
  const { data, error } = await supabase
    .from("chat_messages")
    .select("sender_email, content, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return `Error reading chat: ${error.message}`;
  if (!data?.length) return "No chat messages yet.";
  return data
    .slice()
    .reverse()
    .map((m) => `${personLabel(roleForEmail(m.sender_email as string))} (${formatLocal(m.created_at as string)}): ${m.content}`)
    .join("\n");
}

// Maps a chat sender email to the stored role label used elsewhere.
function roleForEmail(email: string | null | undefined): TeamRole | string {
  const e = (email ?? "").toLowerCase();
  if (e === "carol@coastaledgedesign.com") return "designer";
  if (e === "thetravisj1989@gmail.com") return "owner";
  return e.split("@")[0] || "Unknown";
}

async function listDocuments(supabase: SupabaseClient, input: Json): Promise<string> {
  let q = supabase
    .from("documents")
    .select("document_type, document_number, title, status, due_date, job:jobs(title)")
    .order("created_at", { ascending: false })
    .limit(40);
  if (input.job_id) q = q.eq("job_id", input.job_id as string);
  if (input.document_type) q = q.eq("document_type", input.document_type as string);
  if (input.status) q = q.eq("status", input.status as string);
  const { data, error } = await q;
  if (error) return `Error listing documents: ${error.message}`;
  if (!data?.length) return "No matching documents found.";
  return data
    .map((r) => {
      const job = r.job as { title?: string } | null;
      return `- ${r.document_type} ${r.document_number || ""} "${r.title || ""}" · ${r.status}${job?.title ? ` · job: ${job.title}` : ""}${r.due_date ? ` · due ${r.due_date}` : ""}`;
    })
    .join("\n");
}

async function listEstimates(supabase: SupabaseClient, input: Json): Promise<string> {
  let q = supabase
    .from("estimates")
    .select("name, status, margin, created_at, job:jobs(title)")
    .order("created_at", { ascending: false })
    .limit(40);
  if (input.job_id) q = q.eq("job_id", input.job_id as string);
  const { data, error } = await q;
  if (error) return `Error listing estimates: ${error.message}`;
  if (!data?.length) return "No estimates found.";
  return data
    .map((r) => {
      const job = r.job as { title?: string } | null;
      return `- "${r.name}" · ${r.status || "draft"}${r.margin != null ? ` · margin ${r.margin}%` : ""}${job?.title ? ` · job: ${job.title}` : ""}`;
    })
    .join("\n");
}

async function searchPricing(supabase: SupabaseClient, input: Json): Promise<string> {
  const query = (input.query as string | undefined)?.trim();
  const limit = Math.min(Number(input.limit) || 20, 50);
  const { data, error } = await supabase
    .from("pricing_items")
    .select("name, category, unit, unit_price")
    .eq("is_active", true)
    .order("category")
    .limit(500);
  if (error) return `Error searching pricing: ${error.message}`;
  let rows = data ?? [];
  if (query) {
    const ql = query.toLowerCase();
    rows = rows.filter((r) => `${r.name ?? ""} ${r.category ?? ""}`.toLowerCase().includes(ql));
  }
  rows = rows.slice(0, limit);
  if (!rows.length) return "No matching pricing items found.";
  return rows
    .map((r) => `- ${r.name}${r.category ? ` [${r.category}]` : ""}: $${Number(r.unit_price ?? 0).toFixed(2)}${r.unit ? ` / ${r.unit}` : ""}`)
    .join("\n");
}

async function listMaterialOrders(supabase: SupabaseClient, input: Json): Promise<string> {
  const jobId = input.job_id as string;
  if (!jobId) return "Need a job_id — look it up with search_jobs first.";
  const { data, error } = await supabase
    .from("material_orders")
    .select("vendor, description, ordered_at, estimated_arrival, actual_arrival")
    .eq("job_id", jobId)
    .order("ordered_at", { ascending: false });
  if (error) return `Error listing material orders: ${error.message}`;
  if (!data?.length) return "No material orders for that job.";
  return data
    .map(
      (m) =>
        `- ${m.vendor}${m.description ? ` — ${m.description}` : ""}${m.actual_arrival ? ` (arrived ${m.actual_arrival})` : m.estimated_arrival ? ` (est. arrival ${m.estimated_arrival})` : m.ordered_at ? ` (ordered ${m.ordered_at})` : ""}`,
    )
    .join("\n");
}

async function getMoneySummary(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "title, contract_amount, retainer_amount, pay_deposit_paid, pay_deposit_amount, pay_deposit_paid_at, pay_delivery_paid, pay_delivery_amount, pay_delivery_paid_at, pay_completion_paid, pay_completion_amount, pay_completion_paid_at, change_orders_paid, change_orders_paid_at, contract_documents(kind, amount)",
    );
  if (error) return `Error building money summary: ${error.message}`;
  const rows = data ?? [];
  const since = new Date(Date.now() - 7 * 86400000);
  let outstanding = 0;
  let received7 = 0;
  const owing: string[] = [];
  for (const j of rows) {
    const docs = (j.contract_documents as { kind: string; amount: number | null }[]) ?? [];
    const docContract = docs.filter((d) => d.kind !== "change_order").reduce((s, d) => s + (d.amount ?? 0), 0);
    const contract = docContract || Number(j.contract_amount ?? 0);
    const co = docs.filter((d) => d.kind === "change_order").reduce((s, d) => s + (d.amount ?? 0), 0);
    const bal = jobBalance(j as unknown as JobPaymentFields, contract, co);
    outstanding += bal.balanceDue;
    received7 += jobPaidSince(j as unknown as JobPaymentFields, contract, co, since);
    if (bal.balanceDue > 0.5) owing.push(`  · ${j.title}: $${bal.balanceDue.toFixed(0)} due`);
  }
  const lines = [
    `Total outstanding across all jobs: $${outstanding.toFixed(0)}`,
    `Payments received in the last 7 days: $${received7.toFixed(0)}`,
  ];
  if (owing.length) {
    lines.push(`Jobs still owing (${owing.length}):`);
    lines.push(...owing);
  } else {
    lines.push("No jobs currently owe a balance.");
  }
  return lines.join("\n");
}

// ---- Additional action tools ------------------------------------------------

async function attachFileToJob(supabase: SupabaseClient, input: Json, ctx: AssistantContext): Promise<string> {
  const jobId = input.job_id as string;
  if (!jobId) return "Need a job_id — look it up with search_jobs first.";
  const staged = ctx.attachments ?? [];
  if (!staged.length) return "No file is attached to this message. Ask the user to attach the file, then try again.";
  const { data: job } = await supabase.from("jobs").select("title").eq("id", jobId).maybeSingle();
  if (!job) return "No job found with that id.";

  const wanted = (input.file_name as string | undefined)?.trim().toLowerCase();
  const targets = wanted ? staged.filter((s) => s.file_name.toLowerCase() === wanted) : staged;
  if (!targets.length) return `None of the attached files match "${input.file_name}". Attached: ${staged.map((s) => s.file_name).join(", ")}.`;

  const filed: string[] = [];
  for (const f of targets) {
    const destPath = `${jobId}/${Date.now()}-${f.file_name}`;
    // Move the staged object into the job's folder (copy then remove staging).
    const { error: copyErr } = await supabase.storage.from("job-attachments").copy(f.storage_path, destPath);
    if (copyErr) return `Could not file "${f.file_name}": ${copyErr.message}`;
    await supabase.storage.from("job-attachments").remove([f.storage_path]);
    const { error: insErr } = await supabase
      .from("job_attachments")
      .insert({ job_id: jobId, storage_path: destPath, file_name: f.file_name, file_size: f.file_size ?? null });
    if (insErr) return `Filed the upload but could not record it: ${insErr.message}`;
    filed.push(f.file_name);
  }
  return `Filed ${filed.length} file(s) into "${job.title}": ${filed.join(", ")}.`;
}

async function updateJob(supabase: SupabaseClient, input: Json, ctx: AssistantContext): Promise<string> {
  const jobId = input.job_id as string;
  if (!jobId) return "Need a job_id — look it up with search_jobs first.";
  const patch: Record<string, unknown> = {};
  const stages = ["lead", "proposal_sent", "contract_signed", "in_progress", "in_install", "finished", "cancelled"];
  if (input.stage) {
    const s = String(input.stage).toLowerCase();
    if (!stages.includes(s)) return `Invalid stage "${input.stage}". Valid: ${stages.join(", ")}.`;
    patch.stage = s;
  }
  if (input.assigned_to) patch.assigned_to = resolveRole(input.assigned_to as string, ctx);
  if (input.start_date) patch.start_date = input.start_date;
  if (input.estimated_end_date) patch.estimated_end_date = input.estimated_end_date;
  if (input.job_address !== undefined) patch.job_address = input.job_address;
  if (input.contract_amount !== undefined) patch.contract_amount = Number(input.contract_amount);
  if (input.description !== undefined) patch.description = input.description;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (!Object.keys(patch).length) return "Nothing to update — specify at least one field.";

  const { data, error } = await supabase.from("jobs").update(patch).eq("id", jobId).select("title").maybeSingle();
  if (error) return `Could not update the job: ${error.message}`;
  if (!data) return "No job found with that id.";
  return `Updated "${data.title}" (${Object.keys(patch).join(", ")}).`;
}

async function createCustomer(supabase: SupabaseClient, input: Json): Promise<string> {
  const firstName = (input.first_name as string)?.trim();
  if (!firstName) return "Need at least a first name to create a customer.";
  const { data, error } = await supabase
    .from("customers")
    .insert({
      first_name: firstName,
      last_name: (input.last_name as string) || null,
      email: (input.email as string) || null,
      phone: (input.phone as string) || null,
      address_line1: (input.address_line1 as string) || null,
      city: (input.city as string) || null,
      state: (input.state as string) || null,
      zip: (input.zip as string) || null,
      notes: (input.notes as string) || null,
    })
    .select("id, first_name, last_name")
    .single();
  if (error) return `Could not create the customer: ${error.message}`;
  return `Created customer ${`${data.first_name ?? ""} ${data.last_name ?? ""}`.trim()}. [${data.id}]`;
}

async function updateCommission(supabase: SupabaseClient, input: Json): Promise<string> {
  let commissionId = input.commission_id as string | undefined;
  if (!commissionId && input.job_id) {
    const { data } = await supabase
      .from("designer_commissions")
      .select("id")
      .eq("job_id", input.job_id as string)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    commissionId = data?.id;
  }
  if (!commissionId) return "Couldn't identify which commission — pass a commission_id or job_id.";

  const patch: Record<string, unknown> = {};
  if (input.mark_paid) {
    patch.status = "paid";
    patch.paid_at = new Date().toISOString();
    if (input.paid_amount !== undefined) patch.paid_amount = Number(input.paid_amount);
    if (input.payment_method) patch.payment_method = input.payment_method;
  }
  if (input.amount !== undefined) patch.amount = Number(input.amount);
  if (input.notes !== undefined) patch.notes = input.notes;
  if (!Object.keys(patch).length) return "Nothing to update on the commission.";

  const { error } = await supabase.from("designer_commissions").update(patch).eq("id", commissionId);
  if (error) return `Could not update the commission: ${error.message}`;
  return input.mark_paid ? "Marked the commission as paid." : "Updated the commission.";
}

async function setPaymentMilestone(supabase: SupabaseClient, input: Json): Promise<string> {
  const jobId = input.job_id as string;
  const milestone = String(input.milestone || "").toLowerCase();
  const paid = input.paid === undefined ? true : Boolean(input.paid);
  const valid = ["deposit", "delivery", "completion", "change_orders"];
  if (!jobId) return "Need a job_id — look it up with search_jobs first.";
  if (!valid.includes(milestone)) return `Invalid milestone "${input.milestone}". Valid: ${valid.join(", ")}.`;

  const paidCol = milestone === "change_orders" ? "change_orders_paid" : `pay_${milestone}_paid`;
  const atCol = milestone === "change_orders" ? "change_orders_paid_at" : `pay_${milestone}_paid_at`;
  const patch: Record<string, unknown> = { [paidCol]: paid, [atCol]: paid ? new Date().toISOString() : null };

  const { data, error } = await supabase.from("jobs").update(patch).eq("id", jobId).select("title").maybeSingle();
  if (error) return `Could not update the milestone: ${error.message}`;
  if (!data) return "No job found with that id.";
  return `Marked ${milestone.replace("_", " ")} ${paid ? "paid" : "unpaid"} on "${data.title}".`;
}

// ---- Task tools -------------------------------------------------------------

function taskTimeLabel(due: string | null, time: string | null): string {
  if (!due) return "no due date";
  const at = time && /^\d{2}:\d{2}$/.test(time) ? ` ${time}` : "";
  return `due ${due}${at}`;
}

// Resolves a task by explicit id, else by matching title text (open tasks first).
async function findTask(
  supabase: SupabaseClient,
  input: Json,
): Promise<{ id: string; title: string; calendar_event_id: string | null } | null> {
  if (input.task_id) {
    const { data } = await supabase.from("tasks").select("id, title, calendar_event_id").eq("id", input.task_id as string).maybeSingle();
    return data ?? null;
  }
  const title = (input.title as string | undefined)?.trim().toLowerCase();
  if (!title) return null;
  const { data } = await supabase.from("tasks").select("id, title, calendar_event_id, status").order("status").limit(200);
  const rows = data ?? [];
  return rows.find((t) => (t.title as string)?.toLowerCase().includes(title)) ?? null;
}

async function listTasks(supabase: SupabaseClient, input: Json, ctx: AssistantContext): Promise<string> {
  const status = (input.status as string | undefined)?.toLowerCase() === "done" ? "done" : "open";
  let q = supabase
    .from("tasks")
    .select("id, title, due_date, due_time, assigned_to, status, job:jobs(title)")
    .eq("status", status)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(100);
  if (input.person) q = q.eq("assigned_to", resolveRole(input.person as string, ctx));
  if (input.job_id) q = q.eq("job_id", input.job_id as string);
  const { data, error } = await q;
  if (error) return `Error listing tasks: ${error.message}`;
  if (!data?.length) return status === "open" ? "No open tasks." : "No completed tasks.";
  return data
    .map((t) => {
      const job = t.job as { title?: string } | null;
      return `- [${t.id}] ${t.title} · ${taskTimeLabel(t.due_date as string, t.due_time as string)} · ${personLabel(t.assigned_to)}${job?.title ? ` · job: ${job.title}` : ""}`;
    })
    .join("\n");
}

async function createTaskTool(supabase: SupabaseClient, input: Json, ctx: AssistantContext): Promise<string> {
  const title = (input.title as string)?.trim();
  if (!title) return "Need a title to create a task.";
  const assigned = resolveRole(input.person as string, ctx);
  const dueDate = (input.due_date as string | undefined)?.trim() || null;
  const dueTime = (input.due_time as string | undefined)?.trim();
  const validTime = dueTime && /^\d{2}:\d{2}$/.test(dueTime) ? dueTime : null;

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description: (input.description as string) || null,
      due_date: dueDate,
      due_time: validTime,
      assigned_to: assigned,
      job_id: (input.job_id as string) || null,
      status: "open",
      created_by: ctx.role,
    })
    .select("id")
    .single();
  if (error) return `Could not create the task: ${error.message}`;

  if (dueDate && task) {
    const { data: ev } = await supabase
      .from("calendar_events")
      .insert({
        title: `Task: ${title}`,
        event_type: "task",
        assigned_to: assigned,
        job_id: (input.job_id as string) || null,
        start_time: taskCalendarStart(dueDate, validTime),
        status: "scheduled",
      })
      .select("id")
      .single();
    if (ev) await supabase.from("tasks").update({ calendar_event_id: ev.id }).eq("id", task.id);
  }
  return `Created task "${title}" for ${personLabel(assigned)} (${taskTimeLabel(dueDate, validTime)}).`;
}

async function setTaskStatus(supabase: SupabaseClient, input: Json, status: "open" | "done"): Promise<string> {
  const task = await findTask(supabase, input);
  if (!task) return "Couldn't find that task — try list_tasks to get its id.";
  const patch: Record<string, unknown> =
    status === "done"
      ? { status: "done", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      : { status: "open", completed_at: null, last_reminded_on: null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
  if (error) return `Could not update the task: ${error.message}`;
  if (task.calendar_event_id) {
    await supabase.from("calendar_events").update({ status: status === "done" ? "cancelled" : "scheduled" }).eq("id", task.calendar_event_id);
  }
  return status === "done" ? `Marked "${task.title}" done.` : `Reopened "${task.title}".`;
}

async function updateTaskTool(supabase: SupabaseClient, input: Json, ctx: AssistantContext): Promise<string> {
  const task = await findTask(supabase, input);
  if (!task) return "Couldn't find that task — try list_tasks to get its id.";
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.new_title) patch.title = String(input.new_title).trim();
  if (input.due_date !== undefined) patch.due_date = (input.due_date as string) || null;
  if (input.due_time !== undefined) {
    const t = (input.due_time as string)?.trim();
    patch.due_time = t && /^\d{2}:\d{2}$/.test(t) ? t : null;
  }
  if (input.person) patch.assigned_to = resolveRole(input.person as string, ctx);
  if (input.job_id !== undefined) patch.job_id = (input.job_id as string) || null;
  if (Object.keys(patch).length === 1) return "Nothing to change — specify a new value.";

  const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
  if (error) return `Could not update the task: ${error.message}`;

  // Keep the linked calendar reminder in sync with date/time/title/owner changes.
  if (task.calendar_event_id) {
    const evPatch: Record<string, unknown> = {};
    if (patch.title) evPatch.title = `Task: ${patch.title}`;
    if (patch.assigned_to) evPatch.assigned_to = patch.assigned_to;
    if (input.job_id !== undefined) evPatch.job_id = (input.job_id as string) || null;
    if (input.due_date !== undefined || input.due_time !== undefined) {
      const { data: cur } = await supabase.from("tasks").select("due_date, due_time").eq("id", task.id).maybeSingle();
      if (cur?.due_date) evPatch.start_time = taskCalendarStart(cur.due_date as string, cur.due_time as string);
    }
    if (Object.keys(evPatch).length) await supabase.from("calendar_events").update(evPatch).eq("id", task.calendar_event_id);
  }
  return `Updated "${task.title}".`;
}

async function deleteTaskTool(supabase: SupabaseClient, input: Json): Promise<string> {
  const task = await findTask(supabase, input);
  if (!task) return "Couldn't find that task — try list_tasks to get its id.";
  if (task.calendar_event_id) await supabase.from("calendar_events").delete().eq("id", task.calendar_event_id);
  const { error } = await supabase.from("tasks").delete().eq("id", task.id);
  if (error) return `Could not delete the task: ${error.message}`;
  return `Deleted "${task.title}".`;
}
