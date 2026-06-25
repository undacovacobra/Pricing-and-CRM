"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw } from "lucide-react";
import { flushPendingDrawings } from "@/lib/offline/sync";
import { getPendingDrawings } from "@/lib/offline/db";

// Shows a small banner when offline or when there are unsynced drawings, and
// flushes pending drawing edits to Supabase whenever the connection returns.
export function OfflineManager() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  async function refreshPending() {
    const p = await getPendingDrawings();
    setPending(p.length);
  }

  async function sync() {
    setSyncing(true);
    const res = await flushPendingDrawings();
    setSyncing(false);
    await refreshPending();
    if (res.synced > 0) router.refresh();
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    refreshPending();

    function onOnline() {
      setOnline(true);
      sync();
    }
    function onOffline() {
      setOnline(false);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Flush anything left over from a previous session on load.
    if (navigator.onLine) sync();

    // Re-check the pending count periodically (saves happen elsewhere).
    const interval = setInterval(refreshPending, 5000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (online && pending === 0) return null;

  return (
    <div className="fixed z-50 bottom-36 right-4 md:bottom-24 md:right-6 max-w-[260px]">
      {!online && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500 text-white text-xs font-medium px-3 py-2 shadow-lg mb-2">
          <CloudOff className="h-4 w-4 shrink-0" />
          <span>Offline — drawings save to this device and sync when you&apos;re back.</span>
        </div>
      )}
      {pending > 0 && (
        <button
          onClick={sync}
          disabled={syncing || !online}
          className="flex items-center gap-2 rounded-lg bg-slate-900 text-white text-xs font-medium px-3 py-2 shadow-lg disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : online ? `Sync ${pending} drawing${pending > 1 ? "s" : ""}` : `${pending} waiting to sync`}
        </button>
      )}
    </div>
  );
}
