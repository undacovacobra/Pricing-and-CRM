import Link from "next/link";
import { ASSIGNEE_DOT_COLORS, assigneeKind, formatTime } from "@/components/calendar/eventStyles";
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
  const today = new Date();
  const todayKey = dayKey(today);

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

      <div className="flex items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple-500" /> Travis</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-pink-500" /> Carol</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Installer</span>
      </div>

      <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden border">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="bg-slate-50 text-center text-[10px] sm:text-xs font-semibold text-slate-500 py-1.5 uppercase tracking-wide">
            {wd}
          </div>
        ))}
        {cells.map((cell) => {
          const visibleEvents = cell.events.slice(0, MAX_CHIPS_PER_DAY);
          const overflow = cell.events.length - visibleEvents.length;
          return (
            <Link
              key={cell.key}
              href={`/calendar?month=${monthParam(monthDate)}&day=${cell.key}`}
              className={`bg-white min-h-[72px] sm:min-h-[100px] p-1 sm:p-1.5 flex flex-col gap-0.5 hover:bg-slate-50 transition-colors ${
                cell.isSelected ? "ring-2 ring-inset ring-slate-900" : ""
              } ${!cell.inCurrentMonth ? "opacity-40" : ""}`}
            >
              <span
                className={`text-[11px] sm:text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                  cell.isToday ? "bg-slate-900 text-white" : "text-slate-700"
                }`}
              >
                {cell.date.getDate()}
              </span>
              <div className="space-y-0.5 overflow-hidden">
                {visibleEvents.map((event) => (
                  <div key={event.id} className="flex items-center gap-1 text-[9px] sm:text-[10px] leading-tight truncate">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${ASSIGNEE_DOT_COLORS[assigneeKind(event.assigned_to)]}`} />
                    <span className="truncate text-slate-700">
                      <span className="hidden sm:inline">{formatTime(event.start_time)} </span>
                      {event.title}
                    </span>
                  </div>
                ))}
                {overflow > 0 && (
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground pl-2.5">+{overflow} more</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
