"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, Send, Loader2 } from "lucide-react";

// The full conversation (including tool-call turns) is held opaquely and
// round-tripped to the server; the widget never constructs provider-specific
// message shapes — it just stores what the server returns and resends it.
type Bubble = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "What's on my calendar this week?",
  "Which jobs still owe money?",
  "Add a note to a job",
];

export function AssistantWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const convo = useRef<unknown[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, open, sending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput("");
    setBubbles((b) => [...b, { role: "user", text: trimmed }]);
    setSending(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: convo.current, message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBubbles((b) => [...b, { role: "assistant", text: data.detail || data.error || "Something went wrong. Try again." }]);
      } else {
        if (Array.isArray(data.messages) && data.messages.length) convo.current = data.messages;
        setBubbles((b) => [...b, { role: "assistant", text: data.reply || "(no response)" }]);
        // An action may have changed data on the current page — refresh it.
        router.refresh();
      }
    } catch (e) {
      setBubbles((b) => [...b, { role: "assistant", text: `Couldn't reach the assistant: ${String(e)}` }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          className="fixed z-40 bottom-20 right-4 md:bottom-6 md:right-6 h-14 w-14 rounded-full bg-slate-900 text-white shadow-lg flex items-center justify-center hover:bg-slate-800 transition-colors"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed z-50 inset-x-0 bottom-0 md:inset-auto md:bottom-6 md:right-6 md:w-[400px] flex flex-col bg-white md:rounded-2xl shadow-2xl border h-[80vh] md:h-[600px] max-h-screen">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-900 text-white md:rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <span className="font-semibold text-sm">Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close assistant" className="p-1 rounded hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {bubbles.length === 0 && (
              <div className="text-center py-6 space-y-4">
                <p className="text-sm text-slate-500">Ask about jobs, customers, the calendar, or commissions — or have me schedule something or jot a note.</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-sm text-left px-3 py-2 rounded-lg border hover:bg-slate-50 text-slate-700"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {bubbles.map((b, i) => (
              <div key={i} className={b.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    b.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {b.text}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 bg-slate-100 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t p-2 flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask me anything…"
              className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm max-h-32 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <button
              onClick={() => send(input)}
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="h-9 w-9 shrink-0 rounded-lg bg-slate-900 text-white flex items-center justify-center disabled:opacity-40 hover:bg-slate-800"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
