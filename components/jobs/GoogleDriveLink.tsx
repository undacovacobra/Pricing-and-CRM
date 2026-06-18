"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen, Pencil } from "lucide-react";

export function GoogleDriveLink({ jobId, folderUrl }: { jobId: string; folderUrl: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(folderUrl ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await supabase.from("jobs").update({ google_drive_folder_url: value.trim() || null }).eq("id", jobId);
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://drive.google.com/drive/folders/..."
          className="h-8 text-sm"
        />
        <Button size="sm" className="h-8" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={() => { setEditing(false); setValue(folderUrl ?? ""); }}>
          Cancel
        </Button>
      </div>
    );
  }

  if (!folderUrl) {
    return (
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
        <FolderOpen className="h-4 w-4" /> Connect Google Drive Folder
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={folderUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
      >
        <FolderOpen className="h-4 w-4" /> Open Google Drive Folder
      </a>
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(true)}>
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}
