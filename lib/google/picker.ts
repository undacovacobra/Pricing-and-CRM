// Loads and opens the Google Picker so the user can choose files from their own
// Google Drive. Returns the picked files' metadata. The app only learns about
// files the user explicitly selects.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

export const PICKER_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY || "";
export function pickerConfigured(): boolean {
  return Boolean(PICKER_API_KEY);
}

let pickerReady = false;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google API script"));
    document.head.appendChild(s);
  });
}

async function ensurePicker(): Promise<void> {
  if (pickerReady && window.google?.picker) return;
  await loadScript("https://apis.google.com/js/api.js");
  await new Promise<void>((resolve) => window.gapi.load("picker", { callback: () => resolve() }));
  pickerReady = true;
}

export interface PickedFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

// Opens the picker; resolves with the chosen files (empty array if cancelled).
// Throws "not_configured" / "not_connected" when setup is incomplete.
export async function openDrivePicker(): Promise<PickedFile[]> {
  if (!pickerConfigured()) throw new Error("not_configured");

  const res = await fetch("/api/google/picker-token");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "token_failed");
  }
  const { token, appId } = await res.json();

  await ensurePicker();
  const google = window.google;

  return new Promise<PickedFile[]>((resolve, reject) => {
    try {
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);

      const builder = new google.picker.PickerBuilder()
        .addView(view)
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(token)
        .setDeveloperKey(PICKER_API_KEY)
        .setOrigin(window.location.origin)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            resolve(
              (data.docs || []).map((d: any) => ({
                id: d.id,
                name: d.name,
                mimeType: d.mimeType,
                sizeBytes: d.sizeBytes ? Number(d.sizeBytes) : undefined,
              })),
            );
          } else if (data.action === google.picker.Action.CANCEL) {
            resolve([]);
          }
        });
      if (appId) builder.setAppId(appId);
      builder.build().setVisible(true);
    } catch (e) {
      reject(e);
    }
  });
}
