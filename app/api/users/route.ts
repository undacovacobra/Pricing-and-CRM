import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import {
  roleFromUser,
  emailForUsername,
  loginNameFromEmail,
  isUsernameLogin,
  type AppRole,
} from "@/lib/auth/roles";

const VALID_ROLES: AppRole[] = ["owner", "designer", "installer"];

// Confirms the caller is a signed-in owner. Returns the owner's user id or an
// error response to short-circuit with.
async function requireOwner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (roleFromUser(user) !== "owner") return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  if (!adminConfigured()) {
    return { error: NextResponse.json({ error: "not_configured", detail: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 }) };
  }
  return { userId: user.id };
}

// GET — list all users with their login, role, and display name.
export async function GET() {
  const gate = await requireOwner();
  if (gate.error) return gate.error;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) return NextResponse.json({ error: "list_failed", detail: error.message }, { status: 502 });

  const users = (data?.users ?? []).map((u) => ({
    id: u.id,
    login: loginNameFromEmail(u.email),
    isUsername: isUsernameLogin(u.email),
    role: roleFromUser(u),
    displayName: (u.user_metadata?.display_name as string | undefined) || "",
    isSelf: u.id === gate.userId,
  }));
  // Owners first, then designers, then installers, then by name.
  const order: Record<string, number> = { owner: 0, designer: 1, installer: 2 };
  users.sort((a, b) => (order[a.role] - order[b.role]) || a.login.localeCompare(b.login));
  return NextResponse.json({ users });
}

// POST — create a username/password user.
export async function POST(request: NextRequest) {
  const gate = await requireOwner();
  if (gate.error) return gate.error;

  let body: { username?: string; password?: string; role?: string; displayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const username = (body.username ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const role = (body.role ?? "installer") as AppRole;
  const displayName = (body.displayName ?? "").trim();

  if (!/^[a-z0-9._-]{3,}$/.test(username)) {
    return NextResponse.json({ error: "bad_username", detail: "Username must be at least 3 characters (letters, numbers, . _ -)." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "bad_password", detail: "Password must be at least 6 characters." }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "bad_role" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: emailForUsername(username),
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { display_name: displayName || username, username },
  });
  if (error) {
    const dup = /already|exists|registered/i.test(error.message);
    return NextResponse.json({ error: dup ? "username_taken" : "create_failed", detail: error.message }, { status: dup ? 409 : 502 });
  }
  return NextResponse.json({ ok: true });
}
