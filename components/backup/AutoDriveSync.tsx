"use client";
import { useEffect } from "react";

// Fires a background Drive→app sync when the app is opened. Fire-and-forget: the
// server throttles it to at most once an hour and no-ops when nothing changed, so
// files dropped into job folders show up on their own without any button-pressing.
export function AutoDriveSync() {
  useEffect(() => {
    // Only attempt once per tab session to avoid firing on every navigation.
    if (sessionStorage.getItem("autoDriveSyncFired")) return;
    sessionStorage.setItem("autoDriveSyncFired", "1");
    fetch("/api/backup/auto-sync", { method: "POST" }).catch(() => {});
  }, []);
  return null;
}
