"use client";
import { useState } from "react";
import Link from "next/link";
import { ASSIGNEE_DOT_COLORS, assigneeKind, formatTime, localDayKey, TYPE_COLORS, TYPE_DOT_COLORS, TYPE_LABELS } from "@/components/calendar/eventStyles";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DayDetailPanel } from "@/components/calendar/DayDetailPanel";
import { Plus } from "lucide-react";
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
  customerLabels,
}: {
  monthDate: Date;
  eventsByDay: Record<string, CalendarEvent[]>;
  customerLabels: Record<string, string>;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);

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
      events: (eventsByDay[key] ?? []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time)),
    };
  });

  const openHeading = openDay
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${openDay}T00:00:00`))
    : "";

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
          const visibleEvents = cell.events.slice(0, MAX_CHIPS_PER_DAY);
          const overflow = cell.events.length - visibleEvents.length;
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => setOpenDay(cell.key)}
              className={`bg-white min-h-[88px] sm:min-h-[120px] p-1 sm:p-1.5 flex flex-col gap-1 hover:bg-slate-50 transition-colors text-left ${
                !cell.inCurrentMonth ? "opacity-40" : ""
              }`}
            >
              <span
                className={`text-xs sm:text-sm font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                  cell.isToday ? "bg-slate-900 text-white" : "text-slate-700"
                }`}
              >
                {cell.date.getDate()}
              </span>
              <div className="space-y-1 overflow-hidden w-full">
                {visibleEvents.map((event) => (
                  <div
                    key={event.id}
                    className={`flex items-center gap-1 rounded px-1 py-0.5 text-[11px] sm:text-xs leading-tight truncate ${TYPE_COLORS[event.event_type] ?? "bg-slate-100 text-slate-700"}`}
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${ASSIGNEE_DOT_COLORS[assigneeKind(event.assigned_to)]}`} />
                    <span className="truncate">
                      <span className="hidden sm:inline font-semibold">{formatTime(event.start_time)} </span>
                      {event.title}
                    </span>
                  </div>
                ))}
                {overflow > 0 && (
                  <p className="text-[11px] sm:text-xs font-medium text-muted-foreground pl-1">+{overflow} more</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={openDay !== null} onOpenChange={(open) => !open && setOpenDay(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between gap-2">
            <DialogTitle className="text-base">{openHeading}</DialogTitle>
            {openDay && (
              <Button asChild size="sm">
                <Link href={`/calendar/new?date=${openDay}`}>
                  <Plus className="h-4 w-4" /> New
                </Link>
              </Button>
            )}
          </DialogHeader>
          {openDay && (
            <DayDetailPanel
              dayKey={openDay}
              events={(eventsByDay[openDay] ?? []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time))}
              customerLabels={customerLabels}
              bare
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
