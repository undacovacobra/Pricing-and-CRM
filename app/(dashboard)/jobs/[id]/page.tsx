import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StageSelector } from "@/components/jobs/StageSelector";
import { AddNoteForm } from "@/components/jobs/AddNoteForm";
import { MaterialOrdersSection } from "@/components/jobs/MaterialOrdersSection";
import { JobAttachmentsSection } from "@/components/jobs/JobAttachmentsSection";
import { GoogleDriveLink } from "@/components/jobs/GoogleDriveLink";
import { ContractDocsSection } from "@/components/jobs/ContractDocsSection";
import { PaymentTracker } from "@/components/jobs/PaymentTracker";
import { DeleteJobButton } from "@/components/jobs/DeleteJobButton";
import { googleConfigured } from "@/lib/google/drive";
import { getGoogleConnectionStatus } from "@/lib/google/connection";
import { formatCurrency, formatDate, teamMemberName } from "@/lib/utils";
import { Pencil, Plus, FileText, Camera, MessageSquare, Package, Paperclip, FileSignature, FilePlus2, Calculator, CalendarDays, MapPin, PencilRuler } from "lucide-react";
import type { JobStage, DocumentType, MaterialOrder, JobAttachment, ContractDocument, CalendarEvent, JobDrawing } from "@/lib/types/database";

function mapsLink(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

const documentTypeLabels: Record<DocumentType, string> = {
  contract:     "Contract",
  invoice:      "Invoice",
  change_order: "Change Order",
  quote:        "Quote",
};

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("*, customer:customers!jobs_customer_id_fkey(*)")
    .eq("id", id)
    .single();

  if (!job) notFound();

  const customer = job.customer as { id: string; first_name: string; last_name: string; email: string | null; phone: string | null } | null;

  const [
    { data: documents },
    { data: notes },
    { data: photos },
    { data: payments },
    { data: materialOrders },
    { data: attachments },
    { data: contractDocs },
    { data: estimates },
    { data: events },
    { data: drawings },
  ] = await Promise.all([
    supabase.from("documents").select("*, document_line_items(line_total)").eq("job_id", id).order("created_at", { ascending: false }),
    supabase.from("job_notes").select("*").eq("job_id", id).order("created_at", { ascending: false }),
    supabase.from("job_photos").select("*").eq("job_id", id).order("created_at", { ascending: false }).limit(6),
    supabase.from("payments").select("*").eq("job_id", id).order("payment_date", { ascending: false }),
    supabase.from("material_orders").select("*").eq("job_id", id).order("ordered_at", { ascending: false }),
    supabase.from("job_attachments").select("*").eq("job_id", id).order("created_at", { ascending: false }),
    supabase.from("contract_documents").select("*").eq("job_id", id).order("created_at", { ascending: false }),
    supabase.from("estimates").select("*, estimate_line_items(line_total)").eq("job_id", id).order("created_at", { ascending: false }),
    supabase.from("calendar_events").select("*").eq("job_id", id).eq("status", "scheduled").order("start_time", { ascending: true }),
    supabase.from("job_drawings").select("*").eq("job_id", id).order("sort_order", { ascending: true }).limit(6),
  ]);

  const contracts = (contractDocs ?? []).filter((d) => d.kind === "contract") as ContractDocument[];
  const changeOrders = (contractDocs ?? []).filter((d) => d.kind === "change_order") as ContractDocument[];

  // Contract Amount and Change Orders stats are driven by the uploaded
  // contract / change-order records and their manually-entered amounts.
  const contractAmount = contracts.reduce((sum, c) => sum + (c.amount ?? 0), 0);
  const changeOrderTotal = changeOrders.reduce((sum, c) => sum + (c.amount ?? 0), 0);

  const configured = googleConfigured();
  const googleReady = configured && (await getGoogleConnectionStatus()).connected;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/jobs" className="text-sm text-muted-foreground hover:underline">
            ← Jobs
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 truncate">{job.title}</h1>
          {customer && (
            <Link href={`/customers/${customer.id}`} className="text-sm text-blue-600 hover:underline">
              {customer.first_name} {customer.last_name}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <StageSelector jobId={id} currentStage={job.stage as JobStage} />
          <Button asChild variant="outline" size="sm">
            <Link href={`/calendar/new?job=${id}${customer ? `&customer=${customer.id}` : ""}`}>
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline">Schedule</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/jobs/${id}/edit`}>
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">Edit</span>
            </Link>
          </Button>
          <DeleteJobButton jobId={id} jobTitle={job.title} />
        </div>
      </div>

      {/* Financial Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Contract Amount</p>
            <p className="text-lg font-bold">{contractAmount ? formatCurrency(contractAmount) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Change Orders</p>
            <p className="text-lg font-bold">{changeOrderTotal ? formatCurrency(changeOrderTotal) : "—"}</p>
          </CardContent>
        </Card>
        <PaymentTracker
          jobId={id}
          contractAmount={contractAmount}
          changeOrderTotal={changeOrderTotal}
          retainerAmount={job.retainer_amount}
          payDepositPaid={job.pay_deposit_paid}
          payDepositAmount={job.pay_deposit_amount}
          payDeliveryPaid={job.pay_delivery_paid}
          payDeliveryAmount={job.pay_delivery_amount}
          payCompletionPaid={job.pay_completion_paid}
          payCompletionAmount={job.pay_completion_amount}
          changeOrdersPaid={job.change_orders_paid}
        />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="space-y-4">
          {/* Job Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Google Drive Folder</p>
                <GoogleDriveLink jobId={id} folderUrl={job.google_drive_folder_url} />
              </div>
              {job.description && <p className="text-slate-700">{job.description}</p>}
              {job.job_address && (
                <div>
                  <p className="text-xs text-muted-foreground">Job Address</p>
                  <p>{job.job_address}</p>
                </div>
              )}
              {job.start_date && (
                <div>
                  <p className="text-xs text-muted-foreground">Start Date</p>
                  <p>{formatDate(job.start_date)}</p>
                </div>
              )}
              {job.estimated_end_date && (
                <div>
                  <p className="text-xs text-muted-foreground">Est. Completion</p>
                  <p>{formatDate(job.estimated_end_date)}</p>
                </div>
              )}
              {job.estimated_value && (
                <div>
                  <p className="text-xs text-muted-foreground">Est. Value</p>
                  <p>{formatCurrency(job.estimated_value)}</p>
                </div>
              )}
              {job.assigned_to && (
                <div>
                  <p className="text-xs text-muted-foreground">Assigned To</p>
                  <p>{teamMemberName(job.assigned_to)}</p>
                </div>
              )}
              {job.notes && (
                <div className="pt-1 border-t">
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-xs">{job.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Appointments */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Appointments
              </CardTitle>
              <Button asChild size="sm">
                <Link href={`/calendar/new?job=${id}${customer ? `&customer=${customer.id}` : ""}`}>
                  <Plus className="h-4 w-4" /> New
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {!events?.length && (
                <p className="text-sm text-muted-foreground text-center py-4">No appointments scheduled.</p>
              )}
              {(events as CalendarEvent[] | null)?.map((event) => (
                <Link key={event.id} href={`/calendar/${event.id}/edit`}>
                  <div className="p-3 border rounded-lg hover:bg-slate-50 transition-colors text-sm space-y-1">
                    <p className="font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(event.start_time))}
                      {" · "}
                      {teamMemberName(event.assigned_to)}
                    </p>
                    {event.location && (
                      <a
                        href={mapsLink(event.location)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <MapPin className="h-3 w-3 shrink-0" /> {event.location}
                      </a>
                    )}
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* File Attachments */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Paperclip className="h-4 w-4" /> Attachments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <JobAttachmentsSection jobId={id} attachments={(attachments ?? []) as JobAttachment[]} googleReady={googleReady} />
            </CardContent>
          </Card>

          {/* Photos Preview */}
          {(photos?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Camera className="h-4 w-4" /> Photos
                </CardTitle>
                <Link href={`/jobs/${id}/photos`} className="text-xs text-blue-600 hover:underline">View all</Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {photos?.slice(0, 6).map((photo) => (
                    <div key={photo.id} className="aspect-square bg-slate-200 rounded overflow-hidden">
                      <img
                        src={`${SUPABASE_URL}/storage/v1/object/public/job-photos/${photo.storage_path}`}
                        alt={photo.caption ?? "Job photo"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Drawings */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <PencilRuler className="h-4 w-4" /> Drawings
              </CardTitle>
              <Link href={`/jobs/${id}/drawings`} className="text-xs text-blue-600 hover:underline">View all</Link>
            </CardHeader>
            <CardContent>
              {!drawings?.length && (
                <p className="text-sm text-muted-foreground text-center py-2">No sketch pages yet.</p>
              )}
              {(drawings?.length ?? 0) > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {(drawings as JobDrawing[] | null)?.slice(0, 6).map((d) => (
                    <Link key={d.id} href={`/jobs/${id}/drawings/${d.id}`}>
                      <div className="aspect-[4/3] bg-white border rounded overflow-hidden flex items-center justify-center">
                        {d.thumbnail ? (
                          <img src={d.thumbnail} alt={d.label} className="w-full h-full object-contain" />
                        ) : (
                          <PencilRuler className="h-5 w-5 text-slate-300" />
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="md:col-span-2 space-y-4">
          {/* Estimates and Pricing */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Estimates and Pricing
              </CardTitle>
              <Button asChild size="sm">
                <Link href={`/estimates/new?job=${id}`}>
                  <Plus className="h-4 w-4" /> New
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {!estimates?.length && (
                <p className="text-sm text-muted-foreground text-center py-4">No estimates yet.</p>
              )}
              {estimates?.map((est) => {
                const total = (est.estimate_line_items as { line_total: number | null }[])?.reduce((s, li) => s + (li.line_total ?? 0), 0) ?? 0;
                const submitted = est.status === "submitted";
                return (
                  <Link key={est.id} href={`/estimates/${est.id}`}>
                    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{est.name}</p>
                          <span
                            className={
                              "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 " +
                              (submitted ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600")
                            }
                          >
                            {submitted ? "Submitted" : "Draft"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {submitted && est.submitted_at ? `Submitted ${formatDate(est.submitted_at)}` : `Created ${formatDate(est.created_at)}`}
                        </p>
                      </div>
                      <p className="text-sm font-semibold font-mono shrink-0 pl-3">{formatCurrency(total)}</p>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" /> Documents
              </CardTitle>
              <Button asChild size="sm">
                <Link href={`/jobs/${id}/documents/new`}>
                  <Plus className="h-4 w-4" /> New
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {!documents?.length && (
                <p className="text-sm text-muted-foreground text-center py-4">No documents yet.</p>
              )}
              {documents?.map((doc) => {
                const lineTotal = (doc.document_line_items as { line_total: number }[])?.reduce((s, li) => s + (li.line_total ?? 0), 0) ?? 0;
                return (
                  <Link key={doc.id} href={`/documents/${doc.id}`}>
                    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                      <div>
                        <p className="text-sm font-medium">{doc.document_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {documentTypeLabels[doc.document_type as DocumentType]} · {doc.status}
                        </p>
                      </div>
                      <p className="text-sm font-semibold">{formatCurrency(lineTotal)}</p>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          {/* Contracts */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileSignature className="h-4 w-4" /> Contracts
              </CardTitle>
              <span className="text-sm font-semibold">{contractAmount ? formatCurrency(contractAmount) : "—"}</span>
            </CardHeader>
            <CardContent>
              <ContractDocsSection jobId={id} kind="contract" items={contracts} />
            </CardContent>
          </Card>

          {/* Change Orders */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FilePlus2 className="h-4 w-4" /> Change Orders
              </CardTitle>
              <span className="text-sm font-semibold">{changeOrderTotal ? formatCurrency(changeOrderTotal) : "—"}</span>
            </CardHeader>
            <CardContent>
              <ContractDocsSection jobId={id} kind="change_order" items={changeOrders} />
            </CardContent>
          </Card>

          {/* Payments */}
          {(payments?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Payments Received</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {payments?.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2 border rounded text-sm">
                    <div>
                      <p className="font-medium text-green-700">{formatCurrency(p.amount)}</p>
                      {p.method && <p className="text-xs text-muted-foreground">{p.method}{p.reference ? ` · ${p.reference}` : ""}</p>}
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(p.payment_date)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Material Orders */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" /> Material Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MaterialOrdersSection jobId={id} orders={(materialOrders ?? []) as MaterialOrder[]} />
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <AddNoteForm jobId={id} />
              {notes?.map((note) => (
                <div key={note.id} className="border rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-xs">{teamMemberName(note.author)}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(note.created_at)}</span>
                  </div>
                  <p className="text-slate-700">{note.content}</p>
                  {note.attachment_storage_path && (
                    <a
                      href={`${SUPABASE_URL}/storage/v1/object/public/job-attachments/${note.attachment_storage_path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
                    >
                      <Paperclip className="h-3 w-3" /> {note.attachment_file_name ?? "Attachment"}
                    </a>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
