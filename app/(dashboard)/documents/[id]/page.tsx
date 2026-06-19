import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentStatusActions } from "@/components/documents/DocumentStatusActions";
import { AddPaymentForm } from "@/components/documents/AddPaymentForm";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { DocumentType, DocumentStatus } from "@/lib/types/database";

const typeLabels: Record<DocumentType, string> = {
  contract:     "Contract",
  invoice:      "Invoice",
  change_order: "Change Order",
  quote:        "Quote",
};

const statusColors: Record<DocumentStatus, string> = {
  draft:  "bg-gray-100 text-gray-700",
  sent:   "bg-blue-100 text-blue-700",
  signed: "bg-purple-100 text-purple-700",
  paid:   "bg-green-100 text-green-700",
  void:   "bg-red-100 text-red-700",
};

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("*, job:jobs(*, customer:customers!jobs_customer_id_fkey(*)), document_line_items(*)")
    .eq("id", id)
    .single();

  if (!doc) notFound();

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("document_id", id)
    .order("payment_date", { ascending: false });

  const job = doc.job as { id: string; title: string; customer: { first_name: string; last_name: string; email: string | null; phone: string | null; address_line1: string | null; city: string | null; state: string | null } | null } | null;
  const customer = job?.customer;

  const lineItems = doc.document_line_items as { id: string; name: string; description: string | null; quantity: number; unit: string; unit_price: number; line_total: number }[];
  const subtotal = lineItems.reduce((sum, li) => sum + li.line_total, 0);
  const taxAmount = subtotal * (doc.tax_rate ?? 0);
  const total = subtotal + taxAmount - (doc.discount_amount ?? 0);
  const totalPaid = (payments ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const balanceDue = total - (doc.deposit_amount ?? 0) - totalPaid;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/jobs/${job?.id}`} className="text-sm text-muted-foreground hover:underline">
            ← {job?.title}
          </Link>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-bold text-slate-900">{doc.document_number}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[doc.status as DocumentStatus]}`}>
              {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {typeLabels[doc.document_type as DocumentType]}
            {doc.due_date ? ` · Due ${formatDate(doc.due_date)}` : ""}
          </p>
        </div>
        <DocumentStatusActions documentId={id} currentStatus={doc.status as DocumentStatus} jobId={job?.id ?? ""} />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left: Client + Job info */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Bill To</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {customer && (
                <>
                  <p className="font-semibold">{customer.first_name} {customer.last_name}</p>
                  {customer.email && <p className="text-muted-foreground">{customer.email}</p>}
                  {customer.phone && <p className="text-muted-foreground">{customer.phone}</p>}
                  {customer.address_line1 && (
                    <p className="text-muted-foreground">
                      {customer.address_line1}
                      {customer.city ? `, ${customer.city}` : ""}
                      {customer.state ? ` ${customer.state}` : ""}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {(doc.tax_rate ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax ({((doc.tax_rate ?? 0) * 100).toFixed(2)}%)</span>
                  <span>{formatCurrency(taxAmount)}</span>
                </div>
              )}
              {(doc.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(doc.discount_amount ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-2">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
              {(doc.deposit_amount ?? 0) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Deposit</span>
                  <span>-{formatCurrency(doc.deposit_amount ?? 0)}</span>
                </div>
              )}
              {totalPaid > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Payments Recorded</span>
                  <span>-{formatCurrency(totalPaid)}</span>
                </div>
              )}
              <div className={`flex justify-between font-bold text-base border-t pt-2 ${balanceDue > 0 ? "text-orange-600" : "text-green-600"}`}>
                <span>Balance Due</span>
                <span>{formatCurrency(balanceDue)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Line Items + Payments */}
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Item</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Qty</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Price</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lineItems.map((li) => (
                    <tr key={li.id}>
                      <td className="py-2">
                        <p className="font-medium">{li.name}</p>
                        {li.description && <p className="text-xs text-muted-foreground">{li.description}</p>}
                      </td>
                      <td className="py-2 text-center">{li.quantity} {li.unit}</td>
                      <td className="py-2 text-right font-mono">{formatCurrency(li.unit_price)}</td>
                      <td className="py-2 text-right font-mono font-semibold">{formatCurrency(li.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {doc.client_notes && (
                <div className="mt-4 pt-4 border-t text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="whitespace-pre-wrap">{doc.client_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Record Payment */}
          {doc.status !== "paid" && doc.status !== "void" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Record Payment</CardTitle>
              </CardHeader>
              <CardContent>
                <AddPaymentForm documentId={id} jobId={job?.id ?? ""} maxAmount={balanceDue} />
              </CardContent>
            </Card>
          )}

          {/* Payment History */}
          {(payments?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Payment History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {payments?.map((p) => (
                  <div key={p.id} className="flex justify-between text-sm py-1 border-b last:border-0">
                    <div>
                      <p>{formatDate(p.payment_date)}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {p.method ?? "—"}{p.reference ? ` · ${p.reference}` : ""}
                      </p>
                    </div>
                    <p className="font-semibold text-green-700">{formatCurrency(p.amount)}</p>
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
