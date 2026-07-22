import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { DayDetailPanel } from "@/components/calendar/DayDetailPanel";
import { customerName } from "@/lib/utils";
import { localDayKey } from "@/components/calendar/eventStyles";
import { CalendarTasks } from "@/components/tasks/CalendarTasks";
import { roleFromEmail } from "@/lib/tasks/shared";
import type { TaskRow } from "@/components/tasks/TaskItem";
import { Plus, List, X } from "lucide-react";
import type { CalendarEvent } from "@/lib/types/database";

function monthParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Enumerate every "YYYY-MM-DD" day key from start to end inclusive. Keys are
// already local (America/New_York) date strings, so we step through them as
// plain UTC-midnight dates to avoid any timezone drift.
function eachDayKey(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  let d = new Date(`${startKey}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);
  let guard = 0;
  while (d <= end && guard++ < 400) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

function parseMonthParam(month?: string): Date {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  const { month, day } = await searchParams;
  const monthDate = parseMonthParam(month);

  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), 1 - firstOfMonth.getDay());
  const gridEnd = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 42);

  const supabase = await createClient();
  const gs = gridStart.toISOString();
  const ge = gridEnd.toISOString();
  const { data: events } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("status", "scheduled")
    .lt("start_time", ge)
    // Include events that either start in the window or, for multi-day/all-day
    // events, end in it (so a span starting before the visible grid still shows).
    .or(`start_time.gte.${gs},end_time.gte.${gs}`)
    .order("start_time", { ascending: true });

  const eventsByDay: Record<string, CalendarEvent[]> = {};
  for (const event of (events ?? []) as CalendarEvent[]) {
    const startKey = localDayKey(event.start_time);
    const endKey = event.end_time ? localDayKey(event.end_time) : startKey;
    const keys = endKey > startKey ? eachDayKey(startKey, endKey) : [startKey];
    for (const key of keys) (eventsByDay[key] ??= []).push(event);
  }

  const customerIds = Array.from(new Set((events ?? []).map((e) => e.customer_id).filter((id): id is string => Boolean(id))));
  const { data: customers } = customerIds.length
    ? await supabase.from("customers").select("id, first_name, last_name, city, phone, address_line1, state, zip").in("id", customerIds)
    : { data: [] };

  const customerLabels: Record<string, string> = {};
  const customerPhones: Record<string, string> = {};
  const customerAddresses: Record<string, string> = {};
  for (const c of customers ?? []) {
    customerLabels[c.id] = customerName(c) + (c.city ? ` — ${c.city}` : "");
    if (c.phone) customerPhones[c.id] = c.phone;
    const addr = [c.address_line1, c.city, c.state, c.zip].filter(Boolean).join(", ");
    if (addr) customerAddresses[c.id] = addr;
  }

  const [{ data: { user } }, { data: openTasks }, { data: jobs }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("tasks")
      .select("id, title, description, due_date, due_time, assigned_to, status, job_id, job:jobs(title)")
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase.from("jobs").select("id, title").order("updated_at", { ascending: false }),
  ]);
  const defaultRole = roleFromEmail(user?.email);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/calendar/agenda">
              <List className="h-4 w-4" /> <span className="hidden sm:inline">List View</span>
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/calendar/new">
              <Plus className="h-4 w-4" /> New Event
            </Link>
          </Button>
        </div>
      </div>

      <div className="relative">
        <MonthCalendar monthDate={monthDate} eventsByDay={eventsByDay} selectedDay={day} />

        {day && (
          <>
            {/* Transparent click-away layer — closes the popover without dimming the page. */}
            <Link
              href={`/calendar?month=${monthParam(monthDate)}`}
              aria-label="Close"
              className="fixed inset-0 z-40"
            />
            {/* Compact popover that floats over the calendar, just big enough to read the day. */}
            <div className="absolute left-1/2 top-24 z-50 w-[min(22rem,calc(100%-1rem))] -translate-x-1/2 max-h-[60vh] overflow-y-auto rounded-xl bg-white shadow-2xl ring-1 ring-slate-200">
              <Link
                href={`/calendar?month=${monthParam(monthDate)}`}
                aria-label="Close"
                className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </Link>
              <DayDetailPanel dayKey={day} events={eventsByDay[day] ?? []} customerLabels={customerLabels} customerPhones={customerPhones} customerAddresses={customerAddresses} />
            </div>
          </>
        )}
      </div>

      <CalendarTasks
        tasks={(openTasks ?? []) as unknown as TaskRow[]}
        defaultRole={defaultRole}
        jobs={(jobs ?? []) as { id: string; title: string }[]}
      />
    </div>
  );
}
