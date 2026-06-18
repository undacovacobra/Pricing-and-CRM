"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import { Plus, Trash2, Receipt } from "lucide-react";
import type { MaterialOrder } from "@/lib/types/database";

export function MaterialOrdersSection({ jobId, orders }: { jobId: string; orders: MaterialOrder[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [adding, setAdding] = useState(false);
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [orderedAt, setOrderedAt] = useState("");
  const [estimatedArrival, setEstimatedArrival] = useState("");
  const [actualArrival, setActualArrival] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingReceiptId, setUploadingReceiptId] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  async function handleAdd() {
    if (!vendor.trim()) return;
    setSaving(true);
    await supabase.from("material_orders").insert({
      job_id:            jobId,
      vendor:            vendor.trim(),
      description:       description.trim() || null,
      ordered_at:        orderedAt || null,
      estimated_arrival: estimatedArrival || null,
      actual_arrival:    actualArrival || null,
      notes:             notes.trim() || null,
    });
    setSaving(false);
    setAdding(false);
    setVendor(""); setDescription(""); setOrderedAt("");
    setEstimatedArrival(""); setActualArrival(""); setNotes("");
    router.refresh();
  }

  async function handleDelete(id: string) {
    await supabase.from("material_orders").delete().eq("id", id);
    router.refresh();
  }

  async function markReceived(order: MaterialOrder) {
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("material_orders").update({ actual_arrival: today }).eq("id", order.id);
    router.refresh();
  }

  function triggerReceiptUpload(orderId: string) {
    setUploadingReceiptId(orderId);
    receiptInputRef.current?.click();
  }

  async function handleReceiptSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const orderId = uploadingReceiptId;
    if (!file || !orderId) return;

    const path = `${jobId}/receipts/${orderId}-${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("job-attachments").upload(path, file);
    if (!uploadErr) {
      await supabase.from("material_orders").update({
        receipt_storage_path: path,
        receipt_file_name:    file.name,
      }).eq("id", orderId);
    }
    setUploadingReceiptId(null);
    e.target.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <input ref={receiptInputRef} type="file" className="hidden" onChange={handleReceiptSelected} />
      {orders.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground text-center py-3">No material orders tracked yet.</p>
      )}

      {orders.map((order) => {
        const received = !!order.actual_arrival;
        const late = order.estimated_arrival && !order.actual_arrival && new Date(order.estimated_arrival) < new Date();
        return (
          <div key={order.id} className={`border rounded-lg p-3 space-y-1 ${received ? "opacity-60" : late ? "border-orange-300 bg-orange-50" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{order.vendor}</p>
                  {received && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Received</span>}
                  {late && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">Overdue</span>}
                </div>
                {order.description && <p className="text-xs text-muted-foreground">{order.description}</p>}
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                  {order.ordered_at && <span>Ordered: {formatDate(order.ordered_at)}</span>}
                  {order.estimated_arrival && <span>Est. arrival: {formatDate(order.estimated_arrival)}</span>}
                  {order.actual_arrival && <span className="text-green-700">Received: {formatDate(order.actual_arrival)}</span>}
                </div>
                {order.notes && <p className="text-xs text-muted-foreground italic mt-1">{order.notes}</p>}
                {order.receipt_storage_path && (
                  <a
                    href={`${SUPABASE_URL}/storage/v1/object/public/job-attachments/${order.receipt_storage_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
                  >
                    <Receipt className="h-3 w-3" /> {order.receipt_file_name ?? "View Receipt"}
                  </a>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {!received && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markReceived(order)}>
                    Mark Received
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => triggerReceiptUpload(order.id)}>
                  {order.receipt_storage_path ? "Replace Receipt" : "Upload Receipt"}
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleDelete(order.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      {adding ? (
        <div className="border rounded-lg p-3 bg-slate-50 space-y-3">
          <p className="text-sm font-medium">Add Material Order</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Vendor *</Label>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor name" className="h-8 text-sm" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was ordered" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date Ordered</Label>
              <Input type="date" value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Est. Arrival</Label>
              <Input type="date" value={estimatedArrival} onChange={(e) => setEstimatedArrival(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Order number, tracking, etc." className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving || !vendor.trim()}>
              {saving ? "Saving..." : "Add Order"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setAdding(true)}>
          <Plus className="h-3 w-3 mr-1" /> Add Material Order
        </Button>
      )}
    </div>
  );
}
