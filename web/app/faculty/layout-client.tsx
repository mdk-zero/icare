"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  faBedPulse,
  faCalendarCheck,
  faChartBar,
  faClipboardList,
  faFileLines,
  faHouse,
  faListCheck,
  faNotesMedical,
  faPeopleGroup,
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
  { id: "overview", label: "Overview", href: "/faculty", icon: faHouse, section: "General" },
  {
    id: "teams",
    label: "My Groups",
    href: "/faculty/teams",
    icon: faPeopleGroup,
    section: "Teaching",
  },
  {
    id: "scenarios",
    label: "Scenarios",
    href: "/faculty/scenarios",
    icon: faNotesMedical,
    section: "Teaching",
  },
  {
    id: "assessments",
    label: "Skill Assessments",
    href: "/faculty/assessments",
    icon: faListCheck,
    section: "Teaching",
  },
  // Monitoring is the single clinical destination: the room layout and census
  // open a patient's chart, which carries their vitals, TPR/IVF, notes and
  // note sign-off. Patients, Vitals Monitor and EHR Review were folded into it
  // and their routes now redirect here.
  {
    id: "wards",
    label: "Wards",
    href: "/faculty/monitoring",
    icon: faBedPulse,
    section: "Clinical",
  },
  {
    id: "shifts",
    label: "Shifts",
    href: "/faculty/attendance",
    icon: faCalendarCheck,
    section: "Clinical",
  },
  {
    id: "analytics",
    label: "Analytics",
    href: "/faculty/analytics",
    icon: faChartBar,
    section: "Data",
  },
  { id: "reports", label: "Reports", href: "/faculty/reports", icon: faFileLines, section: "Data" },
  {
    id: "audit",
    label: "Audit Trail",
    href: "/faculty/audit",
    icon: faClipboardList,
    section: "Administration",
  },
];

function isActive(item: NavItem, pathname: string) {
  if (item.href === "/faculty") return pathname === "/faculty";
  // Student profiles are opened from My Groups, so they count as part of it.
  if (item.id === "teams" && pathname.startsWith("/faculty/students")) return true;
  return pathname.startsWith(item.href);
}

export default function ClientFacultyLayout({ children }: { children: React.ReactNode }) {
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
      else if (user.role === "admin") router.replace("/admin");
      else setReady(true);
    }
    void gate();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) return null;

  return (
    <Shell role="faculty" navItems={navItems} isActive={(item) => isActive(item, pathname)}>
      {children}
    </Shell>
  );
}
