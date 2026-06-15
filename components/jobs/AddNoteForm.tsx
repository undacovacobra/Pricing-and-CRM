"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AddNoteForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("owner");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    await supabase.from("job_notes").insert({ job_id: jobId, author, content });
    setContent("");
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
      <div className="flex items-center gap-2">
        <Select value={author} onValueChange={setAuthor}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="designer">Designer</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={saving || !content.trim()}>
          {saving ? "Adding..." : "Add Note"}
        </Button>
      </div>
    </form>
  );
}
