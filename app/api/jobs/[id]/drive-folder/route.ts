import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { roleFromUser } from "@/lib/auth/roles";
import { getOwnerAccessToken, importJobDriveFiles } from "@/lib/backup/engine";
import { listDriveFolderChildren } from "@/lib/google/drive";

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

// POST — link an existing Drive folder to this job and import its files now.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if (g.error) return g.error;

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const folderId = extractFolderId(body.url ?? "");
  if (!folderId) {
    return NextResponse.json({ error: "bad_link", detail: "That doesn't look like a Google Drive folder link." }, { status: 400 });
  }

  const admin = createAdminClient();
  const token = await getOwnerAccessToken(admin);
  if (!token) {
    return NextResponse.json({ error: "no_connection", detail: "Google Drive isn't connected (Settings → Connect Google Drive)." }, { status: 400 });
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
    .update({ drive_import_folder_id: folderId, drive_import_folder_url: (body.url ?? "").trim() || null })
    .eq("id", id);
  if (upErr) return NextResponse.json({ error: "save_failed", detail: upErr.message }, { status: 502 });

  let imported = 0;
  try {
    imported = await importJobDriveFiles(admin, token, id);
  } catch {
    // Folder linked fine; import can be retried from the sync button.
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
