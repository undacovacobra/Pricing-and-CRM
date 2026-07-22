"use client";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { teamMemberName, formatPhoneNumber } from "@/lib/utils";
import { MapPin, User, Briefcase, Phone } from "lucide-react";
import { TYPE_LABELS, TYPE_COLORS, mapsLink, timeRange, localDayKey, APP_TIME_ZONE } from "@/components/calendar/eventStyles";
import type { CalendarEvent } from "@/lib/types/database";

function dayHeading(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (localDayKey(iso) === localDayKey(today.toISOString())) return "Today";
  if (localDayKey(iso) === localDayKey(tomorrow.toISOString())) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: APP_TIME_ZONE }).format(d);
}

export function AgendaList({
  events,
  customerLabels,
  customerPhones = {},
  customerAddresses = {},
}: {
  events: (CalendarEvent & { customerLabel?: string | null })[];
  customerLabels?: Record<string, string>;
  customerPhones?: Record<string, string>;
  customerAddresses?: Record<string, string>;
}) {
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
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${TYPE_COLORS[event.event_type] ?? "bg-slate-100 text-slate-600"}`}>
                          {TYPE_LABELS[event.event_type]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{event.all_day ? "All day" : timeRange(event.start_time, event.end_time)}</p>
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
                        <div className="flex items-center gap-1 text-xs text-slate-600">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{event.location}</span>
                        </div>
                      )}
                      {(() => {
                        const phone = customerPhones[event.customer_id ?? ""];
                        const directions = event.location || customerAddresses[event.customer_id ?? ""];
                        if (!phone && !directions) return null;
                        return (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {phone && (
                              <a
                                href={`tel:${phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <Phone className="h-3 w-3 text-slate-500" /> {formatPhoneNumber(phone)}
                              </a>
                            )}
                            {directions && (
                              <a
                                href={mapsLink(directions)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <MapPin className="h-3 w-3 text-slate-500" /> Directions
                              </a>
                            )}
                          </div>
                        );
                      })()}
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
