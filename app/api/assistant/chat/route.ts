import { NextResponse, type NextRequest } from "next/server";
import { GoogleGenAI, type FunctionDeclaration } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import { userNameForEmail } from "@/lib/team";
import { GEMINI_TOOL_DECLARATIONS, executeAssistantTool, type AssistantContext, type TeamRole, type StagedAttachment } from "@/lib/assistant/tools";
import { APP_TIME_ZONE } from "@/components/calendar/eventStyles";

export const maxDuration = 120;

// flash-lite has a far higher free-tier daily request quota than flash
// (~1000/day vs ~20/day), which matters because every tool-using turn is a
// separate request. Plenty capable for lookups, reminders, and notes.
const MODEL = "gemini-2.5-flash-lite";
const MAX_TURNS = 8; // safety cap on the tool-use loop

// Gemini conversation shapes (subset we use).
interface Part {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
interface Content {
  role: string; // "user" | "model"
  parts: Part[];
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

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({
      reply: "The assistant isn't turned on yet — a free GEMINI_API_KEY needs to be added to the app's environment variables (get one at aistudio.google.com). Once it's set I'll be able to help.",
      messages: [],
      notConfigured: true,
    });
  }

  let history: Content[] = [];
  let message = "";
  let attachments: StagedAttachment[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body.messages)) history = body.messages;
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

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents: Content[] = [...history, { role: "user", parts: [{ text: userText }] }];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // The model occasionally returns a transient 503 ("high demand"). Retry a few
  // times with growing backoff so these blips recover without bothering the user.
  async function generateWithRetry() {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await ai.models.generateContent({
          model: MODEL,
          contents,
          config: {
            systemInstruction: systemPrompt(ctx),
            tools: [{ functionDeclarations: GEMINI_TOOL_DECLARATIONS as unknown as FunctionDeclaration[] }],
          },
        });
      } catch (err) {
        lastErr = err;
        const m = String(err);
        const transient = m.includes("503") || m.includes("UNAVAILABLE") || m.includes("overloaded");
        if (!transient || attempt === 2) throw err;
        await sleep(800 * (attempt + 1)); // 0.8s, then 1.6s
      }
    }
    throw lastErr;
  }

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await generateWithRetry();

      const modelContent: Content = (response.candidates?.[0]?.content as Content) ?? { role: "model", parts: [] };
      contents.push(modelContent);

      const calls = (modelContent.parts ?? [])
        .map((p) => p.functionCall)
        .filter((c): c is { name: string; args?: Record<string, unknown> } => !!c);

      if (calls.length === 0) {
        const reply =
          (modelContent.parts ?? [])
            .map((p) => p.text)
            .filter(Boolean)
            .join("\n")
            .trim() ||
          response.text ||
          "I didn't catch that — could you rephrase?";
        return NextResponse.json({ reply, messages: contents });
      }

      // Execute each tool; Gemini expects results back in a user-role turn
      // carrying functionResponse parts.
      const respParts: Part[] = [];
      for (const call of calls) {
        let out: string;
        try {
          out = await executeAssistantTool(supabase, call.name, (call.args ?? {}) as Record<string, unknown>, ctx);
        } catch (e) {
          out = `Tool error: ${String(e)}`;
        }
        respParts.push({ functionResponse: { name: call.name, response: { result: out } } });
      }
      contents.push({ role: "user", parts: respParts });
    }

    return NextResponse.json({
      reply: "Sorry — that took more steps than I expected. Could you rephrase or break it into smaller asks?",
      messages: contents,
    });
  } catch (e) {
    const msg = String(e);
    // Free-tier quota exhausted — show a calm, human message (200 so the widget
    // renders it as a normal reply and the voice mode reads it out) rather than
    // a raw API error dump.
    if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429")) {
      const m = msg.match(/retry in ([\d.]+)s/i) || msg.match(/"retryDelay":"(\d+)s"/);
      const secs = m ? Math.ceil(Number(m[1])) : null;
      const when = secs && secs > 90 ? "in a little while" : secs ? `in about ${secs} seconds` : "in a bit";
      return NextResponse.json({
        reply: `I've hit the free usage limit for the moment — please try again ${when}.`,
        messages: contents,
      });
    }
    // Transient overload that survived the retries above.
    if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("overloaded")) {
      return NextResponse.json({
        reply: "The AI service is briefly overloaded right now. Give it a few seconds and try again.",
        messages: contents,
      });
    }
    return NextResponse.json({ error: "assistant_failed", detail: msg }, { status: 502 });
  }
}
