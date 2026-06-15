"use client";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import type { Customer } from "@/lib/types/database";

const schema = z.object({
  first_name:    z.string().min(1, "First name required"),
  last_name:     z.string().min(1, "Last name required"),
  email:         z.string().email("Invalid email").optional().or(z.literal("")),
  phone:         z.string().optional(),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  city:          z.string().optional(),
  state:         z.string().optional(),
  zip:           z.string().optional(),
  notes:         z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CustomerForm({ customer }: { customer?: Customer }) {
  const router = useRouter();
  const supabase = createClient();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: customer
      ? {
          first_name:    customer.first_name,
          last_name:     customer.last_name,
          email:         customer.email ?? "",
          phone:         customer.phone ?? "",
          address_line1: customer.address_line1 ?? "",
          address_line2: customer.address_line2 ?? "",
          city:          customer.city ?? "",
          state:         customer.state ?? "",
          zip:           customer.zip ?? "",
          notes:         customer.notes ?? "",
        }
      : {},
  });

  async function onSubmit(values: FormValues) {
    const data = {
      ...values,
      email:         values.email || null,
      phone:         values.phone || null,
      address_line1: values.address_line1 || null,
      address_line2: values.address_line2 || null,
      city:          values.city || null,
      state:         values.state || null,
      zip:           values.zip || null,
      notes:         values.notes || null,
    };

    if (customer) {
      await supabase.from("customers").update(data).eq("id", customer.id);
      router.push(`/customers/${customer.id}`);
    } else {
      const { data: created } = await supabase.from("customers").insert(data).select().single();
      router.push(`/customers/${created?.id}`);
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First Name *</Label>
              <Input id="first_name" {...register("first_name")} />
              {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last Name *</Label>
              <Input id="last_name" {...register("last_name")} />
              {errors.last_name && <p className="text-xs text-destructive">{errors.last_name.message}</p>}
            </div>
          </div>

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
