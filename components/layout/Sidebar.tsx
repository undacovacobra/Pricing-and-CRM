"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Tag,
  Settings,
  LogOut,
  Receipt,
  FolderOpen,
  Calculator,
  CalendarDays,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/",             label: "Dashboard",   icon: LayoutDashboard },
  { href: "/calendar",     label: "Calendar",    icon: CalendarDays },
  { href: "/chat",         label: "Chat",        icon: MessageSquare },
  { href: "/jobs",         label: "Jobs",        icon: Briefcase },
  { href: "/customers",    label: "Customers",   icon: Users },
  { href: "/documents",    label: "Documents",   icon: FolderOpen },
  { href: "/estimates",    label: "Estimates",   icon: Calculator },
  { href: "/pricing",      label: "Pricing",     icon: Tag },
  { href: "/commissions",  label: "Commissions", icon: Receipt },
  { href: "/settings",     label: "Settings",    icon: Settings },
];

export function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen border-r bg-slate-50 fixed left-0 top-0 bottom-0">
      <div className="p-6 border-b">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Coastal Edge Cabinetry and Design</p>
        <h1 className="font-bold text-lg text-slate-900 mt-0.5">{userName}</h1>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
