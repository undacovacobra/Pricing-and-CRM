"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { JOB_STAGES } from "@/components/jobs/JobStageBadge";
import type { Customer, Job, JobStage } from "@/lib/types/database";

const schema = z.object({
  customer_id:        z.string().min(1, "Customer required"),
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

  const defaultCustomerId = job?.customer_id ?? searchParams.get("customer_id") ?? "";

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: job
      ? {
          customer_id:        job.customer_id,
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
          customer_id: defaultCustomerId,
          stage:       "lead",
          assigned_to: "owner",
        },
  });

  const selectedCustomerId = watch("customer_id");

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
  }, [selectedCustomerId, customers]);

  async function onSubmit(values: FormValues) {
    const data = {
      customer_id:        values.customer_id,
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
      await supabase.from("jobs").update(data).eq("id", job.id);
      router.push(`/jobs/${job.id}`);
    } else {
      const { data: created } = await supabase.from("jobs").insert(data).select().single();
      router.push(`/jobs/${created?.id}`);
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
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                    {c.city ? ` — ${c.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.customer_id && <p className="text-xs text-destructive">{errors.customer_id.message}</p>}
          </div>

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
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="designer">Designer</SelectItem>
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

          {/* Contract + Estimated Value */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="contract_amount">Contract Amount ($)</Label>
              <Input id="contract_amount" type="number" step="0.01" {...register("contract_amount")} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estimated_value">Estimated Value ($)</Label>
              <Input id="estimated_value" type="number" step="0.01" {...register("estimated_value")} placeholder="0.00" />
            </div>
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
        </CardContent>
      </Card>

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
