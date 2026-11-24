import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { roleFromUser } from "@/lib/auth/roles";
import { getOwnerAccessToken, importJobDriveFiles } from "@/lib/backup/engine";
import { listDriveFolderChildren, createDriveFolder, getDriveParentId, driveFileExists } from "@/lib/google/drive";

export const maxDuration = 120;

// Pulls a Google Drive folder id out of a pasted share link (or a bare id).
function extractFolderId(input: string): string | null {
  const s = input.trim();
  const fromUrl = s.match(/folders\/([-\w]+)/);
  if (fromUrl) return fromUrl[1];
  const bare = s.match(/^[-\w]{20,}$/);
  return bare ? bare[0] : null;
}

async function gate(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (roleFromUser(user) === "installer") return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  if (!adminConfigured()) {
    return { error: NextResponse.json({ error: "not_configured", detail: "Backup service isn't configured (SUPABASE_SERVICE_ROLE_KEY)." }, { status: 503 }) };
  }
  return { supabase, jobId: id };
}

// Resolves the folder this job reads from: an explicit override, else the folder
// attached to the job.
function folderIdFor(job: { drive_import_folder_id?: string | null; google_drive_folder_url?: string | null } | null) {
  if (job?.drive_import_folder_id) return job.drive_import_folder_id;
  const m = job?.google_drive_folder_url?.match(/folders\/([-\w]+)/);
  return m ? m[1] : null;
}

// GET — is this job's Drive folder actually reachable, and what's in it?
// Without this a deleted folder is indistinguishable from an empty one: the sync
// swallows the error and the page just says "no attachments yet".
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if (g.error) return g.error;

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("jobs")
    .select("drive_import_folder_id, google_drive_folder_url")
    .eq("id", id)
    .maybeSingle();

  const folderId = folderIdFor(job);
  if (!folderId) return NextResponse.json({ state: "none" });

  const token = await getOwnerAccessToken(admin);
  if (!token) return NextResponse.json({ state: "no_connection" });

  // Check the folder exists first — listing children of a deleted folder quietly
  // returns nothing rather than failing.
  if (!(await driveFileExists(token, folderId))) return NextResponse.json({ state: "missing" });

  try {
    const children = await listDriveFolderChildren(token, folderId);
    const files = children.filter((c) => c.mimeType !== "application/vnd.google-apps.folder");
    const folders = children.length - files.length;
    return NextResponse.json({ state: "ok", fileCount: files.length, folderCount: folders });
  } catch {
    // The folder id is stored but Drive won't return it — deleted, trashed, or
    // not shared with the connected account.
    return NextResponse.json({ state: "missing" });
  }
}

// POST — link an existing Drive folder to this job and import its files now.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if (g.error) return g.error;

  // Body is optional: no url = just "Sync now" using the folder already attached
  // to the job; a url = set an explicit override folder, then sync.
  let body: { url?: string; action?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const admin = createAdminClient();
  const token = await getOwnerAccessToken(admin);
  if (!token) {
    return NextResponse.json({ error: "no_connection", detail: "Google Drive isn't connected (Settings → Connect Google Drive)." }, { status: 400 });
  }

  // Make a fresh folder for this job — for jobs that never got one, or whose
  // folder was deleted in Drive, leaving a dead link.
  if (body.action === "create") {
    const { data: job } = await admin.from("jobs").select("title").eq("id", id).maybeSingle();
    if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Put it wherever the other job folders already live, so everything stays
    // together instead of landing somewhere arbitrary.
    const { data: sibling } = await admin
      .from("jobs")
      .select("google_drive_folder_url")
      .not("google_drive_folder_url", "is", null)
      .neq("id", id)
      .limit(1)
      .maybeSingle();
    const siblingId = folderIdFor(sibling as { google_drive_folder_url?: string | null } | null);
    const parentId = siblingId ? await getDriveParentId(token, siblingId) : null;

    try {
      const folder = await createDriveFolder(token, (job.title as string) || "Job", parentId ?? undefined);
      const url = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;
      const { error: saveErr } = await admin
        .from("jobs")
        .update({ google_drive_folder_url: url, drive_import_folder_id: null, drive_import_folder_url: null })
        .eq("id", id);
      if (saveErr) return NextResponse.json({ error: "save_failed", detail: saveErr.message }, { status: 502 });
      return NextResponse.json({ ok: true, created: true, url, imported: 0 });
    } catch (e) {
      return NextResponse.json(
        { error: "create_failed", detail: e instanceof Error ? e.message : String(e) },
        { status: 502 },
      );
    }
  }

  const rawUrl = (body.url ?? "").trim();
  if (rawUrl) {
    const folderId = extractFolderId(rawUrl);
    if (!folderId) {
      return NextResponse.json({ error: "bad_link", detail: "That doesn't look like a Google Drive folder link." }, { status: 400 });
    }
    // Confirm the connected account can actually see the folder before saving it.
    try {
      await listDriveFolderChildren(token, folderId);
    } catch {
      return NextResponse.json(
        { error: "no_access", detail: "The connected Google account can't open that folder. Make sure it's shared with the account used for backups." },
        { status: 400 },
      );
    }
    const { error: upErr } = await admin
      .from("jobs")
      .update({ drive_import_folder_id: folderId, drive_import_folder_url: rawUrl })
      .eq("id", id);
    if (upErr) return NextResponse.json({ error: "save_failed", detail: upErr.message }, { status: 502 });
  }

  let imported = 0;
  try {
    imported = await importJobDriveFiles(admin, token, id);
  } catch {
    // Import can be retried from the sync button.
  }
  return NextResponse.json({ ok: true, imported });
}

// DELETE — unlink the folder (stops importing from it).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if (g.error) return g.error;

  const admin = createAdminClient();
  const { error } = await admin
    .from("jobs")
    .update({ drive_import_folder_id: null, drive_import_folder_url: null })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "save_failed", detail: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
