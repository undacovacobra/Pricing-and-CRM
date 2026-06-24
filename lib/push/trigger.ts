// Fire-and-forget push notification trigger. Call after a chat message is sent
// so the other team member's phone gets pinged. Failures are ignored on purpose.
export function triggerPush(opts: { title?: string; body?: string; url?: string; tag?: string }) {
  try {
    fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}
