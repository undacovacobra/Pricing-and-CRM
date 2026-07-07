import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { roleFromUser, type AppRole } from "@/lib/auth/roles";

const VALID_ROLES: AppRole[] = ["owner", "designer", "installer"];

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

// PATCH — change a user's role, display name, and/or reset their password.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireOwner();
  if (gate.error) return gate.error;
  const { id } = await params;

  let body: { role?: string; password?: string; displayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const updates: {
    password?: string;
    app_metadata?: { role: AppRole };
    user_metadata?: { display_name: string };
  } = {};

  if (body.password !== undefined) {
    if (body.password.length < 6) {
      return NextResponse.json({ error: "bad_password", detail: "Password must be at least 6 characters." }, { status: 400 });
    }
    updates.password = body.password;
  }
  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role as AppRole)) return NextResponse.json({ error: "bad_role" }, { status: 400 });
    // Don't let an owner accidentally demote themselves and lose admin access.
    if (id === gate.userId && body.role !== "owner") {
      return NextResponse.json({ error: "cant_demote_self", detail: "You can't change your own role away from owner." }, { status: 400 });
    }
    updates.app_metadata = { role: body.role as AppRole };
  }
  if (body.displayName !== undefined) {
    updates.user_metadata = { display_name: body.displayName.trim() };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, updates);
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove a user (never yourself).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireOwner();
  if (gate.error) return gate.error;
  const { id } = await params;
  if (id === gate.userId) {
    return NextResponse.json({ error: "cant_delete_self" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: "delete_failed", detail: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
