"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { userNameForEmail } from "@/lib/team";
import { triggerPush } from "@/lib/push/trigger";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Send, FileText, X } from "lucide-react";
import type { ChatMessage, ChatAttachment } from "@/lib/types/database";

type MessageWithAttachments = ChatMessage & { attachments: ChatAttachment[] };

function fileUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/chat-attachments/${path}`;
}

function isImage(fileType: string | null): boolean {
  return Boolean(fileType?.startsWith("image/"));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(new Date(iso));
}

export function ChatRoom({
  currentEmail,
  initialMessages,
  initialAttachments,
}: {
  currentEmail: string;
  initialMessages: ChatMessage[];
  initialAttachments: ChatAttachment[];
}) {
  const supabase = createClient();
  const myName = userNameForEmail(currentEmail);

  const [messages, setMessages] = useState<MessageWithAttachments[]>(() => {
    const byMessage: Record<string, ChatAttachment[]> = {};
    for (const a of initialAttachments) (byMessage[a.message_id] ??= []).push(a);
    return initialMessages.map((m) => ({ ...m, attachments: byMessage[m.id] ?? [] }));
  });
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // When real push is active, let the service worker handle alerts (it works
  // even when the app is closed) so we don't double-notify.
  const pushActiveRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        pushActiveRef.current = Boolean(sub);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("chat-room")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const message = payload.new as ChatMessage;
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, { ...message, attachments: [] }]));

        if (message.sender_email !== currentEmail) {
          notify(message);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_attachments" }, (payload) => {
        const attachment = payload.new as ChatAttachment;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === attachment.message_id && !m.attachments.some((a) => a.id === attachment.id)
              ? { ...m, attachments: [...m.attachments, attachment] }
              : m,
          ),
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEmail]);

  function notify(message: ChatMessage) {
    if (pushActiveRef.current) return; // service-worker push will deliver it
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (typeof document !== "undefined" && document.hasFocus()) return;
    const senderName = userNameForEmail(message.sender_email);
    const n = new Notification(senderName, { body: message.content || "Sent an attachment" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  }

  function addFiles(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed && files.length === 0) return;
    setSending(true);

    const { data: created, error } = await supabase
      .from("chat_messages")
      .insert({ sender_email: currentEmail, content: trimmed || null })
      .select()
      .single();

    if (error || !created?.id) {
      setSending(false);
      return;
    }

    setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, { ...created, attachments: [] }]));

    triggerPush({
      title: myName,
      body:  trimmed || (files.length ? `Sent ${files.length} attachment${files.length > 1 ? "s" : ""}` : "Sent a message"),
      url:   "/chat",
      tag:   "chat",
    });

    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `${created.id}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext ? `.${ext}` : ""}`;
      const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(path, file);
      if (!uploadError) {
        const { data: attachment } = await supabase
          .from("chat_attachments")
          .insert({
            message_id:   created.id,
            storage_path: path,
            file_name:    file.name,
            file_type:    file.type || null,
            file_size:    file.size,
          })
          .select()
          .single();
        if (attachment) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === created.id && !m.attachments.some((a) => a.id === attachment.id)
                ? { ...m, attachments: [...m.attachments, attachment] }
                : m,
            ),
          );
        }
      }
    }

    setContent("");
    setFiles([]);
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  let lastDay = "";

  return (
    <div className="flex flex-col h-full border rounded-lg bg-white">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">No messages yet. Say hello!</p>
        )}
        {messages.map((message) => {
          const day = formatDay(message.created_at);
          const showDayHeading = day !== lastDay;
          lastDay = day;
          const isMine = message.sender_email === currentEmail;
          const senderName = isMine ? myName : userNameForEmail(message.sender_email);

          return (
            <div key={message.id}>
              {showDayHeading && (
                <div className="text-center text-xs text-muted-foreground my-3">{day}</div>
              )}
              <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${isMine ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"}`}>
                  {!isMine && <p className="text-xs font-semibold mb-0.5 opacity-70">{senderName}</p>}
                  {message.content && <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>}

                  {message.attachments.map((a) => (
                    <div key={a.id} className="mt-2">
                      {isImage(a.file_type) ? (
                        <a href={fileUrl(a.storage_path)} target="_blank" rel="noopener noreferrer">
                          <img src={fileUrl(a.storage_path)} alt={a.file_name} className="max-h-56 rounded-lg object-cover" />
                        </a>
                      ) : (
                        <a
                          href={fileUrl(a.storage_path)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 ${isMine ? "bg-white/10" : "bg-white"}`}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate underline">{a.file_name}</span>
                        </a>
                      )}
                    </div>
                  ))}

                  <p className={`text-[10px] mt-1 ${isMine ? "text-white/60" : "text-slate-400"}`}>{formatTime(message.created_at)}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3 space-y-2">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((file, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs bg-slate-100 rounded-full px-2.5 py-1">
                <FileText className="h-3 w-3" />
                <span className="max-w-[140px] truncate">{file.name}</span>
                <button onClick={() => removeFile(i)} aria-label="Remove attachment">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" multiple onChange={addFiles} className="hidden" id="chat-file-input" />
          <label htmlFor="chat-file-input">
            <Button asChild variant="outline" size="icon" type="button">
              <span><Paperclip className="h-4 w-4" /></span>
            </Button>
          </label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Carol or Travis…"
            className="min-h-[40px] max-h-32 resize-none"
            rows={1}
          />
          <Button onClick={handleSend} disabled={sending || (!content.trim() && files.length === 0)} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
