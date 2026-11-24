import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { roleFromUser } from "@/lib/auth/roles";
import { getOwnerAccessToken, importJobDriveFiles } from "@/lib/backup/engine";
import { createDriveFolder, getDriveParentId, driveFileExists } from "@/lib/google/drive";

export const maxDuration = 300;

function folderIdFromUrl(url: string | null | undefined): string | null {
  const m = url?.match(/folders\/([-\w]+)/);
  return m ? m[1] : null;
}

// Checks every job's Google Drive folder, and optionally creates one for each
// job whose folder is missing or was never made. Owner-only.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (roleFromUser(user) !== "owner") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!adminConfigured()) {
    return NextResponse.json({ error: "not_configured", detail: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  }

  let body: { fix?: boolean } = {};
  try { body = await request.json(); } catch { body = {}; }

  const admin = createAdminClient();
  const token = await getOwnerAccessToken(admin);
  if (!token) {
    return NextResponse.json({ error: "no_connection", detail: "Google Drive isn't connected (Settings → Connect Google Drive)." }, { status: 400 });
  }

  const { data: jobs } = await admin
    .from("jobs")
    .select("id, title, google_drive_folder_url, drive_import_folder_id")
    .order("title");

  // Where the existing job folders live, so new ones land beside them.
  let parentId: string | null = null;
  for (const j of jobs ?? []) {
    const fid = (j.drive_import_folder_id as string | null) ?? folderIdFromUrl(j.google_drive_folder_url as string | null);
    if (fid && (await driveFileExists(token, fid))) {
      parentId = await getDriveParentId(token, fid);
      break;
    }
  }

  const missing: { id: string; title: string; reason: "missing" | "none" }[] = [];
  let ok = 0;
  for (const j of jobs ?? []) {
    const fid = (j.drive_import_folder_id as string | null) ?? folderIdFromUrl(j.google_drive_folder_url as string | null);
    if (!fid) { missing.push({ id: j.id as string, title: j.title as string, reason: "none" }); continue; }
    if (await driveFileExists(token, fid)) { ok++; continue; }
    missing.push({ id: j.id as string, title: j.title as string, reason: "missing" });
  }

  if (!body.fix) {
    return NextResponse.json({ ok: true, checked: (jobs ?? []).length, healthy: ok, needsFolder: missing });
  }

  const created: string[] = [];
  const failed: { title: string; detail: string }[] = [];
  for (const m of missing) {
    try {
      const folder = await createDriveFolder(token, m.title || "Job", parentId ?? undefined);
      const url = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;
      await admin
        .from("jobs")
        .update({ google_drive_folder_url: url, drive_import_folder_id: null, drive_import_folder_url: null })
        .eq("id", m.id);
      // A brand-new folder is empty, but run the import so anything already
      // dropped in a re-linked folder comes straight in.
      await importJobDriveFiles(admin, token, m.id).catch(() => 0);
      created.push(m.title);
    } catch (e) {
      failed.push({ title: m.title, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ ok: true, checked: (jobs ?? []).length, healthy: ok, created, failed });
}
