"use client";
import { useEffect } from "react";
import { putJob, putJobFiles } from "@/lib/offline/db";

// Mounted on job pages while online so the job's name and file list are
// available in the offline workspace later. Renders nothing.
export function CacheJobForOffline({
  jobId,
  jobTitle,
  files,
}: {
  jobId: string;
  jobTitle: string;
  files: { kind: string; name: string; detail?: string }[];
}) {
  useEffect(() => {
    putJob(jobId, jobTitle);
    putJobFiles({ job_id: jobId, job_title: jobTitle, files, cached_at: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
  return null;
}
