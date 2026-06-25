import { NextResponse, type NextRequest } from "next/server";
import { GoogleGenAI, type FunctionDeclaration } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import { userNameForEmail } from "@/lib/team";
import { GEMINI_TOOL_DECLARATIONS, executeAssistantTool, type AssistantContext, type TeamRole } from "@/lib/assistant/tools";
import { APP_TIME_ZONE } from "@/components/calendar/eventStyles";

export const maxDuration = 120;

const MODEL = "gemini-2.5-flash";
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
    "You can look up jobs, customers, calendar appointments, and designer commissions, and you can take two actions: create calendar appointments and add notes to jobs.",
    "",
    "Guidelines:",
    "- Be concise and friendly. These are busy people in the field, often on a phone.",
    "- Use the tools to answer from real data — never guess at job details, balances, or schedules.",
    "- To act on a named customer or job, first look up its id with search_customers / search_jobs, then pass that id to the action tool so it links correctly.",
    "- Before creating an appointment or adding a note, make sure you have what you need (for an appointment: a clear title, a specific date AND time, and who it's for). If something essential is missing or ambiguous, ask a brief clarifying question instead of guessing.",
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
  try {
    const body = await request.json();
    if (Array.isArray(body.messages)) history = body.messages;
    message = String(body.message ?? "").trim();
    if (!message) throw new Error("empty message");
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const name = userNameForEmail(user.email) || "there";
  const role: TeamRole = (user.email ?? "").toLowerCase() === "carol@coastaledgedesign.com" ? "designer" : "owner";
  const ctx: AssistantContext = { role, name };

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents: Content[] = [...history, { role: "user", parts: [{ text: message }] }];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: systemPrompt(ctx),
          tools: [{ functionDeclarations: GEMINI_TOOL_DECLARATIONS as unknown as FunctionDeclaration[] }],
        },
      });

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
    return NextResponse.json({ error: "assistant_failed", detail: String(e) }, { status: 502 });
  }
}
