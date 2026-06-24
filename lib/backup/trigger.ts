// Client-side fire-and-forget backup trigger. Call after a job or customer
// changes so the Google Drive backup updates "live". Failures are ignored on
// purpose — the nightly sweep is the safety net, so a missed live update never
// blocks the user or surfaces an error.
export function triggerBackup(opts: { jobId?: string; contacts?: boolean; calendar?: boolean; commissions?: boolean }) {
  try {
    fetch("/api/backup/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}
