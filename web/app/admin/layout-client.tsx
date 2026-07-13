"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  faChartBar,
  faClockRotateLeft,
  faDoorOpen,
  faFileLines,
  faHouse,
  faUserTie,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import Shell, { NavItem } from "../components/Shell";

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
  { id: "overview", label: "Overview", href: "/admin", icon: faHouse },
  { id: "students", label: "Students", href: "/admin/student-management", icon: faUsers },
  { id: "analytics", label: "Analytics", href: "/admin/analytics", icon: faChartBar },
  { id: "reports", label: "Reports", href: "/admin/reports", icon: faFileLines },
  { id: "rooms", label: "Rooms", href: "/admin/rooms", icon: faDoorOpen },
  { id: "faculty", label: "Faculty", href: "/admin/faculty", icon: faUserTie },
  { id: "users", label: "Users", href: "/admin/users", icon: faUsers },
  { id: "audit", label: "Activity Log", href: "/admin/audit", icon: faClockRotateLeft },
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

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push("/login");
    } else if (currentUser.role === "student") {
      router.push("/dashboard");
    } else {
      // Mark shell ready after client-side auth check.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true);
    }
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
