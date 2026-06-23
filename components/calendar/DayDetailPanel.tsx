import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { teamMemberName } from "@/lib/utils";
import { TYPE_LABELS, TYPE_COLORS, mapsLink, timeRange } from "@/components/calendar/eventStyles";
import { MapPin, User, Briefcase, Plus } from "lucide-react";
import type { CalendarEvent } from "@/lib/types/database";

export function DayDetailPanel({
  dayKey,
  events,
  customerLabels,
}: {
  dayKey: string;
  events: CalendarEvent[];
  customerLabels: Record<string, string>;
}) {
  const heading = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(
    new Date(`${dayKey}T00:00:00`),
  );

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">{heading}</CardTitle>
        <Button asChild size="sm">
          <Link href={`/calendar/new?date=${dayKey}`}>
            <Plus className="h-4 w-4" /> New
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {!events.length && <p className="text-sm text-muted-foreground text-center py-4">Nothing scheduled this day.</p>}
        {events.map((event) => (
          <Link key={event.id} href={`/calendar/${event.id}/edit`}>
            <div className="p-3 border rounded-lg hover:bg-slate-50 transition-colors space-y-1">
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
              {customerLabels[event.customer_id ?? ""] && (
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
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
