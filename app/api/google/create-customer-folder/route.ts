import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { googleConfigured, createDriveFolder } from "@/lib/google/drive";
import { getValidAccessToken } from "@/lib/google/connection";

// Creates a master Google Drive folder for an umbrella customer (builder,
// contractor, designer, repeat) and stores its id/url on the customer record.
// Safe to call unconditionally after creating such a customer: if Google isn't
// configured, the user hasn't connected, or a folder already exists, it no-ops
// with { skipped: true }.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let customerId: string | undefined;
  try {
    ({ customerId } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!customerId) return NextResponse.json({ error: "missing_customer_id" }, { status: 400 });

  if (!googleConfigured()) return NextResponse.json({ skipped: true, reason: "not_configured" });

  const { data: customer } = await supabase
    .from("customers")
    .select("id, first_name, last_name, customer_type, google_drive_folder_id")
    .eq("id", customerId)
    .single();
  if (!customer) return NextResponse.json({ error: "customer_not_found" }, { status: 404 });
  if (customer.customer_type === "homeowner") {
    return NextResponse.json({ skipped: true, reason: "not_umbrella" });
  }
  if (customer.google_drive_folder_id) {
    return NextResponse.json({ skipped: true, reason: "already_exists" });
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) return NextResponse.json({ skipped: true, reason: "not_connected" });

  const name = `${customer.first_name}${customer.last_name ? ` ${customer.last_name}` : ""}`.trim();

  try {
    const folder = await createDriveFolder(accessToken, name);
    await supabase
      .from("customers")
      .update({
        google_drive_folder_id:  folder.id,
        google_drive_folder_url: folder.webViewLink,
      })
      .eq("id", customerId);
    return NextResponse.json({ created: true, url: folder.webViewLink });
  } catch (e) {
    return NextResponse.json({ error: "drive_error", detail: String(e) }, { status: 502 });
  }
}
