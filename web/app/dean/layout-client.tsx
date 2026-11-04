"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  faBedPulse,
  faBookMedical,
  faChartBar,
  faClockRotateLeft,
  faFileLines,
  faHouse,
  faLifeRing,
  faSitemap,
  faUserTie,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import Shell, { NavItem } from "../components/Shell";
import { refreshCurrentUser } from "../lib/api";

interface User {
  id: string;
  email: string;
  name: string;
  role: "student" | "faculty" | "admin" | "super_admin";
  admin_title?: "program_chair" | null;
}

function getCurrentUser(): User | null {
  if (typeof window === "undefined") return null;
  const userStr = localStorage.getItem("icare_user");
  return userStr ? JSON.parse(userStr) : null;
}

/**
 * A Program Chair shares this portal with the Dean, apart from this page. The
 * page and its API refuse them on the server; hiding it here keeps it out of
 * their menu, and turns a demo Program Chair away, whose title only the browser
 * knows.
 */
const PROGRAM_CHAIRS_HREF = "/dean/program-chairs";

const navItems: NavItem[] = [
  { id: "overview", label: "Overview", href: "/dean", icon: faHouse, section: "General" },
  { id: "students", label: "Students", href: "/dean/student-management", icon: faUsers, section: "Management" },
  { id: "faculty", label: "Instructors", href: "/dean/instructors", icon: faUserTie, section: "Management" },
  { id: "program-chairs", label: "Program Chairs", href: PROGRAM_CHAIRS_HREF, icon: faSitemap, section: "Management" },
  { id: "courses", label: "Courses", href: "/dean/courses", icon: faBookMedical, section: "Management" },
  // Patients and Rooms folded into one page, as on the faculty side. The
  // patient chart keeps its /dean/patients/[id] route, so it counts here too.
  { id: "wards", label: "Wards", href: "/dean/wards", icon: faBedPulse, section: "Management" },
  { id: "analytics", label: "Analytics", href: "/dean/analytics", icon: faChartBar, section: "Data" },
  { id: "reports", label: "Reports", href: "/dean/reports", icon: faFileLines, section: "Data" },
  { id: "audit", label: "Activity Log", href: "/dean/audit", icon: faClockRotateLeft, section: "Administration" },
  { id: "help", label: "Help & Support", href: "/dean/help", icon: faLifeRing, section: "Support" },
];

function isActive(item: NavItem, pathname: string) {
  if (item.href === "/dean") return pathname === "/dean";
  if (item.id === "wards" && pathname.startsWith("/dean/patients")) return true;
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
  const [isProgramChair, setIsProgramChair] = useState(false);
  const turnedAway = isProgramChair && pathname.startsWith(PROGRAM_CHAIRS_HREF);

  useEffect(() => {
    if (turnedAway) router.replace("/dean");
  }, [turnedAway, router]);

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
      // Every /api/admin/* route requires role === 'admin', so anything less
      // gets a console it cannot act in: the forms render, then each submit
      // comes back "Forbidden". Bouncing non-admins here is what the server
      // component at app/admin/page.tsx already does; the two gates only
      // disagreed because this one screened for students alone.
      else if (user.role !== "admin")
        router.replace(
          user.role === "faculty"
            ? "/instructor"
            : user.role === "super_admin"
              ? "/admin"
              : "/login",
        );
      else {
        setIsProgramChair(user.admin_title === "program_chair");
        setReady(true);
      }
    }
    void gate();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready || turnedAway) return null;

  return (
    <Shell
      role="admin"
      navItems={isProgramChair ? navItems.filter((item) => item.href !== PROGRAM_CHAIRS_HREF) : navItems}
      isActive={(item) => isActive(item, pathname)}
    >
      {children}
    </Shell>
  );
}
