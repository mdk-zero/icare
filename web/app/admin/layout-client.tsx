"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  faClockRotateLeft,
  faFlaskVial,
  faGaugeHigh,
  faGear,
  faHouse,
  faLifeRing,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import Shell, { NavItem } from "../components/Shell";
import { getCurrentUser, refreshCurrentUser } from "../lib/api";

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/admin", icon: faHouse, section: "General" },
  { id: "users", label: "Users", href: "/admin/users", icon: faUsers, section: "Accounts" },
  { id: "audit", label: "Activity Log", href: "/admin/audit", icon: faClockRotateLeft, section: "System" },
  { id: "performance", label: "System Performance", href: "/admin/performance", icon: faGaugeHigh, section: "System" },
  { id: "tests", label: "System Tests", href: "/admin/tests", icon: faFlaskVial, section: "System" },
  { id: "settings", label: "Settings", href: "/admin/settings", icon: faGear, section: "Account" },
  { id: "support", label: "Support Requests", href: "/admin/support", icon: faLifeRing, section: "Support" },
];

function isActive(item: NavItem, pathname: string) {
  if (item.href === "/admin") return pathname === "/admin";
  return pathname.startsWith(item.href);
}

function homeFor(role: string): string {
  if (role === "faculty") return "/instructor";
  if (role === "admin") return "/dean";
  return "/login";
}

/**
 * Same gate as the admin layout: an empty localStorage mirror asks the server
 * before concluding nobody is signed in. Every /api/super-admin/* route
 * re-checks the live role, so this only keeps others from a console they
 * cannot act in.
 */
export default function ClientSuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function gate() {
      const user = getCurrentUser() ?? (await refreshCurrentUser());
      if (cancelled) return;
      if (!user) router.replace("/login");
      else if (user.role !== "super_admin") router.replace(homeFor(user.role));
      else setReady(true);
    }
    void gate();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) return null;

  return (
    <Shell role="super_admin" navItems={navItems} isActive={(item) => isActive(item, pathname)}>
      {children}
    </Shell>
  );
}
