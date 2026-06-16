"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Briefcase, FolderOpen, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

const mobileNavItems = [
  { href: "/",            label: "Home",    icon: LayoutDashboard },
  { href: "/jobs",        label: "Jobs",    icon: Briefcase },
  { href: "/customers",   label: "Clients", icon: Users },
  { href: "/documents",   label: "Docs",    icon: FolderOpen },
  { href: "/commissions", label: "Commiss", icon: Receipt },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t">
      <div className="flex">
        {mobileNavItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 flex-1 py-2.5 text-[10px] font-medium transition-colors",
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
