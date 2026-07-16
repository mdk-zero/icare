"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { SkeletonSidebar } from "./skeletons";
import {
  faBars,
  faBell,
  faRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import {
  getCurrentUser,
  getDisplayAvatarUrl,
  logout,
  refreshCurrentUser,
  logAuditAction,
  User,
} from "../lib/api";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconDefinition;
  section?: string;
}

interface ShellProps {
  role: "student" | "faculty" | "admin";
  navItems: NavItem[];
  isActive: (item: NavItem, pathname: string, searchParams: URLSearchParams) => boolean;
  children: React.ReactNode;
}

const config = {
  student: {
    logo: "/logo-pill.png",
    portalLabel: "Student Portal",
    mobileRoleLabel: "Student",
    profileHref: "/profile",
  },
  faculty: {
    logo: "/logo-white-no-bg.png",
    portalLabel: "Faculty Portal",
    mobileRoleLabel: "Faculty",
    profileHref: "/faculty/settings",
  },
  admin: {
    logo: "/logo-white-no-bg.png",
    portalLabel: "Admin Portal",
    mobileRoleLabel: "Admin",
    profileHref: "/admin/settings",
  },
};

export default function Shell({
  role,
  navItems,
  isActive,
  children,
}: ShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { logo, portalLabel, mobileRoleLabel, profileHref } = config[role];

  useEffect(() => {
    let mounted = true;
    async function init() {
      const current = getCurrentUser();
      if (!current) {
        router.replace("/login");
        return;
      }

      let fresh: User | null = current;
      if (role === "student") {
        fresh = await refreshCurrentUser();
      }

      if (!mounted) return;
      if (!fresh) {
        router.replace("/login");
        return;
      }

      setUser(fresh);
      setIsLoading(false);
      const url = await getDisplayAvatarUrl(fresh.picture_url);
      if (mounted) {
        setAvatarUrl(url);
      }
    }
    init();
    return () => {
      mounted = false;
    };
  }, [router, role]);

  const handleLogout = () => {
    if (user?.role === "faculty") {
      void logAuditAction({
        faculty_id: user.id,
        faculty_name: user.name,
        tab: "Authentication",
        action: "Logout",
        details: "Logged out",
      });
    }
    logout();
    router.replace("/login");
  };

  if (isLoading || !user) {
    return <SkeletonSidebar />;
  }

  return (
    <>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2b8a7e; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3da89a; }
        .sidebar-scrollbar::-webkit-scrollbar { width: 4px; }
        .sidebar-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .sidebar-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
        .sidebar-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.35); }
      `}</style>
      <div className="h-screen bg-[#f8fafc] flex overflow-hidden">
        <div
          className={`fixed md:relative z-40 md:z-auto w-60 h-full text-white flex flex-col shadow-[4px_0_20px_-6px_rgba(0,0,0,0.25)] overflow-y-auto sidebar-scrollbar transform transition-transform duration-300 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } md:translate-x-0`}
          style={{
            background: 'linear-gradient(180deg, #0b3d3d 0%, #146464 50%, #0f5252 100%)',
          }}
        >
          {/* subtle pattern overlay */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.6) 0%, transparent 50%), radial-gradient(circle at 75% 80%, rgba(255,255,255,0.3) 0%, transparent 40%)'
          }} />

          {/* Profile + Notification */}
          <div className="relative z-10 flex items-center gap-2 px-4 py-3 border-b border-white/10">
            <Link
              href={profileHref}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 flex-1 min-w-0 rounded-lg hover:bg-white/[0.04] transition-colors -mx-1 px-1 py-1"
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0 ring-2 ring-white/15">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center">
                    <span className="text-sm font-bold text-white/80">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white/85 truncate">{user.name}</p>
                <p className="text-[10px] text-white/40 capitalize tracking-wide">{user.role}</p>
              </div>
            </Link>
            {role === "faculty" && (
              <Link
                href="/faculty/notifications"
                onClick={() => setSidebarOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/[0.1] transition-colors shrink-0"
              >
                <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </Link>
            )}
          </div>

          {/* Navigation */}
          <nav className="relative z-10 flex-1 px-3 py-3 space-y-0.5">
            {navItems.reduce<{ section: string; items: NavItem[] }[]>((groups, item) => {
              const section = item.section ?? "General";
              const existing = groups.find((g) => g.section === section);
              if (existing) {
                existing.items.push(item);
              } else {
                groups.push({ section, items: [item] });
              }
              return groups;
            }, []).map((group) => (
              <div key={group.section} className="mb-1">
                <p className="px-3 py-1.5 text-[9px] font-bold text-white/30 uppercase tracking-[0.12em]">
                  {group.section}
                </p>
                {group.items.map((item) => {
                  const active = isActive(item, pathname, searchParams);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`group relative w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 ${
                        active
                          ? "bg-white/15 shadow-sm"
                          : "hover:bg-white/[0.06]"
                      }`}
                    >
                      {active && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-emerald-300 rounded-r-full shadow-[0_0_6px_rgba(110,231,183,0.3)]" />
                      )}
                      <div className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all ${
                        active ? "bg-white/20" : "bg-white/[0.06]"
                      }`}>
                        <FontAwesomeIcon
                          icon={item.icon}
                          className={`w-3.5 h-3.5 transition-colors ${
                            active ? "text-white" : "text-white/50 group-hover:text-white/70"
                          }`}
                        />
                      </div>
                      <span className={`text-xs font-semibold tracking-wide ${
                        active ? "text-white" : "text-white/60 group-hover:text-white/80"
                      }`}>
                        {item.label}
                      </span>
                      {active && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-300 shadow-[0_0_6px_rgba(110,231,183,0.4)]" />
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Logout */}
          <div className="relative z-10 px-3 pb-3 border-t border-white/10 pt-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/40 hover:text-red-300 hover:bg-red-500/10 transition-all duration-150 text-xs font-semibold tracking-wide"
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-lg">
                <FontAwesomeIcon icon={faRightFromBracket} className="w-3.5 h-3.5" />
              </div>
              <span>Logout</span>
            </button>
          </div>
        </div>

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="md:hidden flex items-center justify-between p-3 bg-white border-b border-gray-200 shadow-sm">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FontAwesomeIcon
                  icon={faBars}
                  className="w-5 h-5 text-gray-600"
                />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-[#0b3d3d] to-[#146464] rounded-lg flex items-center justify-center p-1">
                  <img
                    src={logo}
                    alt="iCARE++"
                    className="w-full h-full object-contain brightness-0 invert"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {role !== "student" && (
                <button className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                  <FontAwesomeIcon
                    icon={faBell}
                    className="w-5 h-5 text-gray-600"
                  />
                </button>
              )}
              <span className="px-2 py-1.5 bg-gradient-to-br from-[#0b3d3d] to-[#146464] text-white text-xs font-medium rounded-lg">
                {mobileRoleLabel}
              </span>
            </div>
          </div>

          <div className="flex-1 p-3 lg:p-5 overflow-y-auto h-full custom-scrollbar">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
