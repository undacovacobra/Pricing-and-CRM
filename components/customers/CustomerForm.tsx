"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { customerName } from "@/lib/utils";
import { CUSTOMER_TYPE_LABELS, UMBRELLA_CUSTOMER_TYPES, type Customer, type CustomerType } from "@/lib/types/database";

const schema = z.object({
  customer_type:      z.enum(["individual", "builder", "contractor", "designer", "repeat"]),
  parent_customer_id: z.string().optional(),
  first_name:         z.string().min(1, "Name required"),
  last_name:          z.string().optional(),
  email:              z.string().email("Invalid email").optional().or(z.literal("")),
  phone:              z.string().optional(),
  address_line1:      z.string().optional(),
  address_line2:      z.string().optional(),
  city:               z.string().optional(),
  state:              z.string().optional(),
  zip:                z.string().optional(),
  notes:              z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CustomerForm({ customer, parents }: { customer?: Customer; parents: Customer[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: customer
      ? {
          customer_type:      customer.customer_type,
          parent_customer_id: customer.parent_customer_id ?? "",
          first_name:         customer.first_name,
          last_name:          customer.last_name ?? "",
          email:              customer.email ?? "",
          phone:              customer.phone ?? "",
          address_line1:      customer.address_line1 ?? "",
          address_line2:      customer.address_line2 ?? "",
          city:               customer.city ?? "",
          state:              customer.state ?? "",
          zip:                customer.zip ?? "",
          notes:              customer.notes ?? "",
        }
      : { customer_type: "individual", parent_customer_id: "" },
  });

  const customerType = watch("customer_type") as CustomerType;
  const isUmbrella = UMBRELLA_CUSTOMER_TYPES.includes(customerType);
  // Don't allow nesting an umbrella under itself when editing.
  const parentOptions = parents.filter((p) => p.id !== customer?.id);

  async function onSubmit(values: FormValues) {
    setSubmitError(null);

    if (!isUmbrella && !values.last_name?.trim()) {
      setSubmitError("Last name is required for an individual customer.");
      return;
    }

    const data = {
      customer_type:      values.customer_type,
      parent_customer_id: isUmbrella ? null : (values.parent_customer_id || null),
      first_name:         values.first_name.trim(),
      last_name:          isUmbrella ? "" : (values.last_name?.trim() ?? ""),
      email:              values.email || null,
      phone:              values.phone || null,
      address_line1:      values.address_line1 || null,
      address_line2:      values.address_line2 || null,
      city:               values.city || null,
      state:              values.state || null,
      zip:                values.zip || null,
      notes:              values.notes || null,
    };

    if (customer) {
      const { error } = await supabase.from("customers").update(data).eq("id", customer.id);
      if (error) { setSubmitError(error.message); return; }
      if (isUmbrella) await ensureCustomerFolder(customer.id);
      router.push(`/customers/${customer.id}`);
    } else {
      const { data: created, error } = await supabase.from("customers").insert(data).select().single();
      if (error || !created?.id) { setSubmitError(error?.message ?? "Failed to save customer. Please try again."); return; }
      if (isUmbrella) await ensureCustomerFolder(created.id);
      router.push(`/customers/${created.id}`);
    }
    router.refresh();
  }

  // Best-effort: auto-create a master Drive folder for umbrella customers.
  // No-ops if Google Drive isn't connected/configured.
  async function ensureCustomerFolder(customerId: string) {
    try {
      await fetch("/api/google/create-customer-folder", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ customerId }),
      });
    } catch {
      // ignore — folder creation is non-blocking
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Customer Type */}
          <div className="space-y-1.5">
            <Label>Customer Type</Label>
            <Select value={customerType} onValueChange={(v) => setValue("customer_type", v as CustomerType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CUSTOMER_TYPE_LABELS) as CustomerType[]).map((t) => (
                  <SelectItem key={t} value={t}>{CUSTOMER_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {isUmbrella
                ? "This is a larger customer base (e.g. a builder). Individual customers and jobs can be placed under it, and it gets its own master Google Drive folder."
                : "A regular customer. You can optionally place them under a larger customer base below."}
            </p>
          </div>

          {/* Name */}
          {isUmbrella ? (
            <div className="space-y-1.5">
              <Label htmlFor="first_name">Business / Builder Name *</Label>
              <Input id="first_name" {...register("first_name")} placeholder="e.g. Brista Homes" />
              {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input id="first_name" {...register("first_name")} />
                  {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="last_name">Last Name *</Label>
                  <Input id="last_name" {...register("last_name")} />
                </div>
              </div>

              {/* Belongs to (larger customer base) */}
              <div className="space-y-1.5">
                <Label>Belongs to (larger customer base)</Label>
                <Select
                  value={watch("parent_customer_id") || "none"}
                  onValueChange={(v) => setValue("parent_customer_id", v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None — standalone customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None — standalone customer</SelectItem>
                    {parentOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {customerName(p)} ({CUSTOMER_TYPE_LABELS[p.customer_type]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {parentOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No larger customer bases yet. Create one by adding a customer of type Builder, Contractor, Designer, or Repeat customer.
                  </p>
                )}
              </div>
            </>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} placeholder="client@example.com" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" {...register("phone")} placeholder="(555) 000-0000" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address_line1">Address</Label>
            <Input id="address_line1" {...register("address_line1")} placeholder="123 Main St" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address_line2">Address Line 2</Label>
            <Input id="address_line2" {...register("address_line2")} placeholder="Apt, Suite, etc." />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5 col-span-1 md:col-span-1">
              <Label htmlFor="city">City</Label>
              <Input id="city" {...register("city")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">State</Label>
              <Input id="state" {...register("state")} placeholder="TX" maxLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zip">ZIP</Label>
              <Input id="zip" {...register("zip")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} placeholder="Any notes about this customer..." rows={3} />
          </div>
        </CardContent>
      </Card>

      {submitError && (
        <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-md px-3 py-2">{submitError}</p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : customer ? "Save Changes" : "Create Customer"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
