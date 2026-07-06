"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  faBell,
  faChartBar,
  faClipboardList,
  faFileLines,
  faHospitalUser,
  faHouse,
  faNotesMedical,
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
  { id: "overview", label: "Overview", href: "/faculty", icon: faHouse },
  { id: "students", label: "My Students", href: "/faculty/students", icon: faUsers },
  { id: "scenarios", label: "Scenarios", href: "/faculty/scenarios", icon: faNotesMedical },
  { id: "patients", label: "Patients", href: "/faculty/patients", icon: faHospitalUser },
  { id: "analytics", label: "Analytics", href: "/faculty/analytics", icon: faChartBar },
  { id: "reports", label: "Reports", href: "/faculty/reports", icon: faFileLines },
  { id: "audit", label: "Audit Trail", href: "/faculty/audit", icon: faClipboardList },
  { id: "notifications", label: "Notifications", href: "/faculty/notifications", icon: faBell },
];

function isActive(item: NavItem, pathname: string) {
  if (item.href === "/faculty") return pathname === "/faculty";
  return pathname.startsWith(item.href);
}

export default function ClientFacultyLayout({
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
    } else if (currentUser.role === "admin") {
      router.push("/admin");
    } else {
      // Mark shell ready after client-side auth check.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true);
    }
  }, [router]);

  if (!ready) return null;

  return (
    <Shell
      role="faculty"
      navItems={navItems}
      isActive={(item) => isActive(item, pathname)}
    >
      {children}
    </Shell>
  );
}
