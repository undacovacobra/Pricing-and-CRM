// Tool definitions + executors for the in-app AI assistant.
//
// Every tool runs against the *authenticated* Supabase server client, so row-
// level security applies exactly as it would for the logged-in user. Read tools
// answer questions; action tools (create_appointment, add_job_note) make
// changes. Executors return human-readable strings — the model reads them back.

import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_TIME_ZONE, formatTime } from "@/components/calendar/eventStyles";

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

export interface AssistantContext {
  // Who is chatting — resolves "me"/"my" and attributes notes.
  role: TeamRole;
  name: string;
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
