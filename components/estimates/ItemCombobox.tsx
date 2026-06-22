"use client";
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn, formatCurrency } from "@/lib/utils";
import type { PricingItem } from "@/lib/types/database";

export function ItemCombobox({
  subgroups,
  value,
  onChange,
  placeholder = "Choose an item...",
}: {
  subgroups: { subcategory: string | null; items: PricingItem[] }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const allItems = subgroups.flatMap((g) => g.items);
  const selected = allItems.find((i) => i.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Type a code or name to search..." />
          <CommandList>
            <CommandEmpty>No matching items.</CommandEmpty>
            {subgroups.map((sub) => (
              <CommandGroup key={sub.subcategory ?? "_"} heading={sub.subcategory ?? undefined}>
                {sub.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.name}
                    onSelect={() => {
                      onChange(item.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", item.id === value ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{item.name}</span>
                    {item.unit_price != null && (
                      <span className="ml-2 text-xs text-muted-foreground font-mono">
                        {formatCurrency(item.unit_price)}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
