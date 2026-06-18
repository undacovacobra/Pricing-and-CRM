import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderOpen, CheckCircle2 } from "lucide-react";
import { getGoogleConnectionStatus } from "@/lib/google/connection";
import { googleConfigured } from "@/lib/google/drive";

const BANNERS: Record<string, { text: string; tone: "ok" | "warn" }> = {
  connected:       { text: "Google Drive connected.", tone: "ok" },
  disconnected:    { text: "Google Drive disconnected.", tone: "ok" },
  denied:          { text: "Google Drive connection was cancelled.", tone: "warn" },
  error:           { text: "Something went wrong connecting Google Drive. Please try again.", tone: "warn" },
  no_refresh_token:{ text: "Google did not return a refresh token. Disconnect and reconnect, choosing your account again.", tone: "warn" },
  not_configured:  { text: "Google Drive is not configured on the server yet (missing credentials).", tone: "warn" },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const supabase = await createClient();
  const { data: settings } = await supabase.from("app_settings").select("*").single();

  const configured = googleConfigured();
  const status = configured ? await getGoogleConnectionStatus() : { connected: false, email: null };
  const { google } = await searchParams;
  const banner = google ? BANNERS[google] : undefined;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Company information used on documents</p>
      </div>

      <SettingsForm settings={settings} />

      {/* Google Drive */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-4 w-4" /> Google Drive
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect your Google Drive so a folder is created automatically for each new job.
          </p>

          {banner && (
            <div
              className={`text-sm rounded-md px-3 py-2 ${
                banner.tone === "ok"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-orange-50 text-orange-700 border border-orange-200"
              }`}
            >
              {banner.text}
            </div>
          )}

          {!configured ? (
            <p className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-3 py-2">
              Google Drive isn&apos;t set up on the server yet. Add the Google OAuth credentials
              (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) to enable this.
            </p>
          ) : status.connected ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>
                  Connected{status.email ? ` as ${status.email}` : ""}.
                </span>
              </div>
              <form action="/api/google/disconnect" method="post">
                <Button type="submit" variant="outline" size="sm">Disconnect</Button>
              </form>
            </div>
          ) : (
            <a href="/api/google/connect?returnTo=/settings">
              <Button size="sm">
                <FolderOpen className="h-4 w-4" /> Connect Google Drive
              </Button>
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
