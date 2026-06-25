"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, Send, Loader2, Paperclip, HardDrive, Mic, MicOff, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { openDrivePicker, pickerConfigured } from "@/lib/google/picker";
import { useVoice } from "@/lib/voice/useVoice";

// The full conversation (including tool-call turns) is held opaquely and
// round-tripped to the server; the widget never constructs provider-specific
// message shapes — it just stores what the server returns and resends it.
type Bubble = { role: "user" | "assistant"; text: string };

// A file the user picked, already uploaded to a staging path; handed to the
// assistant so it can file it into a job on request.
type StagedFile = { file_name: string; storage_path: string; file_size: number; file_type: string };

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
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const convo = useRef<unknown[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const voiceModeRef = useRef(false);
  const supabase = createClient();
  const voice = useVoice();

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, open, sending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        // Stage into an inbox folder of the same bucket job files live in; the
        // assistant moves it into the job's folder when asked to file it.
        const path = `_inbox/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
        const { error } = await supabase.storage.from("job-attachments").upload(path, file);
        if (error) {
          setBubbles((b) => [...b, { role: "assistant", text: `Couldn't upload ${file.name}: ${error.message}` }]);
          continue;
        }
        setStaged((s) => [...s, { file_name: file.name, storage_path: path, file_size: file.size, file_type: file.type }]);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function pickFromDrive() {
    setUploading(true);
    try {
      const picked = await openDrivePicker();
      for (const f of picked) {
        const res = await fetch("/api/assistant/import-drive-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: f.id, fileName: f.name, mimeType: f.mimeType }),
        });
        const data = await res.json();
        if (!res.ok) {
          setBubbles((b) => [...b, { role: "assistant", text: `Couldn't get "${f.name}" from Drive: ${data.detail || data.error || "error"}` }]);
          continue;
        }
        setStaged((s) => [...s, { file_name: data.file_name, storage_path: data.storage_path, file_size: data.file_size, file_type: data.file_type }]);
      }
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      const friendly =
        msg.includes("not_connected")
          ? "Connect Google Drive first in Settings, then try again."
          : msg.includes("not_configured")
          ? "The Google Drive picker isn't set up yet."
          : `Couldn't open Google Drive: ${msg}`;
      setBubbles((b) => [...b, { role: "assistant", text: friendly }]);
    } finally {
      setUploading(false);
    }
  }

  async function send(text: string): Promise<string | null> {
    const trimmed = text.trim();
    if ((!trimmed && staged.length === 0) || sending) return null;
    setInput("");
    const sentFiles = staged;
    setStaged([]);
    const userBubble = sentFiles.length
      ? `${trimmed}${trimmed ? "\n" : ""}📎 ${sentFiles.map((f) => f.file_name).join(", ")}`
      : trimmed;
    setBubbles((b) => [...b, { role: "user", text: userBubble }]);
    setSending(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: convo.current, message: trimmed, attachments: sentFiles }),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data.detail || data.error || "Something went wrong. Try again.";
        setBubbles((b) => [...b, { role: "assistant", text: err }]);
        return err;
      }
      if (Array.isArray(data.messages) && data.messages.length) convo.current = data.messages;
      const reply = data.reply || "(no response)";
      setBubbles((b) => [...b, { role: "assistant", text: reply }]);
      // An action may have changed data on the current page — refresh it.
      router.refresh();
      return reply;
    } catch (e) {
      const err = `Couldn't reach the assistant: ${String(e)}`;
      setBubbles((b) => [...b, { role: "assistant", text: err }]);
      return err;
    } finally {
      setSending(false);
    }
  }

  // One leg of a spoken conversation: heard speech -> send -> speak the reply
  // -> go back to listening so the user can answer. Loops until voice mode is
  // turned off. The small delay after speaking gives the browser time to
  // release the audio output before we reopen the mic (important on mobile,
  // where starting recognition too soon after TTS silently fails).
  const handleVoiceTurn = useCallback(
    async (text: string) => {
      const reply = await send(text);
      if (reply && voiceModeRef.current) {
        voice.speak(reply, () => {
          if (!voiceModeRef.current) return;
          setTimeout(() => {
            if (voiceModeRef.current) voice.startListening(handleVoiceTurn);
          }, 350);
        });
      }
    },
    // send/voice are stable enough for this widget's lifetime; ref guards re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function startConversation() {
    setVoiceMode(true);
    voiceModeRef.current = true;
    voice.startListening(handleVoiceTurn);
  }

  function stopConversation() {
    setVoiceMode(false);
    voiceModeRef.current = false;
    voice.stopListening();
    voice.stopSpeaking();
  }

  function toggleVoiceMode() {
    if (voiceMode) stopConversation();
    else startConversation();
  }

  // Turning the panel off stops any audio in flight.
  useEffect(() => {
    if (!open && voiceModeRef.current) {
      voiceModeRef.current = false;
      setVoiceMode(false);
      voice.stopListening();
      voice.stopSpeaking();
    }
  }, [open, voice]);

  // After it finishes speaking (or the mic times out with nothing heard), the
  // loop normally reopens the mic. If for some reason it stalls in voice mode
  // while idle, reopen it so the user is never stuck unable to reply.
  useEffect(() => {
    if (!voiceMode || voice.listening || voice.speaking || sending) return;
    const t = setTimeout(() => {
      if (voiceModeRef.current && !voice.listening && !voice.speaking) {
        voice.startListening(handleVoiceTurn);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [voiceMode, voice.listening, voice.speaking, sending, voice, handleVoiceTurn]);

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
            <div className="flex items-center gap-1">
              {voice.supported && (
                <button
                  onClick={toggleVoiceMode}
                  aria-label={voiceMode ? "Turn off voice conversation" : "Start voice conversation"}
                  title={voiceMode ? "Turn off voice conversation" : "Talk back and forth"}
                  className={`p-1.5 rounded transition-colors ${voiceMode ? "bg-emerald-500 text-white" : "hover:bg-white/10"}`}
                >
                  {voiceMode ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close assistant" className="p-1 rounded hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Voice conversation status — shown for hands-free mode, and briefly
              for a single tap-to-ask turn so it's obvious it's listening/speaking. */}
          {(voiceMode || voice.listening || voice.speaking) && (
            <div className="flex items-center justify-between gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-100 text-emerald-800">
              <div className="flex items-center gap-2 text-sm font-medium">
                {voice.speaking ? (
                  <>
                    <Volume2 className="h-4 w-4 animate-pulse" /> Speaking…
                  </>
                ) : sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                  </>
                ) : voice.listening ? (
                  <>
                    <span className="relative flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                    </span>
                    Listening…
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" /> Voice on
                  </>
                )}
              </div>
              {voiceMode && (
                <div className="flex items-center gap-2">
                  {!voice.listening && !voice.speaking && !sending && (
                    <button
                      onClick={() => voice.startListening(handleVoiceTurn)}
                      className="text-xs font-semibold rounded-full bg-emerald-600 text-white px-3 py-1 hover:bg-emerald-700"
                    >
                      Tap to talk
                    </button>
                  )}
                  <button
                    onClick={stopConversation}
                    className="text-xs font-semibold rounded-full bg-white text-emerald-700 border border-emerald-300 px-3 py-1 hover:bg-emerald-100"
                  >
                    Stop
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {bubbles.length === 0 && (
              <div className="text-center py-6 space-y-4">
                <p className="text-sm text-slate-500">Ask about jobs, customers, the calendar, or commissions — or have me schedule something or jot a note.</p>
                {voice.supported && !voiceMode && (
                  <button
                    onClick={toggleVoiceMode}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-600 text-white text-sm font-semibold px-4 py-2 hover:bg-emerald-700"
                  >
                    <Mic className="h-4 w-4" /> Talk to me — hands-free
                  </button>
                )}
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
          <div className="border-t p-2 space-y-2">
            {(staged.length > 0 || uploading) && (
              <div className="flex flex-wrap gap-1.5 px-1">
                {staged.map((f, i) => (
                  <span key={f.storage_path} className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 text-xs pl-2 pr-1 py-1">
                    <Paperclip className="h-3 w-3" />
                    <span className="max-w-[140px] truncate">{f.file_name}</span>
                    <button
                      onClick={() => setStaged((s) => s.filter((_, j) => j !== i))}
                      aria-label={`Remove ${f.file_name}`}
                      className="rounded-full hover:bg-slate-200 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {uploading && <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> uploading…</span>}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label="Attach file from device"
                title="Attach from this device"
                className="h-9 w-9 shrink-0 rounded-lg border text-slate-600 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              {pickerConfigured() && (
                <button
                  onClick={pickFromDrive}
                  disabled={uploading}
                  aria-label="Attach from Google Drive"
                  title="Attach from Google Drive"
                  className="h-9 w-9 shrink-0 rounded-lg border text-slate-600 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50"
                >
                  <HardDrive className="h-4 w-4" />
                </button>
              )}
              {voice.supported && !voiceMode && (
                <button
                  onClick={startConversation}
                  aria-label="Start talking — hands-free conversation"
                  title="Tap, then just talk — I'll answer out loud and keep listening"
                  className="h-9 w-9 shrink-0 rounded-lg border text-slate-600 flex items-center justify-center hover:bg-slate-50"
                >
                  <Mic className="h-4 w-4" />
                </button>
              )}
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
                disabled={sending || (!input.trim() && staged.length === 0)}
                aria-label="Send"
                className="h-9 w-9 shrink-0 rounded-lg bg-slate-900 text-white flex items-center justify-center disabled:opacity-40 hover:bg-slate-800"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
