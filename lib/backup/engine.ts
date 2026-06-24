// Google Drive backup engine.
//
// Mirrors all CRM data into a Drive folder the app owns:
//
//   Coastal Edge CRM Backup/
//     Travis/   <- jobs assigned to the owner
//       <Job Title>/
//         Job Summary           (Google Doc: details, customer, estimates, notes)
//         <every file attached to the job>
//     Carol/    <- jobs assigned to the designer
//     Unassigned/
//     Contacts/
//       Contacts (Coastal Edge)  (Google Sheet of every customer)
//
// Because the app uses the least-privilege `drive.file` scope, it can only see
// and manage folders it created — so it creates and owns this whole structure
// (it cannot write into folders made by hand). Everything lands in the
// designated owner's Drive so there is a single, complete backup location.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDriveFolder,
  uploadFileToDrive,
  uploadAsGoogleDoc,
  uploadAsGoogleSheet,
  deleteDriveFile,
  refreshAccessToken,
} from "@/lib/google/drive";

const ROOT_NAME = "Coastal Edge CRM Backup";
const CONTACTS_SHEET_NAME = "Contacts (Coastal Edge)";
const CALENDAR_SHEET_NAME = "Calendar Events (Coastal Edge)";
const COMMISSIONS_SHEET_NAME = "Commissions (Coastal Edge)";

function ownerEmail(): string {
  return process.env.BACKUP_OWNER_EMAIL || "thetravisj1989@gmail.com";
}

// ---- Owner Google connection ------------------------------------------------

// Returns a fresh access token for the designated backup owner's Google account.
// Prefers the connection whose email matches BACKUP_OWNER_EMAIL; falls back to
// the oldest connection so backups still work if the owner email changes.
export async function getOwnerAccessToken(admin: SupabaseClient): Promise<string | null> {
  const { data: rows } = await admin
    .from("google_connections")
    .select("google_email, refresh_token, created_at")
    .order("created_at", { ascending: true });

  if (!rows || rows.length === 0) return null;
  const owner =
    rows.find((r) => (r.google_email ?? "").toLowerCase() === ownerEmail().toLowerCase()) ?? rows[0];
  if (!owner?.refresh_token) return null;

  try {
    const refreshed = await refreshAccessToken(owner.refresh_token);
    return refreshed.access_token;
  } catch {
    return null;
  }
}

// ---- backup_map helpers -----------------------------------------------------

async function getMapped(admin: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await admin.from("backup_map").select("drive_id").eq("key", key).maybeSingle();
  return data?.drive_id ?? null;
}

async function setMapped(admin: SupabaseClient, key: string, driveId: string, name?: string) {
  await admin
    .from("backup_map")
    .upsert({ key, drive_id: driveId, name: name ?? null, updated_at: new Date().toISOString() });
}

async function deleteMapped(admin: SupabaseClient, key: string) {
  await admin.from("backup_map").delete().eq("key", key);
}

// Returns the folder id for a stable key, creating the folder if needed.
async function ensureFolder(
  admin: SupabaseClient,
  token: string,
  key: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const existing = await getMapped(admin, key);
  if (existing) return existing;
  const folder = await createDriveFolder(token, name, parentId);
  await setMapped(admin, key, folder.id, name);
  return folder.id;
}

// ---- Structure --------------------------------------------------------------

interface Structure {
  root: string;
  travis: string;
  carol: string;
  unassigned: string;
  contacts: string;
  calendar: string;
  commissions: string;
  commissionAttachments: string;
}

async function ensureStructure(admin: SupabaseClient, token: string): Promise<Structure> {
  const root = await ensureFolder(admin, token, "root", ROOT_NAME);
  const [travis, carol, unassigned, contacts, calendar, commissions] = await Promise.all([
    ensureFolder(admin, token, "folder:travis", "Travis", root),
    ensureFolder(admin, token, "folder:carol", "Carol", root),
    ensureFolder(admin, token, "folder:unassigned", "Unassigned", root),
    ensureFolder(admin, token, "folder:contacts", "Contacts", root),
    ensureFolder(admin, token, "folder:calendar", "Calendar", root),
    ensureFolder(admin, token, "folder:commissions", "Commissions", root),
  ]);
  const commissionAttachments = await ensureFolder(
    admin, token, "folder:commission-attachments", "Attachments", commissions,
  );
  return { root, travis, carol, unassigned, contacts, calendar, commissions, commissionAttachments };
}

function personFolder(structure: Structure, assignedTo: string | null): string {
  if (assignedTo === "owner") return structure.travis;
  if (assignedTo === "designer") return structure.carol;
  return structure.unassigned;
}

// ---- Helpers ----------------------------------------------------------------

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function money(v: unknown): string {
  const n = Number(v);
  return isNaN(n) ? "" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeName(s: string): string {
  return (s || "Untitled").replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 120) || "Untitled";
}

function baseName(path: string): string {
  const last = path.split("/").pop() || path;
  // Storage paths often prefix a timestamp like "1716490000000-file.pdf".
  return last.replace(/^\d{10,}-/, "");
}

// ---- Job backup -------------------------------------------------------------

interface FileRef {
  bucket: string;
  path: string;
  name: string;
}

async function collectJobFiles(admin: SupabaseClient, jobId: string): Promise<FileRef[]> {
  const files: FileRef[] = [];
  const push = (bucket: string, path: string | null, name?: string | null) => {
    if (path) files.push({ bucket, path, name: name || baseName(path) });
  };

  const [att, notes, photos, mats, contracts, docs, comms] = await Promise.all([
    admin.from("job_attachments").select("storage_path, file_name").eq("job_id", jobId),
    admin.from("job_notes").select("attachment_storage_path, attachment_file_name").eq("job_id", jobId),
    admin.from("job_photos").select("storage_path, caption").eq("job_id", jobId),
    admin.from("material_orders").select("receipt_storage_path, receipt_file_name").eq("job_id", jobId),
    admin.from("contract_documents").select("storage_path, file_name").eq("job_id", jobId),
    admin.from("documents").select("pdf_storage_path, document_number").eq("job_id", jobId),
    admin.from("designer_commissions").select("invoice_storage_path").eq("job_id", jobId),
  ]);

  (att.data ?? []).forEach((r) => push("job-attachments", r.storage_path, r.file_name));
  (notes.data ?? []).forEach((r) => push("job-attachments", r.attachment_storage_path, r.attachment_file_name));
  (photos.data ?? []).forEach((r) => push("job-photos", r.storage_path));
  (mats.data ?? []).forEach((r) => push("job-attachments", r.receipt_storage_path, r.receipt_file_name));
  (contracts.data ?? []).forEach((r) => push("job-attachments", r.storage_path, r.file_name));
  (docs.data ?? []).forEach((r) => push("documents", r.pdf_storage_path, r.document_number ? `${r.document_number}.pdf` : null));
  (comms.data ?? []).forEach((r) => push("commission-invoices", r.invoice_storage_path));

  return files;
}

async function buildJobSummaryHtml(admin: SupabaseClient, job: Record<string, unknown>): Promise<string> {
  const customerId = job.customer_id as string | null;
  const [{ data: customer }, { data: estimates }, { data: notes }, { data: payments }] = await Promise.all([
    customerId
      ? admin.from("customers").select("*").eq("id", customerId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("estimates").select("name, status, created_at, estimate_line_items(line_total)").eq("job_id", job.id as string),
    admin.from("job_notes").select("author, content, created_at").eq("job_id", job.id as string).order("created_at"),
    admin.from("payments").select("amount, payment_date, method, reference").eq("job_id", job.id as string).order("payment_date"),
  ]);

  const c = customer as Record<string, unknown> | null;
  const custName = c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "—";
  const estRows = (estimates ?? [])
    .map((e: Record<string, unknown>) => {
      const total = ((e.estimate_line_items as { line_total: number }[]) ?? []).reduce(
        (s, li) => s + Number(li.line_total || 0),
        0,
      );
      return `<tr><td>${esc(e.name)}</td><td>${esc(e.status)}</td><td>${money(total)}</td></tr>`;
    })
    .join("");
  const noteRows = (notes ?? [])
    .map(
      (n: Record<string, unknown>) =>
        `<p><strong>${esc(n.author === "owner" ? "Travis" : n.author === "designer" ? "Carol" : n.author)}</strong> · ${esc(
          String(n.created_at).slice(0, 10),
        )}<br/>${esc(n.content).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
  const payRows = (payments ?? [])
    .map(
      (p: Record<string, unknown>) =>
        `<tr><td>${esc(String(p.payment_date).slice(0, 10))}</td><td>${money(p.amount)}</td><td>${esc(p.method)}</td><td>${esc(p.reference)}</td></tr>`,
    )
    .join("");

  return `
  <h1>${esc(job.title)}</h1>
  <p><em>Backup generated ${esc(new Date().toISOString().slice(0, 16).replace("T", " "))} UTC</em></p>
  <h2>Job Details</h2>
  <p>
    <strong>Stage:</strong> ${esc(job.stage)}<br/>
    <strong>Assigned to:</strong> ${esc(job.assigned_to === "owner" ? "Travis" : job.assigned_to === "designer" ? "Carol" : job.assigned_to ?? "—")}<br/>
    <strong>Job address:</strong> ${esc(job.job_address ?? "—")}<br/>
    <strong>Estimated value:</strong> ${money(job.estimated_value)}<br/>
    <strong>Contract amount:</strong> ${money(job.contract_amount)}<br/>
    <strong>Start date:</strong> ${esc(job.start_date ?? "—")}<br/>
    <strong>Description:</strong> ${esc(job.description ?? "—")}
  </p>
  <h2>Customer</h2>
  <p>
    <strong>${esc(custName)}</strong><br/>
    ${c?.email ? `${esc(c.email)}<br/>` : ""}
    ${c?.phone ? `${esc(c.phone)}<br/>` : ""}
    ${c?.address_line1 ? `${esc(c.address_line1)}<br/>` : ""}
    ${c?.city ? `${esc(c.city)}, ${esc(c.state ?? "")} ${esc(c.zip ?? "")}` : ""}
  </p>
  <h2>Estimates</h2>
  ${estRows ? `<table border="1" cellpadding="4"><tr><th>Name</th><th>Status</th><th>Total</th></tr>${estRows}</table>` : "<p>None.</p>"}
  <h2>Payments</h2>
  ${payRows ? `<table border="1" cellpadding="4"><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr>${payRows}</table>` : "<p>None.</p>"}
  <h2>Notes</h2>
  ${noteRows || "<p>No notes.</p>"}
  `;
}

// Backs up a single job: its folder, a readable summary, and every attached
// file. Returns the number of binary files copied this run.
export async function backupJob(
  admin: SupabaseClient,
  token: string,
  jobId: string,
  structure?: Structure,
): Promise<number> {
  const struct = structure ?? (await ensureStructure(admin, token));

  const { data: job } = await admin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return 0;

  const folderName = safeName(job.title as string);
  const folderId = await ensureFolder(admin, token, `job:${jobId}`, folderName, personFolder(struct, job.assigned_to));

  // Summary doc — replace each run so it always reflects current data.
  const html = await buildJobSummaryHtml(admin, job);
  const summaryKey = `jobsummary:${jobId}`;
  const oldSummary = await getMapped(admin, summaryKey);
  if (oldSummary) {
    await deleteDriveFile(token, oldSummary).catch(() => {});
    await deleteMapped(admin, summaryKey);
  }
  const doc = await uploadAsGoogleDoc(
    token,
    "Job Summary",
    folderId,
    new TextEncoder().encode(html).buffer,
    "text/html",
  );
  await setMapped(admin, summaryKey, doc.id, "Job Summary");

  // Binary files — upload once, keyed by storage path (paths are immutable).
  const files = await collectJobFiles(admin, jobId);
  let copied = 0;
  for (const f of files) {
    const key = `file:${f.bucket}/${f.path}`;
    if (await getMapped(admin, key)) continue;
    const { data: blob, error } = await admin.storage.from(f.bucket).download(f.path);
    if (error || !blob) continue;
    const buf = await blob.arrayBuffer();
    try {
      const up = await uploadFileToDrive(token, safeName(f.name), folderId, buf, blob.type || "application/octet-stream");
      await setMapped(admin, key, up.id, f.name);
      copied++;
    } catch {
      // skip individual file failures so one bad file doesn't abort the job
    }
  }
  return copied;
}

// ---- Contacts backup --------------------------------------------------------

export async function backupContacts(admin: SupabaseClient, token: string, structure?: Structure) {
  const struct = structure ?? (await ensureStructure(admin, token));
  const { data: customers } = await admin
    .from("customers")
    .select("first_name, last_name, customer_type, email, phone, address_line1, address_line2, city, state, zip, notes, created_at")
    .order("last_name");

  const header = [
    "First Name", "Last Name", "Type", "Email", "Phone",
    "Address", "Address 2", "City", "State", "Zip", "Notes", "Added",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const c of customers ?? []) {
    lines.push(
      [
        c.first_name, c.last_name, c.customer_type, c.email, c.phone,
        c.address_line1, c.address_line2, c.city, c.state, c.zip, c.notes,
        String(c.created_at ?? "").slice(0, 10),
      ].map(csvCell).join(","),
    );
  }
  const csv = lines.join("\n");

  const key = "contacts_sheet";
  const old = await getMapped(admin, key);
  if (old) {
    await deleteDriveFile(token, old).catch(() => {});
    await deleteMapped(admin, key);
  }
  const sheet = await uploadAsGoogleSheet(token, CONTACTS_SHEET_NAME, struct.contacts, csv);
  await setMapped(admin, key, sheet.id, CONTACTS_SHEET_NAME);
  return (customers ?? []).length;
}

// ---- Calendar backup ---------------------------------------------------------

export async function backupCalendar(admin: SupabaseClient, token: string, structure?: Structure) {
  const struct = structure ?? (await ensureStructure(admin, token));
  const { data: events } = await admin
    .from("calendar_events")
    .select("event_type, title, assigned_to, start_time, end_time, location, notes, status, customer_id, job_id")
    .order("start_time");

  const customerIds = Array.from(new Set((events ?? []).map((e) => e.customer_id).filter(Boolean)));
  const jobIds = Array.from(new Set((events ?? []).map((e) => e.job_id).filter(Boolean)));
  const [{ data: customers }, { data: jobs }] = await Promise.all([
    customerIds.length
      ? admin.from("customers").select("id, first_name, last_name").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    jobIds.length
      ? admin.from("jobs").select("id, title").in("id", jobIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const customerName: Record<string, string> = {};
  for (const c of customers ?? []) customerName[c.id] = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  const jobTitle: Record<string, string> = {};
  for (const j of jobs ?? []) jobTitle[j.id] = j.title ?? "";

  const who = (v: string | null) => (v === "owner" ? "Travis" : v === "designer" ? "Carol" : v ?? "");

  const header = [
    "Type", "Title", "Who", "Start", "End", "Location", "Customer", "Job", "Status", "Notes",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const e of events ?? []) {
    lines.push(
      [
        e.event_type, e.title, who(e.assigned_to),
        String(e.start_time ?? "").replace("T", " ").slice(0, 16),
        e.end_time ? String(e.end_time).replace("T", " ").slice(0, 16) : "",
        e.location, e.customer_id ? customerName[e.customer_id] ?? "" : "",
        e.job_id ? jobTitle[e.job_id] ?? "" : "", e.status, e.notes,
      ].map(csvCell).join(","),
    );
  }
  const csv = lines.join("\n");

  const key = "calendar_sheet";
  const old = await getMapped(admin, key);
  if (old) {
    await deleteDriveFile(token, old).catch(() => {});
    await deleteMapped(admin, key);
  }
  const sheet = await uploadAsGoogleSheet(token, CALENDAR_SHEET_NAME, struct.calendar, csv);
  await setMapped(admin, key, sheet.id, CALENDAR_SHEET_NAME);
  return (events ?? []).length;
}

// ---- Commissions backup ------------------------------------------------------

export async function backupCommissions(admin: SupabaseClient, token: string, structure?: Structure) {
  const struct = structure ?? (await ensureStructure(admin, token));
  const { data: commissions } = await admin
    .from("designer_commissions")
    .select("job_id, job_name_freeform, invoice_storage_path, amount, status, submitted_at, paid_at, paid_amount, payment_method, notes")
    .order("submitted_at");

  const jobIds = Array.from(new Set((commissions ?? []).map((c) => c.job_id).filter(Boolean)));
  const { data: jobs } = jobIds.length
    ? await admin.from("jobs").select("id, title").in("id", jobIds)
    : { data: [] as { id: string; title: string }[] };
  const jobTitle: Record<string, string> = {};
  for (const j of jobs ?? []) jobTitle[j.id] = j.title ?? "";

  const describe = (c: Record<string, unknown>) =>
    (c.notes as string) || (c.job_id ? jobTitle[c.job_id as string] : "") || (c.job_name_freeform as string) || "Commission";

  // Spreadsheet of every commission.
  const header = [
    "Description", "Job", "Amount", "Status", "Submitted", "Paid Date", "Paid Amount", "Method", "Attachment", "Notes",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const c of commissions ?? []) {
    lines.push(
      [
        describe(c),
        c.job_id ? jobTitle[c.job_id] ?? "" : c.job_name_freeform ?? "",
        money(c.amount),
        c.status,
        String(c.submitted_at ?? "").slice(0, 10),
        c.paid_at ? String(c.paid_at).slice(0, 10) : "",
        c.paid_amount != null ? money(c.paid_amount) : "",
        c.payment_method ?? "",
        baseName(c.invoice_storage_path ?? ""),
        c.notes ?? "",
      ].map(csvCell).join(","),
    );
  }
  const csv = lines.join("\n");

  const key = "commissions_sheet";
  const old = await getMapped(admin, key);
  if (old) {
    await deleteDriveFile(token, old).catch(() => {});
    await deleteMapped(admin, key);
  }
  const sheet = await uploadAsGoogleSheet(token, COMMISSIONS_SHEET_NAME, struct.commissions, csv);
  await setMapped(admin, key, sheet.id, COMMISSIONS_SHEET_NAME);

  // Copy each invoice file into the Attachments subfolder (once per path).
  for (const c of commissions ?? []) {
    const path = c.invoice_storage_path;
    if (!path) continue;
    const mapKey = `commissionfile:${path}`;
    if (await getMapped(admin, mapKey)) continue;
    const { data: blob, error } = await admin.storage.from("commission-invoices").download(path);
    if (error || !blob) continue;
    const buf = await blob.arrayBuffer();
    const name = safeName(`${describe(c)} - ${baseName(path)}`);
    try {
      const up = await uploadFileToDrive(token, name, struct.commissionAttachments, buf, blob.type || "application/octet-stream");
      await setMapped(admin, mapKey, up.id, name);
    } catch {
      // skip individual file failures
    }
  }

  return (commissions ?? []).length;
}

// ---- Full backup ------------------------------------------------------------

export interface BackupResult {
  jobs: number;
  files: number;
  contacts: number;
  calendarEvents: number;
  commissions: number;
}

export async function backupEverything(admin: SupabaseClient, token: string): Promise<BackupResult> {
  const structure = await ensureStructure(admin, token);
  const { data: jobs } = await admin.from("jobs").select("id").order("created_at");
  let files = 0;
  for (const j of jobs ?? []) {
    files += await backupJob(admin, token, j.id as string, structure);
  }
  const contacts = await backupContacts(admin, token, structure);
  const calendarEvents = await backupCalendar(admin, token, structure);
  const commissions = await backupCommissions(admin, token, structure);
  return { jobs: (jobs ?? []).length, files, contacts, calendarEvents, commissions };
}

export async function recordRun(
  admin: SupabaseClient,
  kind: string,
  status: string,
  detail: string,
  jobsCount?: number,
  filesCount?: number,
) {
  await admin.from("backup_runs").insert({
    kind,
    status,
    detail: detail.slice(0, 500),
    jobs_count: jobsCount ?? null,
    files_count: filesCount ?? null,
  });
}
