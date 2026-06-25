import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { userNameForEmail } from "@/lib/team";
import { ASSISTANT_TOOLS, executeAssistantTool, type AssistantContext, type TeamRole } from "@/lib/assistant/tools";

export const maxDuration = 120;

const MODEL = "claude-opus-4-8";
const MAX_TURNS = 8; // safety cap on the tool-use loop

function systemPrompt(ctx: AssistantContext): string {
  const now = new Date();
  return [
    "You are the in-app assistant for Coastal Edge Cabinetry and Design, a small kitchen cabinet & countertop business run by Travis (the owner) and Carol (the designer).",
    `You are talking to ${ctx.name} (role: ${ctx.role === "owner" ? "owner / Travis" : "designer / Carol"}). When they say "me" or "my", they mean themselves.`,
    `The current date and time is ${now.toString()} (ISO: ${now.toISOString()}). Use this to resolve "today", "tomorrow", "next week", etc.`,
    "",
    "You can look up jobs, customers, calendar appointments, and designer commissions, and you can take two actions: create calendar appointments and add notes to jobs.",
    "",
    "Guidelines:",
    "- Be concise and friendly. These are busy people in the field, often on a phone.",
    "- Use the tools to answer from real data — never guess at job details, balances, or schedules.",
    "- To act on a named customer or job, first look up its id with search_customers / search_jobs, then pass that id to the action tool so it links correctly.",
    "- Before creating an appointment or adding a note, make sure you have what you need (for an appointment: a clear title, a specific date AND time, and who it's for). If something essential is missing or ambiguous, ask a brief clarifying question instead of guessing.",
    "- After taking an action, confirm what you did in one short sentence.",
    "- When giving times, use the business's local context; interpret bare times as the user's local time.",
  ].join("\n");
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      reply: "The assistant isn't turned on yet — an ANTHROPIC_API_KEY needs to be added to the app's environment variables. Once it's set I'll be able to help.",
      messages: [],
      notConfigured: true,
    });
  }

  let incoming: Anthropic.MessageParam[];
  try {
    const body = await request.json();
    incoming = body.messages;
    if (!Array.isArray(incoming) || incoming.length === 0) throw new Error("no messages");
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Determine who's chatting from their email.
  const name = userNameForEmail(user.email) || "there";
  const role: TeamRole = (user.email ?? "").toLowerCase() === "carol@coastaledgedesign.com" ? "designer" : "owner";
  const ctx: AssistantContext = { role, name };

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [...incoming];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        system: systemPrompt(ctx),
        tools: ASSISTANT_TOOLS,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        const reply = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return NextResponse.json({ reply, messages });
      }

      // Execute every requested tool, return all results in one user turn.
      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        let out: string;
        let isError = false;
        try {
          out = await executeAssistantTool(supabase, tu.name, (tu.input ?? {}) as Record<string, unknown>, ctx);
        } catch (e) {
          out = `Tool error: ${String(e)}`;
          isError = true;
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out, is_error: isError });
      }
      messages.push({ role: "user", content: results });
    }

    return NextResponse.json({
      reply: "Sorry — that took more steps than I expected. Could you rephrase or break it into smaller asks?",
      messages,
    });
  } catch (e) {
    return NextResponse.json({ error: "assistant_failed", detail: String(e) }, { status: 502 });
  }
}
