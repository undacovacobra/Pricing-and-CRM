import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { teamMemberName } from "@/lib/utils";
import { MapPin, User, Briefcase } from "lucide-react";
import type { CalendarEvent } from "@/lib/types/database";

const TYPE_LABELS: Record<string, string> = {
  appointment: "Appointment",
  install:     "Installer Visit",
  personal:    "Personal",
};

const TYPE_COLORS: Record<string, string> = {
  appointment: "bg-blue-100 text-blue-700",
  install:     "bg-amber-100 text-amber-700",
  personal:    "bg-slate-100 text-slate-600",
};

function mapsLink(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayHeading(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(tomorrow.toISOString())) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(d);
}

function timeRange(start: string, end: string | null): string {
  const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  return end ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

export function AgendaList({ events, customerLabels }: { events: (CalendarEvent & { customerLabel?: string | null })[]; customerLabels?: Record<string, string> }) {
  if (!events.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No upcoming events scheduled.
        </CardContent>
      </Card>
    );
  }

  const groups: { heading: string; items: typeof events }[] = [];
  for (const event of events) {
    const heading = dayHeading(event.start_time);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.heading === heading) {
      lastGroup.items.push(event);
    } else {
      groups.push({ heading, items: [event] });
    }
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.heading} className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.heading}</h3>
          <div className="space-y-2">
            {group.items.map((event) => (
              <Link key={event.id} href={`/calendar/${event.id}/edit`}>
                <Card className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{event.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${TYPE_COLORS[event.event_type]}`}>
                          {TYPE_LABELS[event.event_type]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{timeRange(event.start_time, event.end_time)}</p>
                      <div className="flex items-center gap-1 text-xs text-slate-600">
                        <User className="h-3 w-3 shrink-0" />
                        {teamMemberName(event.assigned_to)}
                      </div>
                      {customerLabels?.[event.customer_id ?? ""] && (
                        <div className="flex items-center gap-1 text-xs text-slate-600">
                          <Briefcase className="h-3 w-3 shrink-0" />
                          {customerLabels[event.customer_id ?? ""]}
                        </div>
                      )}
                      {event.location && (
                        <a
                          href={mapsLink(event.location)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <MapPin className="h-3 w-3 shrink-0" />
                          {event.location}
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
