import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { googleConfigured, exportGoogleDoc } from "@/lib/google/drive";
import { getValidAccessToken } from "@/lib/google/connection";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Exports the current contents of a Google Doc as a .docx and saves it into the
// job's attachments (plus a note), so edits made in Google Docs land in the CRM.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let jobId: string | undefined;
  let docId: string | undefined;
  let docName: string | undefined;
  let templateName: string | undefined;
  try {
    ({ jobId, docId, docName, templateName } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!jobId || !docId) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  if (!googleConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 400 });

  const accessToken = await getValidAccessToken();
  if (!accessToken) return NextResponse.json({ error: "not_connected" }, { status: 400 });

  try {
    const bytes = await exportGoogleDoc(accessToken, docId, DOCX_MIME);

    const safeBase = (docName || "document").replace(/[^a-z0-9-_ ]/gi, "").trim() || "document";
    const fileName = `${safeBase}.docx`;
    const path = `${jobId}/documents/${Date.now()}-${fileName}`;

    const { error: uploadErr } = await supabase.storage
      .from("job-attachments")
      .upload(path, new Uint8Array(bytes), { contentType: DOCX_MIME, upsert: false });
    if (uploadErr) return NextResponse.json({ error: "upload_failed", detail: uploadErr.message }, { status: 502 });

    await supabase.from("job_attachments").insert({
      job_id:       jobId,
      storage_path: path,
      file_name:    fileName,
    });
    await supabase.from("job_notes").insert({
      job_id:                  jobId,
      author:                  "owner",
      content:                 `Saved Google Doc "${docName}"${templateName ? ` (from template "${templateName}")` : ""} to attachments.`,
      attachment_storage_path: path,
      attachment_file_name:    fileName,
    });

    return NextResponse.json({ ok: true, fileName });
  } catch (e) {
    return NextResponse.json({ error: "drive_error", detail: String(e) }, { status: 502 });
  }
}
