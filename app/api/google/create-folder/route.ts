import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { googleConfigured, createDriveFolder } from "@/lib/google/drive";
import { getValidAccessToken } from "@/lib/google/connection";

// Creates a Google Drive folder named after the job and stores its id/url on
// the job. Safe to call unconditionally after creating a job: if Google isn't
// configured, the user hasn't connected, or a folder already exists, it
// no-ops with { skipped: true }.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let jobId: string | undefined;
  try {
    ({ jobId } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!jobId) return NextResponse.json({ error: "missing_job_id" }, { status: 400 });

  if (!googleConfigured()) return NextResponse.json({ skipped: true, reason: "not_configured" });

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, google_drive_folder_id")
    .eq("id", jobId)
    .single();
  if (!job) return NextResponse.json({ error: "job_not_found" }, { status: 404 });
  if (job.google_drive_folder_id) {
    return NextResponse.json({ skipped: true, reason: "already_exists" });
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) return NextResponse.json({ skipped: true, reason: "not_connected" });

  try {
    const folder = await createDriveFolder(accessToken, job.title);
    await supabase
      .from("jobs")
      .update({
        google_drive_folder_id:  folder.id,
        google_drive_folder_url: folder.webViewLink,
      })
      .eq("id", jobId);
    return NextResponse.json({ created: true, url: folder.webViewLink });
  } catch (e) {
    return NextResponse.json({ error: "drive_error", detail: String(e) }, { status: 502 });
  }
}
