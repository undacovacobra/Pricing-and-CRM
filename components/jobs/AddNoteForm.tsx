"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paperclip, X } from "lucide-react";

export function AddNoteForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("owner");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);

    let attachmentPath: string | null = null;
    let attachmentFileName: string | null = null;
    if (file) {
      const path = `notes/${jobId}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("job-attachments").upload(path, file);
      if (!uploadErr) {
        attachmentPath = path;
        attachmentFileName = file.name;
      }
    }

    await supabase.from("job_notes").insert({
      job_id:                  jobId,
      author,
      content,
      attachment_storage_path: attachmentPath,
      attachment_file_name:    attachmentFileName,
    });
    setContent("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setSaving(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Add a note..."
        rows={2}
      />
      {file && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Paperclip className="h-3 w-3" /> {file.name}
          <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Select value={author} onValueChange={setAuthor}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">Travis</SelectItem>
            <SelectItem value="designer">Carol</SelectItem>
          </SelectContent>
        </Select>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => fileRef.current?.click()}>
          <Paperclip className="h-3 w-3" />
        </Button>
        <Button type="submit" size="sm" disabled={saving || !content.trim()}>
          {saving ? "Adding..." : "Add Note"}
        </Button>
      </div>
    </form>
  );
}
