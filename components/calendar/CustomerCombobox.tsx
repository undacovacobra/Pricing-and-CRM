"use client";
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn, customerName } from "@/lib/utils";
import type { Customer } from "@/lib/types/database";

export function CustomerCombobox({
  customers,
  value,
  onChange,
  placeholder = "None",
}: {
  customers: Customer[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === value) ?? null;

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
            {selected ? `${customerName(selected)}${selected.city ? ` — ${selected.city}` : ""}` : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command
          filter={(value, search) => {
            const v = value.toLowerCase();
            const s = search.toLowerCase().trim();
            if (!s) return 1;
            if (v.includes(s)) return 1;
            return 0;
          }}
        >
          <CommandInput placeholder="Type a customer's name to search..." />
          <CommandList>
            <CommandEmpty>No matching customers.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="none"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4 shrink-0", !value ? "opacity-100" : "opacity-0")} />
                None
              </CommandItem>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={customerName(c)}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", c.id === value ? "opacity-100" : "opacity-0")} />
                  <span className="flex items-baseline gap-1.5 min-w-0 flex-1">
                    <span className="font-medium truncate">{customerName(c)}</span>
                    {c.city && <span className="truncate text-xs text-muted-foreground">{c.city}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
