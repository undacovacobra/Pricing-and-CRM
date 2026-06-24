"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerCombobox } from "@/components/calendar/CustomerCombobox";
import { triggerBackup } from "@/lib/backup/trigger";
import type { CalendarEvent, CalendarEventType, Customer, Job } from "@/lib/types/database";

const REMINDER_OPTIONS = [
  { value: "none", label: "No reminder email" },
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "120", label: "2 hours before" },
  { value: "1440", label: "1 day before" },
];

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

function toTimeOnly(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
}: {
  event?: CalendarEvent;
  customers: Customer[];
  jobs: (Job & { customerLabel: string })[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const defaultJobId = event?.job_id ?? searchParams.get("job") ?? "";
  const defaultCustomerId = event?.customer_id ?? searchParams.get("customer") ?? "";
  const defaultJob = jobs.find((j) => j.id === defaultJobId);

  const [eventType, setEventType] = useState<CalendarEventType>(event?.event_type ?? "appointment");
  const [title, setTitle] = useState(event?.title ?? "");
  const [customerId, setCustomerId] = useState(defaultCustomerId);
  const [jobId, setJobId] = useState(defaultJobId);
  const [assignedKind, setAssignedKind] = useState<AssignedKind>(kindFromAssignedTo(event?.assigned_to ?? "owner"));
  const [installerName, setInstallerName] = useState(
    event && kindFromAssignedTo(event.assigned_to) === "installer" ? event.assigned_to : "",
  );
  const defaultCustomer = customers.find((c) => c.id === defaultCustomerId);
  const [location, setLocation] = useState(
    event?.location ?? defaultJob?.job_address ?? customerAddress(defaultCustomer) ?? "",
  );
  const defaultDate = searchParams.get("date");
  const [startTime, setStartTime] = useState(
    event?.start_time ? toLocalInput(event.start_time) : defaultDate ? `${defaultDate}T09:00` : "",
  );
  const isMultiDay = Boolean(event?.end_time && toDateOnly(event.start_time) !== toDateOnly(event.end_time));
  const [multiDay, setMultiDay] = useState(isMultiDay);
  const [endDate, setEndDate] = useState(
    isMultiDay && event?.end_time ? toDateOnly(event.end_time) : "",
  );
  const [endTime, setEndTime] = useState(event?.end_time ? toTimeOnly(event.end_time) : "");
  const [reminder, setReminder] = useState(
    event?.reminder_minutes_before != null ? String(event.reminder_minutes_before) : "60",
  );
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedJob = jobs.find((j) => j.id === jobId);
  const jobsForCustomer = customerId
    ? jobs.filter((j) => j.customer_id === customerId || j.id === jobId)
    : jobs;

  const [locationTouched, setLocationTouched] = useState(Boolean(event?.location));

  useEffect(() => {
    if (locationTouched) return;
    const addr = selectedJob?.job_address || customerAddress(selectedCustomer);
    if (addr) setLocation(addr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, jobId]);

  const [prevCustomerId, setPrevCustomerId] = useState(customerId);
  if (customerId !== prevCustomerId) {
    setPrevCustomerId(customerId);
    if (jobId && selectedJob && customerId && selectedJob.customer_id !== customerId) setJobId("");
  }

  function applyAddress(addr: string | null | undefined) {
    if (addr) {
      setLocation(addr);
      setLocationTouched(true);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startTime) {
      setError("Title and start time are required.");
      return;
    }
    setSaving(true);
    setError(null);

    const assignedTo = assignedKind === "installer" ? installerName.trim() || "Installer" : assignedKind;

    let endTimeIso: string | null = null;
    if (multiDay && endDate) {
      endTimeIso = new Date(`${endDate}T${endTime || "23:59"}:00`).toISOString();
    } else if (!multiDay && endTime) {
      const startDateOnly = startTime.split("T")[0];
      endTimeIso = new Date(`${startDateOnly}T${endTime}:00`).toISOString();
    }

    const data = {
      event_type:              eventType,
      title:                   title.trim(),
      customer_id:             customerId || null,
      job_id:                  jobId || null,
      assigned_to:             assignedTo,
      location:                location.trim() || null,
      start_time:              new Date(startTime).toISOString(),
      end_time:                endTimeIso,
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
      const { data: created, error: insertErr } = await supabase.from("calendar_events").insert(data).select().single();
      if (insertErr || !created?.id) { setError(insertErr?.message ?? "Failed to save."); setSaving(false); return; }
      triggerBackup({ calendar: true });

      if (jobId) {
        const when = new Date(startTime).toLocaleString("en-US", {
          weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        });
        const whoLabel = assignedKind === "owner" ? "Travis" : assignedKind === "designer" ? "Carol" : assignedTo;
        await supabase.from("job_notes").insert({
          job_id:  jobId,
          author:  "owner",
          content: `Calendar event scheduled: "${title.trim()}" on ${when} (${whoLabel})${location.trim() ? ` at ${location.trim()}` : ""}.`,
        });
        triggerBackup({ jobId });
      }

      if (eventType === "appointment" && customerId) {
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
              <Select value={jobId || "none"} onValueChange={(v) => setJobId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {jobsForCustomer.map((j) => (
                    <SelectItem key={j.id} value={j.id}>{j.title} — {j.customerLabel}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Label htmlFor="location">
              Address / Location
              {selectedCustomer?.address_line1 && (
                <button type="button" className="ml-2 text-xs text-blue-600 hover:underline" onClick={() => applyAddress([selectedCustomer.address_line1, selectedCustomer.city, selectedCustomer.state].filter(Boolean).join(", "))}>
                  Use customer address
                </button>
              )}
              {selectedJob?.job_address && (
                <button type="button" className="ml-2 text-xs text-blue-600 hover:underline" onClick={() => applyAddress(selectedJob.job_address)}>
                  Use job address
                </button>
              )}
            </Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setLocationTouched(true);
              }}
              placeholder="123 Main St, City, State"
            />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="start_time">Date *</Label>
                <Input id="start_time" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end_time_only">Ends</Label>
                <Input id="end_time_only" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                checked={multiDay}
                onChange={(e) => {
                  setMultiDay(e.target.checked);
                  if (!e.target.checked) setEndDate("");
                }}
                className="h-4 w-4 shrink-0"
              />
              <span className="text-xs text-slate-600">This event spans multiple days</span>
            </label>
            {multiDay && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="end_date">End Date</Label>
                <Input id="end_date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                <p className="text-xs text-muted-foreground">The &quot;Ends&quot; time above applies to this end date.</p>
              </div>
            )}
          </div>

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
