"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Image as ImageIcon, Trash2 } from "lucide-react";
import type { AppSettings } from "@/lib/types/database";

export function SettingsForm({ settings }: { settings: AppSettings | null }) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);

    const path = `background-${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("branding").upload(path, file);
    if (uploadErr) { setError(uploadErr.message); setUploading(false); return; }

    if (settings) {
      await supabase.from("app_settings").update({ background_photo_path: path }).eq("id", settings.id);
    } else {
      await supabase.from("app_settings").insert({ company_name: "", background_photo_path: path });
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function handleRemove() {
    if (!settings) return;
    setUploading(true);
    await supabase.from("app_settings").update({ background_photo_path: null }).eq("id", settings.id);
    setUploading(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="h-4 w-4" /> Background Photo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Upload a photo to show as a faded background across the app. It&apos;s washed out so the page stays easy to read.
        </p>

        {settings?.background_photo_path && (
          <div className="flex items-center justify-between gap-3 bg-slate-50 border rounded-md px-3 py-2">
            <span className="text-sm text-slate-700">Background photo set.</span>
            <Button type="button" variant="outline" size="sm" onClick={handleRemove} disabled={uploading}>
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="block w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-slate-100 file:text-xs file:font-medium hover:file:bg-slate-200"
          />
          <Button type="button" size="sm" onClick={handleUpload} disabled={uploading}>
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
