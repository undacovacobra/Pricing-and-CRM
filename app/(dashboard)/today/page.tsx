import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { customerName, teamMemberName } from "@/lib/utils";
import {
  formatTime,
  localDayKey,
  mapsLink,
  TYPE_COLORS,
  TYPE_LABELS,
  ASSIGNEE_DOT_COLORS,
  assigneeKind,
  APP_TIME_ZONE,
} from "@/components/calendar/eventStyles";
import { TaskItem, type TaskRow } from "@/components/tasks/TaskItem";
import { CalendarDays, ListChecks, MapPin, User, Briefcase, ChevronRight, Sun } from "lucide-react";
import type { CalendarEvent } from "@/lib/types/database";

// A glanceable "what's on today" screen: today's appointments plus any tasks due
// today or overdue. Pairs with the home-screen quick actions so one tap lands here.
export default async function TodayPage() {
  const supabase = await createClient();
  const now = new Date();
  const todayKey = localDayKey(now.toISOString());

  // Pull a small window around now (server runs in UTC) and keep only the
  // events whose America/New_York day is today.
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const [{ data: rawEvents }, { data: rawTasks }] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("*")
      .eq("status", "scheduled")
      .gte("start_time", windowStart.toISOString())
      .lt("start_time", windowEnd.toISOString())
      .order("start_time", { ascending: true }),
    supabase
      .from("tasks")
      .select("id, title, description, due_date, due_time, assigned_to, status, job_id, job:jobs(title)")
      .eq("status", "open")
      .lte("due_date", todayKey)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("due_time", { ascending: true, nullsFirst: true }),
  ]);

  const events = ((rawEvents ?? []) as CalendarEvent[]).filter((e) => localDayKey(e.start_time) === todayKey);
  const tasks = (rawTasks ?? []) as unknown as TaskRow[];

  const customerIds = Array.from(new Set(events.map((e) => e.customer_id).filter((id): id is string => Boolean(id))));
  const { data: customers } = customerIds.length
    ? await supabase.from("customers").select("id, first_name, last_name, city").in("id", customerIds)
    : { data: [] };
  const customerLabels: Record<string, string> = {};
  for (const c of customers ?? []) {
    customerLabels[c.id] = customerName(c) + (c.city ? ` — ${c.city}` : "");
  }

  const heading = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: APP_TIME_ZONE,
  }).format(now);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Sun className="h-6 w-6" /> Today
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{heading}</p>
      </div>

      {/* Schedule */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Schedule
          </h2>
          <Link href="/calendar" className="text-xs text-blue-600 hover:underline inline-flex items-center">
            Full calendar <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-lg border bg-white px-3 py-4 text-center">
            Nothing scheduled today.
          </p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="rounded-lg border bg-white px-3 py-2.5 space-y-1">
              <Link href={`/calendar/${event.id}/edit`} className="block">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{formatTime(event.start_time)}</span>
                  <span className="text-sm font-medium truncate">{event.title}</span>
                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${TYPE_COLORS[event.event_type] ?? "bg-slate-100 text-slate-600"}`}>
                    {TYPE_LABELS[event.event_type] ?? event.event_type}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                  <span className={`h-2 w-2 rounded-full ${ASSIGNEE_DOT_COLORS[assigneeKind(event.assigned_to)]}`} />
                  <User className="h-3 w-3" /> {teamMemberName(event.assigned_to)}
                  {event.customer_id && customerLabels[event.customer_id] && (
                    <>
                      <Briefcase className="h-3 w-3 ml-2" /> {customerLabels[event.customer_id]}
                    </>
                  )}
                </div>
              </Link>
              {event.location && (
                <a
                  href={mapsLink(event.location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  <MapPin className="h-3 w-3 shrink-0" /> {event.location}
                </a>
              )}
            </div>
          ))
        )}
      </section>

      {/* Tasks due today / overdue */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Tasks due
          </h2>
          <Link href="/tasks" className="text-xs text-blue-600 hover:underline inline-flex items-center">
            All tasks <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-lg border bg-white px-3 py-4 text-center">
            Nothing due today. Nice.
          </p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <TaskItem key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
