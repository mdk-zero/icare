"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  faChartBar,
  faClockRotateLeft,
  faDoorOpen,
  faFileLines,
  faHospitalUser,
  faHouse,
  faUserTie,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import Shell, { NavItem } from "../components/Shell";
import { refreshCurrentUser } from "../lib/api";

interface User {
  id: string;
  email: string;
  name: string;
  role: "student" | "faculty" | "admin";
}

function getCurrentUser(): User | null {
  if (typeof window === "undefined") return null;
  const userStr = localStorage.getItem("icare_user");
  return userStr ? JSON.parse(userStr) : null;
}

const navItems: NavItem[] = [
  { id: "overview", label: "Overview", href: "/admin", icon: faHouse, section: "General" },
  { id: "students", label: "Students", href: "/admin/student-management", icon: faUsers, section: "Management" },
  { id: "faculty", label: "Faculty", href: "/admin/faculty", icon: faUserTie, section: "Management" },
  { id: "patients", label: "Patients", href: "/admin/patients", icon: faHospitalUser, section: "Management" },
  { id: "rooms", label: "Rooms", href: "/admin/rooms", icon: faDoorOpen, section: "Management" },
  { id: "users", label: "Users", href: "/admin/users", icon: faUsers, section: "Management" },
  { id: "analytics", label: "Analytics", href: "/admin/analytics", icon: faChartBar, section: "Data" },
  { id: "reports", label: "Reports", href: "/admin/reports", icon: faFileLines, section: "Data" },
  { id: "audit", label: "Activity Log", href: "/admin/audit", icon: faClockRotateLeft, section: "Administration" },
];

function isActive(item: NavItem, pathname: string) {
  if (item.href === "/admin") return pathname === "/admin";
  return pathname.startsWith(item.href);
}

export default function ClientAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  /**
   * localStorage is only a mirror of the session cookie, and the two can
   * disagree — clearing site data drops the mirror while the cookie survives.
   * The proxy then lets the request through on the cookie while this sees
   * nobody, and redirecting to /login on the mirror alone bounces off the
   * proxy straight back here: a loop that renders nothing at all. So an empty
   * mirror asks the server before concluding anyone is signed out, and
   * refreshCurrentUser() repopulates it.
   */
  useEffect(() => {
    let cancelled = false;
    async function gate() {
      const user = getCurrentUser() ?? (await refreshCurrentUser());
      if (cancelled) return;
      if (!user) router.replace("/login");
      else if (user.role === "student") router.replace("/dashboard");
      else setReady(true);
    }
    void gate();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) return null;

  return (
    <Shell
      role="admin"
      navItems={navItems}
      isActive={(item) => isActive(item, pathname)}
    >
      {children}
    </Shell>
  );
}
