"use client";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import type { AppSettings } from "@/lib/types/database";
import { useState } from "react";

type FormValues = {
  company_name:     string;
  company_address:  string;
  company_phone:    string;
  company_email:    string;
  payment_terms:    string;
  default_tax_rate: string;
};

export function SettingsForm({ settings }: { settings: AppSettings | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [saved, setSaved] = useState(false);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: {
      company_name:     settings?.company_name ?? "",
      company_address:  settings?.company_address ?? "",
      company_phone:    settings?.company_phone ?? "",
      company_email:    settings?.company_email ?? "",
      payment_terms:    settings?.payment_terms ?? "Payment due within 30 days.",
      default_tax_rate: settings?.default_tax_rate != null ? (settings.default_tax_rate * 100).toFixed(2) : "0",
    },
  });

  async function onSubmit(values: FormValues) {
    const data = {
      company_name:     values.company_name,
      company_address:  values.company_address || null,
      company_phone:    values.company_phone || null,
      company_email:    values.company_email || null,
      payment_terms:    values.payment_terms || null,
      default_tax_rate: parseFloat(values.default_tax_rate) / 100 || 0,
    };

    if (settings) {
      await supabase.from("app_settings").update(data).eq("id", settings.id);
    } else {
      await supabase.from("app_settings").insert(data);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="company_name">Company Name *</Label>
            <Input id="company_name" {...register("company_name")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company_address">Address</Label>
            <Textarea id="company_address" {...register("company_address")} rows={2} placeholder="123 Studio Lane, City, State ZIP" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="company_phone">Phone</Label>
              <Input id="company_phone" {...register("company_phone")} placeholder="(555) 000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company_email">Email</Label>
              <Input id="company_email" type="email" {...register("company_email")} placeholder="studio@example.com" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment_terms">Default Payment Terms</Label>
            <Textarea id="payment_terms" {...register("payment_terms")} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="default_tax_rate">Default Tax Rate (%)</Label>
            <Input id="default_tax_rate" type="number" step="0.01" {...register("default_tax_rate")} placeholder="8.25" />
          </div>
        </CardContent>
      </Card>
      <Button type="submit" disabled={isSubmitting}>
        {saved ? "Saved!" : isSubmitting ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  );
}
