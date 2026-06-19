import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { googleConfigured, createDriveFolder, uploadFileToDrive, sourceMimeForFile } from "@/lib/google/drive";
import { getValidAccessToken } from "@/lib/google/connection";

// Mirrors an already-saved job attachment into the job's Drive folder
// (creating the folder first if needed). Best-effort: callers should treat
// failures as non-fatal since the file is already saved to the job.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let jobId: string | undefined;
  let storagePath: string | undefined;
  let fileName: string | undefined;
  try {
    ({ jobId, storagePath, fileName } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!jobId || !storagePath || !fileName) {
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
    let folderId = job.google_drive_folder_id as string | null;
    if (!folderId) {
      const folder = await createDriveFolder(accessToken, job.title);
      folderId = folder.id;
      await supabase
        .from("jobs")
        .update({ google_drive_folder_id: folder.id, google_drive_folder_url: folder.webViewLink })
        .eq("id", jobId);
    }

    const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/job-attachments/${storagePath}`;
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) return NextResponse.json({ error: "file_fetch_failed" }, { status: 502 });
    const bytes = await fileRes.arrayBuffer();

    const doc = await uploadFileToDrive(accessToken, fileName, folderId ?? undefined, bytes, sourceMimeForFile(fileName));

    return NextResponse.json({ url: doc.webViewLink });
  } catch (e) {
    return NextResponse.json({ error: "drive_error", detail: String(e) }, { status: 502 });
  }
}
