"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { formatCurrency } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface Props {
  jobId:            string;
  contractAmount:   number;
  changeOrderTotal: number;
  retainerAmount:      number | null;
  payDepositPaid:      boolean;
  payDepositAmount:    number | null;
  payDeliveryPaid:     boolean;
  payDeliveryAmount:   number | null;
  payCompletionPaid:   boolean;
  payCompletionAmount: number | null;
  changeOrdersPaid:    boolean;
}

const MILESTONES = [
  { key: "deposit",    label: "Deposit",    sub: "50% on signing",     pct: 0.5 },
  { key: "delivery",   label: "Delivery",   sub: "40% upon delivery",  pct: 0.4 },
  { key: "completion", label: "Completion", sub: "10% upon completion", pct: 0.1 },
] as const;

export function PaymentTracker(props: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [retainer, setRetainer] = useState<number>(props.retainerAmount ?? 0);
  const [paid, setPaid] = useState({
    deposit:    props.payDepositPaid,
    delivery:   props.payDeliveryPaid,
    completion: props.payCompletionPaid,
  });
  const [custom, setCustom] = useState<Record<string, number | null>>({
    deposit:    props.payDepositAmount,
    delivery:   props.payDeliveryAmount,
    completion: props.payCompletionAmount,
  });
  const [coPaid, setCoPaid] = useState<boolean>(props.changeOrdersPaid);

  const calc = {
    deposit:    Math.round(props.contractAmount * 0.5 * 100) / 100,
    delivery:   Math.round(props.contractAmount * 0.4 * 100) / 100,
    completion: Math.round(props.contractAmount * 0.1 * 100) / 100,
  };
  const effective = (key: "deposit" | "delivery" | "completion") => custom[key] ?? calc[key];

  const milestonePaid =
    (paid.deposit ? effective("deposit") : 0) +
    (paid.delivery ? effective("delivery") : 0) +
    (paid.completion ? effective("completion") : 0);
  const changeOrdersPaidAmount = coPaid ? props.changeOrderTotal : 0;
  const totalPaid = retainer + milestonePaid + changeOrdersPaidAmount;
  const balanceDue = props.contractAmount + props.changeOrderTotal - totalPaid;

  async function persist(patch: Record<string, unknown>) {
    await supabase.from("jobs").update(patch).eq("id", props.jobId);
    router.refresh();
  }

  function togglePaid(key: "deposit" | "delivery" | "completion") {
    const next = !paid[key];
    setPaid((p) => ({ ...p, [key]: next }));
    persist({
      [`pay_${key}_paid`]:    next,
      [`pay_${key}_paid_at`]: next ? new Date().toISOString() : null,
    });
  }

  function commitCustom(key: "deposit" | "delivery" | "completion", raw: string) {
    const num = raw.trim() === "" ? null : Number(raw);
    // If it matches the calculated default, store null so it tracks the contract.
    const value = num === null || Number.isNaN(num) ? null : (num === calc[key] ? null : num);
    setCustom((c) => ({ ...c, [key]: value }));
    persist({ [`pay_${key}_amount`]: value });
  }

  function commitRetainer(raw: string) {
    const num = raw.trim() === "" ? 0 : Number(raw);
    const value = Number.isNaN(num) ? 0 : num;
    setRetainer(value);
    persist({ retainer_amount: value });
  }

  function toggleCoPaid() {
    const next = !coPaid;
    setCoPaid(next);
    persist({
      change_orders_paid:    next,
      change_orders_paid_at: next ? new Date().toISOString() : null,
    });
  }

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Card className="cursor-pointer hover:bg-slate-50 transition-colors">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                Total Paid <ChevronDown className="h-3 w-3" />
              </p>
              <p className="text-lg font-bold text-green-700">{formatCurrency(totalPaid)}</p>
            </CardContent>
          </Card>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-semibold text-slate-900">Payment Breakdown</p>
              <p className="text-xs text-muted-foreground">Check off what&apos;s been paid. Amounts auto-calculate from the contract; edit any if a different amount was paid.</p>
            </div>

            {/* Retainer */}
            <div className="flex items-center justify-between gap-2 border-b pb-2">
              <label className="text-xs font-medium">Retainer</label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">$</span>
                <input
                  type="number"
                  defaultValue={retainer || ""}
                  onBlur={(e) => commitRetainer(e.target.value)}
                  className="w-24 rounded border px-2 py-1 text-xs text-right"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Contract milestones */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">Contract ({formatCurrency(props.contractAmount)})</p>
              {props.contractAmount <= 0 && (
                <p className="text-xs text-muted-foreground">Add a contract amount to enable milestones.</p>
              )}
              {props.contractAmount > 0 && MILESTONES.map((m) => (
                <div key={m.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={paid[m.key]}
                    onChange={() => togglePaid(m.key)}
                    className="h-4 w-4 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium leading-tight">{m.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{m.sub}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-muted-foreground">$</span>
                    <input
                      type="number"
                      defaultValue={effective(m.key)}
                      onBlur={(e) => commitCustom(m.key, e.target.value)}
                      className="w-24 rounded border px-2 py-1 text-xs text-right"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Change orders */}
            <div className="border-t pt-2 space-y-1">
              <p className="text-xs font-medium text-slate-700">Change Orders</p>
              {props.changeOrderTotal <= 0 ? (
                <p className="text-xs text-muted-foreground">No change orders yet.</p>
              ) : (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={coPaid} onChange={toggleCoPaid} className="h-4 w-4 shrink-0" />
                  <span className="text-xs flex-1">Paid in full (100% up front)</span>
                  <span className="text-xs font-medium">{formatCurrency(props.changeOrderTotal)}</span>
                </label>
              )}
            </div>

            <div className="border-t pt-2 flex items-center justify-between">
              <span className="text-xs font-semibold">Total Paid</span>
              <span className="text-sm font-bold text-green-700">{formatCurrency(totalPaid)}</span>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Balance Due</p>
          <p className={`text-lg font-bold ${balanceDue > 0 ? "text-orange-600" : "text-green-600"}`}>
            {formatCurrency(balanceDue)}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
