"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TimeSelect } from "@/components/ui/time-select";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerCombobox } from "@/components/calendar/CustomerCombobox";
import { triggerBackup } from "@/lib/backup/trigger";
import type { CalendarEvent, CalendarEventType, Customer, Job } from "@/lib/types/database";

const SHOWROOM_ADDRESS = "1900 Main Street Suite 108, Sarasota, FL 34236";

type LocationMode = "customer" | "showroom" | "other";

const REMINDER_OPTIONS = [
  { value: "none", label: "No reminder email" },
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "120", label: "2 hours before" },
  { value: "1440", label: "1 day before" },
];

// How long an appointment lasts — 30 min to 6 hours, in half-hour steps.
const DURATION_OPTIONS = [
  { value: 30, label: "½ hour" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1½ hours" },
  { value: 120, label: "2 hours" },
  { value: 150, label: "2½ hours" },
  { value: 180, label: "3 hours" },
  { value: 210, label: "3½ hours" },
  { value: 240, label: "4 hours" },
  { value: 270, label: "4½ hours" },
  { value: 300, label: "5 hours" },
  { value: 330, label: "5½ hours" },
  { value: 360, label: "6 hours" },
];

type Recurrence = "none" | "daily" | "weekly" | "monthly";

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: "none",    label: "Does not repeat" },
  { value: "daily",   label: "Every day" },
  { value: "weekly",  label: "Every week" },
  { value: "monthly", label: "Every month" },
];

// Hard ceiling on how many events one series may create, so a stray end date
// can't spawn thousands of rows.
const MAX_OCCURRENCES = 400;

// Date math is done on plain "YYYY-MM-DD" strings using UTC arithmetic. That
// keeps the wall-clock time of each occurrence identical across a DST change —
// stepping real Date objects by 24h would shift 9am to 8am after the clocks move.
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Same day-of-month N months on, clamped to the month's length so the 31st
// lands on the 30th (or the 28th/29th) rather than spilling into next month.
function addMonthsToDateStr(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = m - 1 + months;
  const year = y + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Every start date in the series, first occurrence included.
function occurrenceDates(startDate: string, rule: Recurrence, until: string): string[] {
  if (rule === "none" || !startDate || !until || until < startDate) return [startDate];
  const out = [startDate];
  for (let i = 1; i <= MAX_OCCURRENCES; i++) {
    const next =
      rule === "daily"  ? addDaysToDateStr(startDate, i)
      : rule === "weekly" ? addDaysToDateStr(startDate, 7 * i)
      : addMonthsToDateStr(startDate, i);
    if (next > until) break;
    out.push(next);
  }
  return out;
}

// A sensible default end date so picking "repeats" doesn't demand a second decision.
function defaultUntilFor(rule: Recurrence, startDate: string): string {
  if (!startDate) return "";
  if (rule === "daily") return addMonthsToDateStr(startDate, 1);
  if (rule === "weekly") return addMonthsToDateStr(startDate, 3);
  if (rule === "monthly") return addMonthsToDateStr(startDate, 12);
  return "";
}

// Best-fit duration (in minutes) for an existing event, snapped to the options.
function durationFromEvent(startIso: string | undefined, endIso: string | null | undefined): number {
  if (!startIso || !endIso) return 60;
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins <= 0) return 60;
  const snapped = Math.min(360, Math.max(30, Math.round(mins / 30) * 30));
  return snapped;
}

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time, with no timezone suffix.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateOnly(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function customerAddress(c: Customer | undefined): string {
  if (!c) return "";
  return [c.address_line1, c.city, c.state].filter(Boolean).join(", ");
}

type AssignedKind = "owner" | "designer" | "installer";

function kindFromAssignedTo(value: string): AssignedKind {
  if (value === "owner" || value === "designer") return value;
  return "installer";
}

export function EventForm({
  event,
  customers,
  jobs,
  defaultRole,
}: {
  event?: CalendarEvent;
  customers: Customer[];
  jobs: (Job & { customerLabel: string })[];
  defaultRole: "owner" | "designer";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const defaultJobId = event?.job_id ?? searchParams.get("job") ?? "";
  const defaultCustomerId = event?.customer_id ?? searchParams.get("customer") ?? "";

  const [eventType, setEventType] = useState<CalendarEventType>(event?.event_type ?? "appointment");
  const [title, setTitle] = useState(event?.title ?? "");
  const [customerId, setCustomerId] = useState(defaultCustomerId);
  const [jobId, setJobId] = useState(defaultJobId);
  const [assignedKind, setAssignedKind] = useState<AssignedKind>(kindFromAssignedTo(event?.assigned_to ?? defaultRole));
  const [installerName, setInstallerName] = useState(
    event && kindFromAssignedTo(event.assigned_to) === "installer" ? event.assigned_to : "",
  );
  const defaultCustomer = customers.find((c) => c.id === defaultCustomerId);
  const initialLocationMode: LocationMode = (() => {
    if (!event?.location) return "customer";
    if (event.location === SHOWROOM_ADDRESS) return "showroom";
    if (event.location === customerAddress(defaultCustomer)) return "customer";
    return "other";
  })();
  const [locationMode, setLocationMode] = useState<LocationMode>(initialLocationMode);
  const [customLocation, setCustomLocation] = useState(
    initialLocationMode === "other" ? event?.location ?? "" : "",
  );
  const defaultDate = searchParams.get("date");
  const initialStart = event?.start_time ? toLocalInput(event.start_time) : defaultDate ? `${defaultDate}T09:00` : "";
  const [allDay, setAllDay] = useState(Boolean(event?.all_day));
  const [startDate, setStartDate] = useState(initialStart.split("T")[0] ?? "");
  const [startTimeOfDay, setStartTimeOfDay] = useState(initialStart.split("T")[1] ?? "09:00");
  const startTime = startDate ? `${startDate}T${startTimeOfDay || "09:00"}` : "";
  const [duration, setDuration] = useState<number>(durationFromEvent(event?.start_time, event?.end_time));
  // Repeating is only offered when creating; editing touches a single occurrence.
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  // All-day events may span multiple days via an end date.
  const [endDate, setEndDate] = useState(
    event?.all_day && event?.end_time && toDateOnly(event.start_time) !== toDateOnly(event.end_time)
      ? toDateOnly(event.end_time)
      : "",
  );
  const [reminder, setReminder] = useState(
    event?.reminder_minutes_before != null ? String(event.reminder_minutes_before) : "60",
  );
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedJob = jobs.find((j) => j.id === jobId);
  const jobsForCustomer = customerId
    ? jobs.filter((j) => j.customer_id === customerId || j.id === jobId)
    : jobs;

  // The actual address sent to the database, derived from the chosen mode.
  const resolvedLocation =
    locationMode === "showroom"
      ? SHOWROOM_ADDRESS
      : locationMode === "customer"
        ? customerAddress(selectedCustomer)
        : customLocation;

  const [prevCustomerId, setPrevCustomerId] = useState(customerId);
  if (customerId !== prevCustomerId) {
    setPrevCustomerId(customerId);
    if (jobId && selectedJob && customerId && selectedJob.customer_id !== customerId) setJobId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startDate) {
      setError("Title and date are required.");
      return;
    }
    if (!event && recurrence !== "none") {
      if (!recurrenceUntil) { setError("Choose a date to repeat until."); return; }
      if (recurrenceUntil < startDate) { setError("The repeat-until date must be on or after the start date."); return; }
    }
    setSaving(true);
    setError(null);

    const assignedTo = assignedKind === "installer" ? installerName.trim() || "Installer" : assignedKind;

    // All-day events store noon (local) on the start and end dates so day-bucketing
    // never drifts; timed events run from the start for the chosen duration.
    let startIso: string;
    let endIso: string;
    if (allDay) {
      startIso = new Date(`${startDate}T12:00:00`).toISOString();
      endIso = new Date(`${endDate || startDate}T12:00:00`).toISOString();
    } else {
      startIso = new Date(startTime).toISOString();
      endIso = new Date(new Date(startTime).getTime() + duration * 60000).toISOString();
    }

    const finalLocation = resolvedLocation.trim();
    const data = {
      event_type:              eventType,
      title:                   title.trim(),
      customer_id:             customerId || null,
      job_id:                  jobId || null,
      assigned_to:             assignedTo,
      location:                finalLocation || null,
      start_time:              startIso,
      end_time:                endIso,
      all_day:                 allDay,
      notes:                   notes.trim() || null,
      reminder_minutes_before: reminder === "none" ? null : Number(reminder),
    };

    if (event) {
      const { error: updateErr } = await supabase.from("calendar_events").update(data).eq("id", event.id);
      if (updateErr) { setError(updateErr.message); setSaving(false); return; }
      triggerBackup({ calendar: true });
      router.push("/calendar");
      router.refresh();
    } else {
      // A repeating event is stored as one row per occurrence, all sharing a
      // group id. Materialising them keeps every existing feature — reminders,
      // day buckets, the agenda, job links — working with no special cases.
      const dates = occurrenceDates(startDate, recurrence, recurrenceUntil);
      if (dates.length > MAX_OCCURRENCES) {
        setError(`That repeats ${dates.length} times. Pick an earlier "repeat until" date.`);
        setSaving(false);
        return;
      }
      const groupId = recurrence === "none" ? null : crypto.randomUUID();
      // All-day events can span several days; keep that span on every occurrence.
      const spanDays =
        allDay && endDate && endDate > startDate
          ? Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000)
          : 0;

      const rows = dates.map((occDate) => {
        let occStart: string;
        let occEnd: string;
        if (allDay) {
          occStart = new Date(`${occDate}T12:00:00`).toISOString();
          occEnd = new Date(`${addDaysToDateStr(occDate, spanDays)}T12:00:00`).toISOString();
        } else {
          const base = new Date(`${occDate}T${startTimeOfDay || "09:00"}`);
          occStart = base.toISOString();
          occEnd = new Date(base.getTime() + duration * 60000).toISOString();
        }
        return {
          ...data,
          start_time:          occStart,
          end_time:            occEnd,
          recurrence:          recurrence === "none" ? null : recurrence,
          recurrence_until:    recurrence === "none" ? null : recurrenceUntil,
          recurrence_group_id: groupId,
        };
      });

      const { data: createdRows, error: insertErr } = await supabase.from("calendar_events").insert(rows).select();
      const created = createdRows?.[0];
      if (insertErr || !created?.id) { setError(insertErr?.message ?? "Failed to save."); setSaving(false); return; }
      triggerBackup({ calendar: true });

      if (jobId) {
        const when = new Date(startIso).toLocaleString("en-US", {
          weekday: "short", month: "short", day: "numeric",
          ...(allDay ? {} : { hour: "numeric", minute: "2-digit" }),
        });
        const whoLabel = assignedKind === "owner" ? "Travis" : assignedKind === "designer" ? "Carol" : assignedTo;
        await supabase.from("job_notes").insert({
          job_id:  jobId,
          author:  defaultRole,
          content: `Calendar event scheduled: "${title.trim()}" on ${when} (${whoLabel})${finalLocation ? ` at ${finalLocation}` : ""}.`,
        });
        triggerBackup({ jobId });
      }

      if (eventType === "appointment" && customerId && sendEmail) {
        try {
          const res = await fetch("/api/calendar/notify", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ eventId: created.id }),
          });
          const result = await res.json();
          if (result.sent) setConfirmMessage("Confirmation email sent to the customer.");
        } catch {
          // non-blocking
        }
      }
      router.push("/calendar");
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label>Event Type</Label>
            <Select value={eventType} onValueChange={(v) => setEventType(v as CalendarEventType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="appointment">Customer Appointment</SelectItem>
                <SelectItem value="install">Install / Job Date</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={eventType === "appointment" ? "e.g. Design consultation" : eventType === "install" ? "e.g. Cabinet install" : "e.g. Dentist appointment"}
            />
          </div>

          {/* Customer */}
          {eventType !== "personal" && (
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <CustomerCombobox customers={customers} value={customerId} onChange={setCustomerId} />
              {eventType === "appointment" && customerId && !selectedCustomer?.email && (
                <p className="text-xs text-orange-600">
                  This customer has no email on file, so no confirmation/reminder emails can be sent.
                </p>
              )}
            </div>
          )}

          {/* Job */}
          {eventType !== "personal" && (
            <div className="space-y-1.5">
              <Label>Job</Label>
              <SearchableSelect
                value={jobId}
                onValueChange={setJobId}
                options={jobsForCustomer.map((j) => ({ value: j.id, label: j.title, hint: j.customerLabel }))}
                placeholder="None"
                emptyLabel="None"
              />
              {customerId && jobsForCustomer.length === 0 && (
                <p className="text-xs text-muted-foreground">This customer has no jobs yet.</p>
              )}
            </div>
          )}

          {/* Assigned To */}
          <div className="space-y-1.5">
            <Label>Who</Label>
            <div className="flex gap-2">
              <Select value={assignedKind} onValueChange={(v) => setAssignedKind(v as AssignedKind)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Travis</SelectItem>
                  <SelectItem value="designer">Carol</SelectItem>
                  <SelectItem value="installer">Installer</SelectItem>
                </SelectContent>
              </Select>
              {assignedKind === "installer" && (
                <Input
                  value={installerName}
                  onChange={(e) => setInstallerName(e.target.value)}
                  placeholder="Installer name"
                  className="flex-1"
                />
              )}
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label>Where</Label>
            <Select value={locationMode} onValueChange={(v) => setLocationMode(v as LocationMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer&apos;s house</SelectItem>
                <SelectItem value="showroom">Showroom</SelectItem>
                <SelectItem value="other">Somewhere else…</SelectItem>
              </SelectContent>
            </Select>

            {locationMode === "customer" && (
              resolvedLocation
                ? <p className="text-sm text-slate-600 px-1">{resolvedLocation}</p>
                : <p className="text-xs text-orange-600 px-1">
                    {customerId ? "This customer has no address on file." : "Pick a customer above, or choose another location."}
                  </p>
            )}
            {locationMode === "showroom" && (
              <p className="text-sm text-slate-600 px-1">{SHOWROOM_ADDRESS}</p>
            )}
            {locationMode === "other" && (
              <Input
                id="location"
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                placeholder="123 Main St, City, State"
              />
            )}
          </div>

          {/* Date & time */}
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 shrink-0"
              />
              <span className="text-sm text-slate-700">All day</span>
            </label>

            {allDay ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="start_date">Start date *</Label>
                  <Input id="start_date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end_date">End date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Leave blank for a single day. Otherwise it shows on every day through this date.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="start_date">Date *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="start_date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="flex-1"
                    />
                    <TimeSelect
                      id="start_time_of_day"
                      value={startTimeOfDay}
                      onChange={setStartTimeOfDay}
                      className="w-32 rounded-md border px-2 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>How long</Label>
                  <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Repeat */}
          {!event ? (
            <div className="space-y-1.5">
              <Label>Repeats</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  value={recurrence}
                  onValueChange={(v) => {
                    const rule = v as Recurrence;
                    setRecurrence(rule);
                    // Offer a sensible end date so choosing "repeats" isn't two decisions.
                    if (rule !== "none" && !recurrenceUntil) setRecurrenceUntil(defaultUntilFor(rule, startDate));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {recurrence !== "none" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="recurrence_until">Repeat until</Label>
                    <Input
                      id="recurrence_until"
                      type="date"
                      value={recurrenceUntil}
                      min={startDate || undefined}
                      onChange={(e) => setRecurrenceUntil(e.target.value)}
                    />
                  </div>
                )}
              </div>
              {recurrence !== "none" && startDate && recurrenceUntil >= startDate && (
                <p className="text-xs text-muted-foreground">
                  Creates {occurrenceDates(startDate, recurrence, recurrenceUntil).length} events. You can delete the
                  whole series later, or just one date.
                </p>
              )}
            </div>
          ) : event.recurrence_group_id ? (
            <p className="text-xs text-muted-foreground">
              This is one date in a repeating series — saving changes only this one.
            </p>
          ) : null}

          {/* Reminder */}
          {eventType === "appointment" && (
            <div className="space-y-1.5">
              <Label>Customer Reminder Email</Label>
              <Select value={reminder} onValueChange={setReminder}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Send confirmation email (new appointments only) */}
          {!event && eventType === "appointment" && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4 shrink-0"
              />
              <span className="text-sm text-slate-700">
                Email the customer a confirmation now
              </span>
            </label>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything to remember about this..." />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
      {confirmMessage && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{confirmMessage}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : event ? "Save Changes" : "Create Event"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
