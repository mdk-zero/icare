"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  faBell,
  faChartBar,
  faClipboardCheck,
  faFileLines,
  faHouse,
  faNotesMedical,
} from "@fortawesome/free-solid-svg-icons";
import Shell, { NavItem } from "../components/Shell";

const navItems: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: faHouse,
  },
  {
    id: "patients",
    label: "Patients",
    href: "/patients",
    icon: faFileLines,
  },
  {
    id: "quizzes",
    label: "Quizzes",
    href: "/dashboard?tab=quizzes",
    icon: faClipboardCheck,
  },
  {
    id: "scenarios",
    label: "Scenarios",
    href: "/dashboard?tab=scenarios",
    icon: faNotesMedical,
  },
  {
    id: "performance",
    label: "Performance",
    href: "/dashboard?tab=performance",
    icon: faChartBar,
  },
  {
    id: "notifications",
    label: "Notifications",
    href: "/notifications",
    icon: faBell,
  },
];

function isActive(item: NavItem, pathname: string, searchParams: URLSearchParams) {
  const activeTab = searchParams.get("tab") || "dashboard";
  if (item.id === "dashboard") {
    return pathname === "/dashboard" && activeTab === "dashboard";
  }
  // Patients and Notifications have dedicated routes; other tabs remain on /dashboard.
  if (item.id === "patients") {
    return pathname === "/patients";
  }
  if (item.id === "notifications") {
    return pathname === "/notifications";
  }
  return pathname === "/dashboard" && activeTab === item.id;
}

export default function StudentLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Shell
      role="student"
      navItems={navItems}
      isActive={(item) => isActive(item, pathname, searchParams)}
    >
      {children}
    </Shell>
  );
}
