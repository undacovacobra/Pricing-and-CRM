import Link from "next/link";
import { ASSIGNEE_DOT_COLORS, assigneeKind, formatTime, localDayKey, TYPE_COLORS, TYPE_DOT_COLORS, TYPE_LABELS } from "@/components/calendar/eventStyles";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEvent } from "@/lib/types/database";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS_PER_DAY = 3;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthCalendar({
  monthDate,
  eventsByDay,
  selectedDay,
}: {
  monthDate: Date;
  eventsByDay: Record<string, CalendarEvent[]>;
  selectedDay?: string;
}) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  const todayKey = localDayKey(new Date().toISOString());

  const prevMonth = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month + 1, 1);

  const cells = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const key = dayKey(date);
    return {
      date,
      key,
      inCurrentMonth: date.getMonth() === month,
      isToday: key === todayKey,
      isSelected: key === selectedDay,
      events: (eventsByDay[key] ?? []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time)),
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(monthDate)}
        </h2>
        <div className="flex items-center gap-1">
          <Link
            href={`/calendar?month=${monthParam(prevMonth)}`}
            className="p-1.5 rounded-md border hover:bg-slate-50 text-slate-600"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link href="/calendar" className="px-2.5 py-1.5 rounded-md border hover:bg-slate-50 text-xs font-medium text-slate-600">
            Today
          </Link>
          <Link
            href={`/calendar?month=${monthParam(nextMonth)}`}
            className="p-1.5 rounded-md border hover:bg-slate-50 text-slate-600"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-slate-600">
          <span className="font-medium text-slate-500">Who:</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> Travis</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-pink-500" /> Carol</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Installer</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-600">
          <span className="font-medium text-slate-500">Type:</span>
          {(["appointment", "install", "delivery", "personal"] as const).map((t) => (
            <span key={t} className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${TYPE_COLORS[t]}`}>
              <span className={`h-2 w-2 rounded-full ${TYPE_DOT_COLORS[t]}`} /> {TYPE_LABELS[t]}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden border">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="bg-slate-50 text-center text-xs sm:text-sm font-semibold text-slate-500 py-2 uppercase tracking-wide">
            {wd}
          </div>
        ))}
        {cells.map((cell) => {
          // When a day is selected, expand it in place: show every appointment
          // (no truncation) and give the cell room to grow so you can read it all.
          const visibleEvents = cell.isSelected ? cell.events : cell.events.slice(0, MAX_CHIPS_PER_DAY);
          const overflow = cell.events.length - visibleEvents.length;
          return (
            <Link
              key={cell.key}
              href={cell.isSelected ? `/calendar?month=${monthParam(monthDate)}` : `/calendar?month=${monthParam(monthDate)}&day=${cell.key}`}
              className={`bg-white p-1 sm:p-1.5 flex flex-col gap-1 hover:bg-slate-50 transition-colors ${
                cell.isSelected ? "max-h-[160px] sm:max-h-[220px] ring-2 ring-inset ring-slate-900 z-10" : "min-h-[88px] sm:min-h-[120px]"
              } ${!cell.inCurrentMonth ? "opacity-40" : ""}`}
            >
              <span
                className={`font-semibold flex items-center justify-center rounded-full ${
                  cell.isSelected ? "text-sm sm:text-base w-7 h-7" : "text-xs sm:text-sm w-6 h-6"
                } ${cell.isToday ? "bg-slate-900 text-white" : "text-slate-700"}`}
              >
                {cell.date.getDate()}
              </span>
              <div className={`space-y-1 ${cell.isSelected ? "overflow-y-auto" : "overflow-hidden"}`}>
                {visibleEvents.map((event) => (
                  <div
                    key={event.id}
                    className={`flex items-center gap-1 rounded px-1 py-0.5 leading-tight ${
                      cell.isSelected ? "text-xs sm:text-sm" : "text-[11px] sm:text-xs truncate"
                    } ${TYPE_COLORS[event.event_type] ?? "bg-slate-100 text-slate-700"}`}
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${ASSIGNEE_DOT_COLORS[assigneeKind(event.assigned_to)]}`} />
                    <span className={cell.isSelected ? "" : "truncate"}>
                      <span className={`font-semibold ${cell.isSelected ? "" : "hidden sm:inline"}`}>{formatTime(event.start_time)} </span>
                      {event.title}
                    </span>
                  </div>
                ))}
                {overflow > 0 && (
                  <p className="text-[11px] sm:text-xs font-medium text-muted-foreground pl-1">+{overflow} more</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
