import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userNameForEmail } from "@/lib/team";
import { OPENAI_TOOLS, executeAssistantTool, type AssistantContext, type TeamRole, type StagedAttachment } from "@/lib/assistant/tools";
import { APP_TIME_ZONE } from "@/components/calendar/eventStyles";

export const maxDuration = 120;

// Groq's OpenAI-compatible endpoint. llama-3.3-70b-versatile supports tool use
// and has a far more generous (and reliable) free tier than Gemini's free tier.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const MAX_TURNS = 8; // safety cap on the tool-use loop

// OpenAI/Groq chat message shapes (subset we use).
interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

function systemPrompt(ctx: AssistantContext): string {
  const now = new Date();
  const localNow = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);
  return [
    "You are the in-app assistant for Coastal Edge Cabinetry and Design, a small kitchen cabinet & countertop business run by Travis (the owner) and Carol (the designer).",
    `You are talking to ${ctx.name} (role: ${ctx.role === "owner" ? "owner / Travis" : "designer / Carol"}). When they say "me" or "my", they mean themselves.`,
    `The business operates in the ${APP_TIME_ZONE} timezone. The current date and time there is ${localNow} (ISO instant: ${now.toISOString()}). Use this — in ${APP_TIME_ZONE} — to resolve "today", "tomorrow", "next week", etc.`,
    `When you call create_appointment, give start_time as an ISO 8601 datetime with an explicit UTC offset for ${APP_TIME_ZONE} (e.g. -04:00 during daylight time, -05:00 during standard time) — never a bare datetime with no offset.`,
    "",
    "You have broad access to the whole app. You can look up and report on jobs, customers, calendar appointments, tasks, commissions, the team chat, a job's files/drawings/photos/documents, estimates, the pricing catalog, material orders, and a business-wide money summary.",
    "You can also make changes: create calendar appointments, create/update/complete/reopen/delete tasks, add job notes, update jobs (stage, dates, assignee, contract amount, etc.), create customers, mark payment milestones and commissions paid, and file user-attached documents into a job.",
    "Tasks with a due date show on the calendar and remind the owner daily until done. When completing/updating a task the user names, you can pass its title instead of an id.",
    "",
    "Guidelines:",
    "- Be concise and friendly. These are busy people in the field, often on a phone.",
    "- Use the tools to answer from real data — never guess at job details, balances, files, or schedules.",
    "- To act on a named customer or job, first look up its id with search_customers / search_jobs, then pass that id to the action tool so it links correctly.",
    "- Before an action that changes data (creating, updating, marking paid, filing a file), make sure you have what you need. If something essential is missing or ambiguous, ask a brief clarifying question instead of guessing.",
    "- When the user attaches a file and asks to put it in a job, use search_jobs to find the job, then attach_file_to_job. The attached file is already uploaded — you just file it.",
    "- After taking an action, confirm what you did in one short sentence.",
    `- Interpret bare times the user mentions as ${APP_TIME_ZONE} local time.`,
  ].join("\n");
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({
      reply: "The assistant isn't turned on yet — a free GROQ_API_KEY needs to be added to the app's environment variables (get one at console.groq.com). Once it's set I'll be able to help.",
      messages: [],
      notConfigured: true,
    });
  }

  let history: ChatMessage[] = [];
  let message = "";
  let attachments: StagedAttachment[] = [];
  try {
    const body = await request.json();
    // Keep only the conversational turns; the system prompt is re-added fresh
    // each request (so "current time" stays correct and old shapes can't leak).
    if (Array.isArray(body.messages)) {
      history = (body.messages as ChatMessage[]).filter((m) => m && m.role && m.role !== "system");
    }
    message = String(body.message ?? "").trim();
    if (Array.isArray(body.attachments)) {
      attachments = body.attachments
        .filter((a: unknown): a is StagedAttachment => !!a && typeof (a as StagedAttachment).storage_path === "string")
        .map((a: StagedAttachment) => ({
          file_name: String(a.file_name),
          storage_path: String(a.storage_path),
          file_size: a.file_size,
          file_type: a.file_type,
        }));
    }
    if (!message && !attachments.length) throw new Error("empty message");
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const name = userNameForEmail(user.email) || "there";
  const role: TeamRole = (user.email ?? "").toLowerCase() === "carol@coastaledgedesign.com" ? "designer" : "owner";
  const ctx: AssistantContext = { role, name, attachments };

  // Let the model know what files came with this turn so it can offer to file them.
  const userText = attachments.length
    ? `${message || "(no message)"}\n\n[Attached file(s) ready to file into a job: ${attachments.map((a) => a.file_name).join(", ")}]`
    : message;

  // System prompt is prepended for the API call but NOT returned to the client.
  const convo: ChatMessage[] = [...history, { role: "user", content: userText }];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Call Groq, retrying transient 5xx/overload responses with backoff.
  async function callGroq(messages: ChatMessage[]): Promise<ChatMessage> {
    let lastDetail = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "system", content: systemPrompt(ctx) }, ...messages],
          tools: OPENAI_TOOLS,
          tool_choice: "auto",
          temperature: 0.3,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const msg = data.choices?.[0]?.message as ChatMessage | undefined;
        if (!msg) throw new Error("no_choice");
        return msg;
      }

      lastDetail = await res.text().catch(() => "");
      // 429 = rate limited (give up immediately, it won't clear in-request);
      // 5xx = transient, retry with backoff.
      if (res.status === 429) throw new Error(`RATE_LIMIT:${lastDetail}`);
      if (res.status >= 500 && attempt < 2) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      throw new Error(`GROQ_${res.status}:${lastDetail}`);
    }
    throw new Error(`GROQ_RETRY_EXHAUSTED:${lastDetail}`);
  }

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const msg = await callGroq(convo);
      convo.push(msg);

      const calls = msg.tool_calls ?? [];
      if (calls.length === 0) {
        const reply = (msg.content ?? "").trim() || "I didn't catch that — could you rephrase?";
        return NextResponse.json({ reply, messages: convo });
      }

      // Execute each requested tool and feed results back as tool messages.
      for (const call of calls) {
        let input: Record<string, unknown> = {};
        try {
          input = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          input = {};
        }
        let out: string;
        try {
          out = await executeAssistantTool(supabase, call.function.name, input, ctx);
        } catch (e) {
          out = `Tool error: ${String(e)}`;
        }
        convo.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: out });
      }
    }

    return NextResponse.json({
      reply: "Sorry — that took more steps than I expected. Could you rephrase or break it into smaller asks?",
      messages: convo,
    });
  } catch (e) {
    const msg = String(e);
    if (msg.startsWith("Error: RATE_LIMIT") || msg.includes("RATE_LIMIT")) {
      return NextResponse.json({
        reply: "I've hit the usage limit for the moment — please try again in a little bit.",
        messages: convo,
      });
    }
    if (msg.includes("GROQ_5") || msg.includes("RETRY_EXHAUSTED") || msg.includes("overloaded")) {
      return NextResponse.json({
        reply: "The AI service is briefly unavailable. Give it a few seconds and try again.",
        messages: convo,
      });
    }
    return NextResponse.json({ error: "assistant_failed", detail: msg }, { status: 502 });
  }
}
