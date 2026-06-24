-- Team chat: a single shared room for Travis and Carol, with attachments
-- and Supabase Realtime for live delivery.

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_email TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access" ON chat_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE chat_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access" ON chat_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_insert_chat_attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');
CREATE POLICY "auth_read_chat_attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');
CREATE POLICY "auth_delete_chat_attachments" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments');
CREATE POLICY "public_read_chat_attachments" ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'chat-attachments');
