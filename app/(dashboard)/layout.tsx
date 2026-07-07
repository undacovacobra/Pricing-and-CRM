import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { OfflineManager } from "@/components/offline/OfflineManager";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import { createClient } from "@/lib/supabase/server";
import { userNameForEmail } from "@/lib/team";
import { roleFromUser } from "@/lib/auth/roles";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: settings } = await supabase.from("app_settings").select("background_photo_path").single();
  const { data: { user } } = await supabase.auth.getUser();
  const role = roleFromUser(user);
  const userName = (user?.user_metadata?.display_name as string | undefined) || userNameForEmail(user?.email);

  const backgroundUrl = settings?.background_photo_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/branding/${settings.background_photo_path}`
    : null;

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-x-hidden w-full max-w-full">
      {backgroundUrl && (
        <div
          className="fixed inset-0 bg-cover bg-center bg-no-repeat opacity-10 pointer-events-none"
          style={{ backgroundImage: `url(${backgroundUrl})` }}
        />
      )}
      <div className="relative">
        <RegisterServiceWorker />
        <Sidebar userName={userName} role={role} />
        <main className="md:ml-60 pb-20 md:pb-6 overflow-x-hidden">
          <div className="max-w-7xl mx-auto px-4 py-6 w-full min-w-0">
            {children}
          </div>
        </main>
        <MobileNav role={role} />
        {role !== "installer" && <AssistantWidget />}
        <OfflineManager />
      </div>
    </div>
  );
}
