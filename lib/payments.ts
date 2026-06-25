// Shared payment math for the job-milestone model.
//
// A job's money is tracked as: a contract amount (sum of uploaded contract
// docs) + change orders, paid down via a retainer plus three milestones
// (deposit 50% / delivery 40% / completion 10% of the contract, each
// overridable) and a "change orders paid in full" flag. The job detail page's
// PaymentTracker is the source of truth for this math; this module mirrors it
// so the dashboard agrees.

export interface JobPaymentFields {
  retainer_amount:        number | null;
  pay_deposit_paid:       boolean | null;
  pay_deposit_amount:     number | null;
  pay_deposit_paid_at:    string | null;
  pay_delivery_paid:      boolean | null;
  pay_delivery_amount:    number | null;
  pay_delivery_paid_at:   string | null;
  pay_completion_paid:    boolean | null;
  pay_completion_amount:  number | null;
  pay_completion_paid_at: string | null;
  change_orders_paid:     boolean | null;
  change_orders_paid_at:  string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Default milestone amount when no custom override is stored.
export function milestoneDefault(contractAmount: number, key: "deposit" | "delivery" | "completion"): number {
  const pct = key === "deposit" ? 0.5 : key === "delivery" ? 0.4 : 0.1;
  return round2(contractAmount * pct);
}

export interface JobBalance {
  totalPaid:   number;
  balanceDue:  number;
  contractAndChangeOrders: number;
}

// Total billed and paid for a single job. `contractAmount` and
// `changeOrderTotal` come from the job's contract_documents sums.
export function jobBalance(
  job: JobPaymentFields,
  contractAmount: number,
  changeOrderTotal: number,
): JobBalance {
  const eff = (key: "deposit" | "delivery" | "completion", custom: number | null) =>
    custom ?? milestoneDefault(contractAmount, key);

  const milestonePaid =
    (job.pay_deposit_paid    ? eff("deposit", job.pay_deposit_amount)       : 0) +
    (job.pay_delivery_paid   ? eff("delivery", job.pay_delivery_amount)     : 0) +
    (job.pay_completion_paid ? eff("completion", job.pay_completion_amount) : 0);

  const changeOrdersPaidAmount = job.change_orders_paid ? changeOrderTotal : 0;
  const totalPaid = (job.retainer_amount ?? 0) + milestonePaid + changeOrdersPaidAmount;
  const contractAndChangeOrders = contractAmount + changeOrderTotal;

  return { totalPaid, balanceDue: contractAndChangeOrders - totalPaid, contractAndChangeOrders };
}

// Sum of milestone/change-order payments whose paid-date falls on or after
// `since`. The retainer has no date, so it's excluded from "recent."
export function jobPaidSince(
  job: JobPaymentFields,
  contractAmount: number,
  changeOrderTotal: number,
  since: Date,
): number {
  const eff = (key: "deposit" | "delivery" | "completion", custom: number | null) =>
    custom ?? milestoneDefault(contractAmount, key);
  const within = (at: string | null) => !!at && new Date(at) >= since;

  let sum = 0;
  if (job.pay_deposit_paid    && within(job.pay_deposit_paid_at))    sum += eff("deposit", job.pay_deposit_amount);
  if (job.pay_delivery_paid   && within(job.pay_delivery_paid_at))   sum += eff("delivery", job.pay_delivery_amount);
  if (job.pay_completion_paid && within(job.pay_completion_paid_at)) sum += eff("completion", job.pay_completion_amount);
  if (job.change_orders_paid  && within(job.change_orders_paid_at))  sum += changeOrderTotal;
  return sum;
}
