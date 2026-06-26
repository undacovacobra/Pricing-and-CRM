"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Briefcase, Receipt, Settings, Calculator, CalendarDays, MessageSquare, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const mobileNavItems = [
  { href: "/",             label: "Home",     icon: LayoutDashboard },
  { href: "/calendar",     label: "Calendar", icon: CalendarDays },
  { href: "/tasks",        label: "Tasks",    icon: ListChecks },
  { href: "/chat",         label: "Chat",     icon: MessageSquare },
  { href: "/jobs",         label: "Jobs",     icon: Briefcase },
  { href: "/customers",    label: "Clients",  icon: Users },
  { href: "/estimates",    label: "Estim",    icon: Calculator },
  { href: "/commissions",  label: "Commiss",  icon: Receipt },
  { href: "/settings",     label: "Settings", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t pb-[env(safe-area-inset-bottom)]">
      <div className="flex overflow-x-auto">
        {mobileNavItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 shrink-0 basis-1/5 min-w-[64px] py-2.5 text-[10px] font-medium transition-colors",
                isActive ? "text-slate-900" : "text-slate-400"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "text-slate-900")} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
