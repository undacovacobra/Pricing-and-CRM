import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { googleConfigured, downloadDriveFile } from "@/lib/google/drive";
import { getValidAccessToken } from "@/lib/google/connection";

// Takes a file the user picked from Google Drive, downloads its bytes, and
// stages it in the job-attachments bucket's inbox — exactly like a device
// upload — so the assistant can then file it into a job.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!googleConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 400 });

  let fileId: string | undefined;
  let fileName: string | undefined;
  let mimeType: string | undefined;
  try {
    ({ fileId, fileName, mimeType } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!fileId) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const accessToken = await getValidAccessToken();
  if (!accessToken) return NextResponse.json({ error: "not_connected" }, { status: 400 });

  try {
    const { bytes, contentType, extension } = await downloadDriveFile(accessToken, fileId, mimeType ?? "");
    let name = (fileName || "drive-file").replace(/[/\\]/g, "-");
    // Native Google docs export to PDF — make sure the name reflects that.
    if (extension && !name.toLowerCase().endsWith(extension)) name += extension;

    const safe = name.replace(/[^a-z0-9-_. ]/gi, "").trim() || "drive-file";
    const path = `_inbox/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;

    const { error: uploadErr } = await supabase.storage
      .from("job-attachments")
      .upload(path, new Uint8Array(bytes), { contentType, upsert: false });
    if (uploadErr) return NextResponse.json({ error: "upload_failed", detail: uploadErr.message }, { status: 502 });

    return NextResponse.json({
      file_name: safe,
      storage_path: path,
      file_size: bytes.byteLength,
      file_type: contentType,
    });
  } catch (e) {
    return NextResponse.json({ error: "drive_error", detail: String(e) }, { status: 502 });
  }
}
