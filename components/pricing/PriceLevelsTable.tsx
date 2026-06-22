"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { PriceLevel } from "@/lib/types/database";

export function PriceLevelsTable({ priceLevels }: { priceLevels: PriceLevel[] }) {
  const supabase = createClient();
  const [levels, setLevels] = useState(priceLevels);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function handleMultiplierChange(id: string, value: string) {
    const multiplier = parseFloat(value);
    setLevels((prev) => prev.map((l) => (l.id === id ? { ...l, multiplier: parseFloat(value) || 0 } : l)));
    if (!(multiplier > 0)) return;

    setSavingId(id);
    try {
      await supabase.from("cabinet_lines").update({ multiplier }).eq("id", id);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 font-medium text-muted-foreground">Price Level</th>
              <th className="pb-2 font-medium text-muted-foreground text-right">Multiplier</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {levels.map((level) => (
              <tr key={level.id}>
                <td className="py-2.5">
                  <span className="font-medium">{level.name}</span>
                  {level.is_base && (
                    <Badge variant="secondary" className="ml-2 text-xs">Base</Badge>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={Number(level.multiplier)}
                    onChange={(e) => handleMultiplierChange(level.id, e.target.value)}
                    className="w-24 ml-auto text-right"
                  />
                  {savingId === level.id && (
                    <span className="block text-[10px] text-muted-foreground mt-0.5">Saving...</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
