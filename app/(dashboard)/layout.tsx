import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { createClient } from "@/lib/supabase/server";

const USER_NAMES: Record<string, string> = {
  "thetravisj1989@gmail.com": "Travis",
  "carol@coastaledgedesign.com": "Carol",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: settings } = await supabase.from("app_settings").select("background_photo_path").single();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase() ?? "";
  const userName = USER_NAMES[email] ?? (email ? email.split("@")[0] : "");

  const backgroundUrl = settings?.background_photo_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/branding/${settings.background_photo_path}`
    : null;

  return (
    <div className="min-h-screen bg-slate-50 relative">
      {backgroundUrl && (
        <div
          className="fixed inset-0 bg-cover bg-center bg-no-repeat opacity-10 pointer-events-none"
          style={{ backgroundImage: `url(${backgroundUrl})` }}
        />
      )}
      <div className="relative">
        <Sidebar userName={userName} />
        <main className="md:ml-60 pb-20 md:pb-6">
          <div className="max-w-7xl mx-auto px-4 py-6">
            {children}
          </div>
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
