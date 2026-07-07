import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { formatDate, formatDateTime, teamMemberName } from "@/lib/utils";
import { mapsLink } from "@/components/calendar/eventStyles";
import { MapPin, Paperclip, Download, CalendarDays, MessageSquare, PencilRuler, FolderOpen } from "lucide-react";
import type { CalendarEvent, JobAttachment, JobDrawing } from "@/lib/types/database";

interface InstallerJob {
  id: string;
  title: string;
  job_address: string | null;
  google_drive_folder_url: string | null;
  customerName: string | null;
  customerId: string | null;
}

interface InstallerNote {
  id: string;
  author: string;
  content: string;
  created_at: string;
}

// A stripped-down, read-only job view for installers: where to go, when, and the
// files/drawings they need — no pricing, estimates, or other financial details.
export function InstallerJobView({
  job,
  appointments,
  drawings,
  attachments,
  notes,
}: {
  job: InstallerJob;
  appointments: CalendarEvent[];
  drawings: JobDrawing[];
  attachments: JobAttachment[];
  notes: InstallerNote[];
}) {
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Link href="/jobs" className="text-sm text-muted-foreground hover:underline">← Jobs</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">{job.title}</h1>
        {job.customerName && (
          job.customerId ? (
            <Link href={`/customers/${job.customerId}`} className="text-sm text-blue-600 hover:underline">{job.customerName}</Link>
          ) : (
            <p className="text-sm text-slate-600">{job.customerName}</p>
          )
        )}
      </div>

      {/* Address */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" /> Job Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {job.job_address ? (
            <a
              href={mapsLink(job.job_address)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
            >
              <MapPin className="h-4 w-4 shrink-0" /> {job.job_address}
            </a>
          ) : (
            <p className="text-muted-foreground">No address on file for this job.</p>
          )}
          {job.google_drive_folder_url && (
            <div>
              <a
                href={job.google_drive_folder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
              >
                <FolderOpen className="h-3 w-3" /> Google Drive folder
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appointments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Appointments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!appointments.length && <p className="text-sm text-muted-foreground">No appointments scheduled.</p>}
          {appointments.map((event) => (
            <div key={event.id} className="p-3 border rounded-lg text-sm space-y-1">
              <p className="font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {event.all_day ? "All day" : formatDateTime(event.start_time)} · {teamMemberName(event.assigned_to)}
              </p>
              {event.location && (
                <a href={mapsLink(event.location)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <MapPin className="h-3 w-3 shrink-0" /> {event.location}
                </a>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Drawings */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2"><PencilRuler className="h-4 w-4" /> Drawings</CardTitle>
          <Link href={`/jobs/${job.id}/drawings`} className="text-xs text-blue-600 hover:underline">View all</Link>
        </CardHeader>
        <CardContent>
          {!drawings.length && <p className="text-sm text-muted-foreground text-center py-2">No sketch pages yet.</p>}
          {drawings.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
              {drawings.slice(0, 6).map((d) => (
                <Link key={d.id} href={`/jobs/${job.id}/drawings/${d.id}`}>
                  <div className="aspect-[4/3] bg-white border rounded overflow-hidden flex items-center justify-center">
                    {d.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.thumbnail} alt={d.label} className="w-full h-full object-contain" />
                    ) : (
                      <PencilRuler className="h-5 w-5 text-slate-300" />
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attachments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Paperclip className="h-4 w-4" /> Attachments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!attachments.length && <p className="text-sm text-muted-foreground">No attachments.</p>}
          {attachments.map((att) => {
            const url = `${SUPABASE_URL}/storage/v1/object/public/job-attachments/${att.storage_path}`;
            return (
              <div key={att.id} className="flex items-center justify-between p-2 border rounded-lg">
                <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 min-w-0 text-sm text-blue-600 hover:underline">
                  <Paperclip className="h-4 w-4 shrink-0" /> <span className="truncate">{att.file_name}</span>
                </a>
                <a href={url} target="_blank" rel="noopener noreferrer" download className="text-slate-400 hover:text-slate-700 shrink-0 ml-2">
                  <Download className="h-4 w-4" />
                </a>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!notes.length && <p className="text-sm text-muted-foreground">No notes.</p>}
          {notes.map((note) => (
            <div key={note.id} className="border rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-xs">{teamMemberName(note.author)}</span>
                <span className="text-xs text-muted-foreground">{formatDate(note.created_at)}</span>
              </div>
              <p className="text-slate-700 whitespace-pre-wrap">{note.content}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
