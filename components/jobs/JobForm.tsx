"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { triggerBackup } from "@/lib/backup/trigger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { JOB_STAGES } from "@/components/jobs/JobStageBadge";
import { customerName } from "@/lib/utils";
import { CUSTOMER_TYPE_LABELS, UMBRELLA_CUSTOMER_TYPES, type Customer, type Job, type JobStage } from "@/lib/types/database";

const schema = z.object({
  customer_id:        z.string().min(1, "Customer required"),
  parent_customer_id: z.string().optional(),
  title:              z.string().min(1, "Job title required"),
  description:        z.string().optional(),
  stage:              z.string().min(1),
  job_address:        z.string().optional(),
  contract_amount:    z.string().optional(),
  estimated_value:    z.string().optional(),
  start_date:         z.string().optional(),
  estimated_end_date: z.string().optional(),
  assigned_to:        z.string().optional(),
  notes:              z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function JobForm({ job, customers }: { job?: Job; customers: Customer[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const defaultCustomerId = job?.customer_id ?? searchParams.get("customer_id") ?? "";

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: job
      ? {
          customer_id:        job.customer_id,
          parent_customer_id: job.parent_customer_id ?? "",
          title:              job.title,
          description:        job.description ?? "",
          stage:              job.stage,
          job_address:        job.job_address ?? "",
          contract_amount:    job.contract_amount?.toString() ?? "",
          estimated_value:    job.estimated_value?.toString() ?? "",
          start_date:         job.start_date ?? "",
          estimated_end_date: job.estimated_end_date ?? "",
          assigned_to:        job.assigned_to ?? "owner",
          notes:              job.notes ?? "",
        }
      : {
          customer_id:        defaultCustomerId,
          parent_customer_id: "",
          stage:              "lead",
          assigned_to:        "owner",
        },
  });

  const selectedCustomerId = watch("customer_id");

  // Umbrella customers (builders, contractors, etc.) are the selectable
  // "larger customer bases"; the actual job customer is everyone else.
  const umbrellaCustomers = customers.filter((c) => UMBRELLA_CUSTOMER_TYPES.includes(c.customer_type));
  const individualCustomers = customers.filter((c) => !UMBRELLA_CUSTOMER_TYPES.includes(c.customer_type));

  // Auto-fill job address from customer address when customer selected and no job address
  const [customerAddress, setCustomerAddress] = useState<string>("");

  useEffect(() => {
    if (!selectedCustomerId) return;
    const customer = customers.find((c) => c.id === selectedCustomerId);
    if (customer?.address_line1) {
      const addr = [customer.address_line1, customer.city, customer.state]
        .filter(Boolean).join(", ");
      setCustomerAddress(addr);
    }
    // Default the larger customer base to whatever this customer belongs to.
    if (customer?.parent_customer_id) {
      setValue("parent_customer_id", customer.parent_customer_id);
    }
  }, [selectedCustomerId, customers, setValue]);

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    const data = {
      customer_id:        values.customer_id,
      parent_customer_id: values.parent_customer_id || null,
      title:              values.title,
      description:        values.description || null,
      stage:              values.stage as JobStage,
      job_address:        values.job_address || null,
      contract_amount:    values.contract_amount ? parseFloat(values.contract_amount) : null,
      estimated_value:    values.estimated_value ? parseFloat(values.estimated_value) : null,
      start_date:         values.start_date || null,
      estimated_end_date: values.estimated_end_date || null,
      assigned_to:        values.assigned_to || "owner",
      notes:              values.notes || null,
    };

    if (job) {
      const { error } = await supabase.from("jobs").update(data).eq("id", job.id);
      if (error) { setSubmitError(error.message); return; }
      triggerBackup({ jobId: job.id });
      router.push(`/jobs/${job.id}`);
    } else {
      const { data: created, error } = await supabase.from("jobs").insert(data).select().single();
      if (error || !created?.id) { setSubmitError(error?.message ?? "Failed to create job. Please try again."); return; }
      // Best-effort: auto-create a matching Google Drive folder. No-ops if the
      // user hasn't connected Google Drive or it isn't configured.
      try {
        await fetch("/api/google/create-folder", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ jobId: created.id }),
        });
      } catch {
        // ignore — folder creation is non-blocking
      }
      triggerBackup({ jobId: created.id });
      router.push(`/jobs/${created.id}`);
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Customer */}
          <div className="space-y-1.5">
            <Label>Customer *</Label>
            <Select
              value={watch("customer_id")}
              onValueChange={(v) => setValue("customer_id", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a customer..." />
              </SelectTrigger>
              <SelectContent>
                {individualCustomers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {customerName(c)}
                    {c.city ? ` — ${c.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.customer_id && <p className="text-xs text-destructive">{errors.customer_id.message}</p>}
          </div>

          {/* Larger customer base */}
          {umbrellaCustomers.length > 0 && (
            <div className="space-y-1.5">
              <Label>Contractor/Builder</Label>
              <Select
                value={watch("parent_customer_id") || "none"}
                onValueChange={(v) => setValue("parent_customer_id", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="N/A" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">N/A</SelectItem>
                  {umbrellaCustomers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {customerName(c)} ({CUSTOMER_TYPE_LABELS[c.customer_type]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                If this job is for a builder/contractor/etc., pick them here so it&apos;s grouped under their master folder.
              </p>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Job Title *</Label>
            <Input id="title" {...register("title")} placeholder="e.g. Kitchen Remodel — Smith House" />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          {/* Stage + Assigned */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={watch("stage")} onValueChange={(v) => setValue("stage", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assigned To</Label>
              <Select value={watch("assigned_to") ?? "owner"} onValueChange={(v) => setValue("assigned_to", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Travis</SelectItem>
                  <SelectItem value="designer">Carol</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register("description")} placeholder="Scope of work..." rows={3} />
          </div>

          {/* Job Address */}
          <div className="space-y-1.5">
            <Label htmlFor="job_address">
              Job Address
              {customerAddress && !job?.job_address && (
                <button
                  type="button"
                  className="ml-2 text-xs text-blue-600 hover:underline"
                  onClick={() => setValue("job_address", customerAddress)}
                >
                  Use customer address
                </button>
              )}
            </Label>
            <Input id="job_address" {...register("job_address")} placeholder="Job site address (if different from customer)" />
          </div>

          {/* Contract Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="contract_amount">Contract Amount ($)</Label>
            <Input id="contract_amount" type="number" step="0.01" {...register("contract_amount")} placeholder="0.00" />
          </div>

          {job && (
            <>
              {/* Estimated Value */}
              <div className="space-y-1.5">
                <Label htmlFor="estimated_value">Estimated Value ($)</Label>
                <Input id="estimated_value" type="number" step="0.01" {...register("estimated_value")} placeholder="0.00" />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input id="start_date" type="date" {...register("start_date")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="estimated_end_date">Est. End Date</Label>
                  <Input id="estimated_end_date" type="date" {...register("estimated_end_date")} />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="notes">Internal Notes</Label>
                <Textarea id="notes" {...register("notes")} placeholder="Private notes about this job..." rows={2} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {submitError && (
        <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-md px-3 py-2">{submitError}</p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : job ? "Save Changes" : "Create Job"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
