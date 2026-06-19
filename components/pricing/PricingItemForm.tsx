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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import type { PricingItem } from "@/lib/types/database";

const CATEGORIES = [
  "Cabinets",
  "Countertop Materials",
  "Countertop Installation",
  "Design Services",
  "Labor",
  "Hardware",
  "Permits & Fees",
  "Subcontractors",
  "Other",
];

const UNITS = ["each", "sq ft", "linear ft", "hour", "lot", "unit"];

const schema = z.object({
  name:                       z.string().min(1, "Name required"),
  category:                   z.string().min(1, "Category required"),
  subcategory:                z.string().optional(),
  unit:                       z.string().min(1, "Unit required"),
  unit_price:                 z.string().optional(),
  description:                z.string().optional(),
  applies_to_cabinet_lines:   z.boolean(),
  is_active:                  z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function PricingItemForm({ item }: { item?: PricingItem }) {
  const router = useRouter();
  const supabase = createClient();

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: item
      ? {
          name:                     item.name,
          category:                 item.category,
          subcategory:              item.subcategory ?? "",
          unit:                     item.unit,
          unit_price:               item.unit_price?.toString() ?? "",
          description:              item.description ?? "",
          applies_to_cabinet_lines: item.applies_to_cabinet_lines,
          is_active:                item.is_active,
        }
      : {
          category: "Cabinets",
          unit:     "each",
          applies_to_cabinet_lines: false,
          is_active: true,
        },
  });

  async function onSubmit(values: FormValues) {
    const data = {
      name:                     values.name,
      category:                 values.category,
      subcategory:              values.subcategory || null,
      unit:                     values.unit,
      unit_price:               values.unit_price ? parseFloat(values.unit_price) : null,
      description:              values.description || null,
      applies_to_cabinet_lines: values.applies_to_cabinet_lines,
      is_active:                values.is_active,
    };

    if (item) {
      await supabase.from("pricing_items").update(data).eq("id", item.id);
    } else {
      await supabase.from("pricing_items").insert(data);
    }
    router.push("/pricing");
    router.refresh();
  }

  async function handleDuplicate() {
    if (!item) return;
    await supabase.from("pricing_items").insert({
      ...item,
      id: undefined,
      name: `${item.name} (copy)`,
      created_at: undefined,
      updated_at: undefined,
    });
    router.push("/pricing");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Item Name *</Label>
            <Input id="name" {...register("name")} placeholder="e.g. Quartz Countertop" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register("description")} placeholder="Optional details about this item..." rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={watch("category")} onValueChange={(v) => setValue("category", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unit *</Label>
              <Select value={watch("unit")} onValueChange={(v) => setValue("unit", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select unit..." />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subcategory">Subcategory</Label>
            <Input id="subcategory" {...register("subcategory")} placeholder="e.g. Drawer base" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unit_price">Base Price ($)</Label>
            <Input id="unit_price" type="number" step="0.01" min="0" {...register("unit_price")} placeholder="Leave blank for manual entry" />
            {errors.unit_price && <p className="text-xs text-destructive">{errors.unit_price.message}</p>}
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                {...register("applies_to_cabinet_lines")}
                className="rounded border-gray-300"
              />
              <span>Apply cabinet line multipliers to this item</span>
            </label>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                {...register("is_active")}
                className="rounded border-gray-300"
              />
              <span>Active</span>
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 flex-wrap">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : item ? "Save Changes" : "Add Item"}
        </Button>
        {item && (
          <Button type="button" variant="outline" onClick={handleDuplicate}>
            Duplicate
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
