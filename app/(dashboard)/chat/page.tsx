import { createClient } from "@/lib/supabase/server";
import { ChatRoom } from "@/components/chat/ChatRoom";
import type { ChatMessage, ChatAttachment } from "@/lib/types/database";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(200);

  const messageIds = (messages ?? []).map((m) => m.id);
  const { data: attachments } = messageIds.length
    ? await supabase.from("chat_attachments").select("*").in("message_id", messageIds)
    : { data: [] as ChatAttachment[] };

  return (
    <div className="h-[calc(100vh-7rem)] md:h-[calc(100vh-3rem)]">
      <ChatRoom
        currentEmail={user?.email ?? ""}
        initialMessages={(messages ?? []) as ChatMessage[]}
        initialAttachments={(attachments ?? []) as ChatAttachment[]}
      />
    </div>
  );
}
