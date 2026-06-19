import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { googleConfigured, createDriveFolder, uploadAsGoogleDoc, sourceMimeForFile } from "@/lib/google/drive";
import { getValidAccessToken } from "@/lib/google/connection";

// Converts a template file into an editable Google Doc inside the job's Drive
// folder and logs a note so creation is tracked. Returns the Google Docs link
// and the Drive file id (used later to export the doc into job attachments).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let jobId: string | undefined;
  let templateStoragePath: string | undefined;
  let templateFileName: string | undefined;
  let title: string | undefined;
  let templateName: string | undefined;
  try {
    ({ jobId, templateStoragePath, templateFileName, title, templateName } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!jobId || !templateStoragePath || !templateFileName) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  if (!googleConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 400 });

  const accessToken = await getValidAccessToken();
  if (!accessToken) return NextResponse.json({ error: "not_connected" }, { status: 400 });

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, google_drive_folder_id")
    .eq("id", jobId)
    .single();
  if (!job) return NextResponse.json({ error: "job_not_found" }, { status: 404 });

  try {
    // Ensure the job has a Drive folder to drop the doc into.
    let folderId = job.google_drive_folder_id as string | null;
    if (!folderId) {
      const folder = await createDriveFolder(accessToken, job.title);
      folderId = folder.id;
      await supabase
        .from("jobs")
        .update({ google_drive_folder_id: folder.id, google_drive_folder_url: folder.webViewLink })
        .eq("id", jobId);
    }

    // Pull the template bytes from Supabase storage.
    const templateUrl = `${SUPABASE_URL}/storage/v1/object/public/templates/${templateStoragePath}`;
    const fileRes = await fetch(templateUrl);
    if (!fileRes.ok) return NextResponse.json({ error: "template_fetch_failed" }, { status: 502 });
    const bytes = await fileRes.arrayBuffer();

    const docName = (title && title.trim()) || templateName || templateFileName;
    const doc = await uploadAsGoogleDoc(
      accessToken,
      docName,
      folderId ?? undefined,
      bytes,
      sourceMimeForFile(templateFileName),
    );

    // Track creation in the job's notes.
    await supabase.from("job_notes").insert({
      job_id:  jobId,
      author:  "owner",
      content: `Google Doc "${docName}" created from template "${templateName ?? templateFileName}": ${doc.webViewLink}`,
    });

    return NextResponse.json({ url: doc.webViewLink, docId: doc.id, docName });
  } catch (e) {
    return NextResponse.json({ error: "drive_error", detail: String(e) }, { status: 502 });
  }
}
