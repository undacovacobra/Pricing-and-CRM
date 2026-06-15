import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StageSelector } from "@/components/jobs/StageSelector";
import { AddNoteForm } from "@/components/jobs/AddNoteForm";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Pencil, Plus, FileText, Camera, MessageSquare } from "lucide-react";
import type { JobStage, DocumentType } from "@/lib/types/database";

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
    .select("*, customer:customers(*)")
    .eq("id", id)
    .single();

  if (!job) notFound();

  const customer = job.customer as { id: string; first_name: string; last_name: string; email: string | null; phone: string | null } | null;

  const [
    { data: documents },
    { data: notes },
    { data: photos },
    { data: payments },
    { data: commissions },
  ] = await Promise.all([
    supabase.from("documents").select("*, document_line_items(line_total)").eq("job_id", id).order("created_at", { ascending: false }),
    supabase.from("job_notes").select("*").eq("job_id", id).order("created_at", { ascending: false }),
    supabase.from("job_photos").select("*").eq("job_id", id).order("created_at", { ascending: false }).limit(6),
    supabase.from("payments").select("*").eq("job_id", id).order("payment_date", { ascending: false }),
    supabase.from("designer_commissions").select("*").eq("job_id", id).order("submitted_at", { ascending: false }),
  ]);

  const totalInvoiced = (documents ?? []).filter(d => ["invoice", "change_order"].includes(d.document_type)).reduce((sum, doc) => {
    const lineTotal = (doc.document_line_items as { line_total: number }[])?.reduce((s, li) => s + (li.line_total ?? 0), 0) ?? 0;
    return sum + lineTotal;
  }, 0);

  const totalPaid = (payments ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
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
        <div className="flex items-center gap-2 shrink-0">
          <StageSelector jobId={id} currentStage={job.stage as JobStage} />
          <Button asChild variant="outline" size="sm">
            <Link href={`/jobs/${id}/edit`}>
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">Edit</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Estimated Value</p>
            <p className="text-lg font-bold">{job.estimated_value ? formatCurrency(job.estimated_value) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Invoiced</p>
            <p className="text-lg font-bold">{formatCurrency(totalInvoiced)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Balance Due</p>
            <p className={`text-lg font-bold ${totalInvoiced - totalPaid > 0 ? "text-orange-600" : "text-green-600"}`}>
              {formatCurrency(totalInvoiced - totalPaid)}
            </p>
          </CardContent>
        </Card>
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
              {job.assigned_to && (
                <div>
                  <p className="text-xs text-muted-foreground">Assigned To</p>
                  <p className="capitalize">{job.assigned_to}</p>
                </div>
              )}
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
                <div className="grid grid-cols-3 gap-1">
                  {photos?.slice(0, 6).map((photo) => (
                    <div key={photo.id} className="aspect-square bg-slate-200 rounded overflow-hidden">
                      <img
                        src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/job-photos/${photo.storage_path}`}
                        alt={photo.caption ?? "Job photo"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column */}
        <div className="md:col-span-2 space-y-4">
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

          {/* Notes */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AddNoteForm jobId={id} />
              <div className="mt-4 space-y-3">
                {notes?.map((note) => (
                  <div key={note.id} className="text-sm border-l-2 border-slate-200 pl-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium capitalize text-xs">{note.author}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(note.created_at)}</span>
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Payments */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Payment Records</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!payments?.length && (
                <p className="text-sm text-muted-foreground text-center py-2">No payments recorded.</p>
              )}
              {payments?.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-2 border rounded text-sm">
                  <div>
                    <p className="font-medium">{formatDate(payment.payment_date)}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {payment.method ?? "—"}{payment.reference ? ` · ${payment.reference}` : ""}
                    </p>
                  </div>
                  <p className="font-semibold text-green-700">{formatCurrency(payment.amount)}</p>
                </div>
              ))}
              <div className="pt-2 border-t flex justify-between text-sm font-semibold">
                <span>Total Paid</span>
                <span className="text-green-700">{formatCurrency(totalPaid)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Designer Commissions */}
          {(commissions?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Designer Commissions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {commissions?.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-2 border rounded text-sm">
                    <div>
                      <p className="font-medium">{c.amount ? formatCurrency(c.amount) : "Amount TBD"}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(c.submitted_at)}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      c.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {c.status}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

