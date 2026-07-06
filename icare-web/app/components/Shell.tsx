"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { SkeletonSidebar } from "./skeletons";
import {
  faBars,
  faBell,
  faChevronDown,
  faRightFromBracket,
  faUser,
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
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1B6B7B;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #145a63;
        }
        .sidebar-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .sidebar-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.3);
          border-radius: 2px;
        }
        .sidebar-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.5);
        }
      `}</style>
      <div className="h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex overflow-hidden">
        <div
          className={`fixed md:relative z-40 md:z-auto w-72 h-full bg-gradient-to-b from-[#1B6B7B] via-[#18636F] to-[#145A63] text-white flex flex-col shadow-2xl overflow-hidden md:overflow-y-auto sidebar-scrollbar transform transition-transform duration-300 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } md:translate-x-0`}
        >
          <div className="absolute top-0 left-0 right-0 bottom-0 opacity-10">
            <div className="absolute top-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-10 w-40 h-40 bg-white rounded-full blur-3xl" />
          </div>

          <div className="p-6 border-b border-white/10 relative z-10">
            <div className="flex items-center gap-3">
              {role === "student" ? (
                <>
                  <img
                    src={logo}
                    alt="iCARE++"
                    className="h-12 w-auto object-contain drop-shadow-md"
                  />
                  <div>
                    <h1 className="text-xl font-bold tracking-tight">iCARE++</h1>
                    <p className="text-xs text-white/60">{portalLabel}</p>
                  </div>
                </>
              ) : (
                <img
                  src={logo}
                  alt="iCARE++"
                  className="h-12 w-auto object-contain drop-shadow-md"
                />
              )}
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 relative z-10">
            <p className="px-4 text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">
              Menu
            </p>
            {navItems.map((item) => {
              const active = isActive(item, pathname, searchParams);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 relative ${
                    active
                      ? "bg-white/20 shadow-lg backdrop-blur-sm"
                      : "hover:bg-white/10"
                  }`}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
                  )}
                  <div
                    className={`p-1.5 rounded-lg ${
                      active ? "bg-white/20" : "bg-white/10"
                    }`}
                  >
                    <FontAwesomeIcon icon={item.icon} className="w-4 h-4" />
                  </div>
                  <span
                    className={`font-medium ${
                      active ? "text-white" : "text-white/80"
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/10 relative z-10">
            <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/10 relative">
              <div
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              >
                <div className="w-11 h-11 bg-white/20 rounded-full flex items-center justify-center shadow-inner overflow-hidden">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate text-sm">{user.name}</p>
                  <p className="text-xs text-white/50 capitalize">{user.role}</p>
                </div>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className={`w-4 h-4 text-white/50 transition-transform ${
                    userDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
              {userDropdownOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#145a63]/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-xl">
                  <Link
                    href={profileHref}
                    onClick={() => {
                      setUserDropdownOpen(false);
                      setSidebarOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors"
                  >
                    <FontAwesomeIcon icon={faUser} className="w-4 h-4" />
                    <span>Profile</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors"
                  >
                    <FontAwesomeIcon
                      icon={faRightFromBracket}
                      className="w-4 h-4"
                    />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="px-4 py-3 border-t border-white/5 relative z-10">
            <p className="text-[10px] text-white/30 text-center">
              iCARE++ v1.0 • Academic Year 2024-2025
            </p>
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
                <div className="w-8 h-8 bg-[#1B6B7B] rounded-lg flex items-center justify-center p-1">
                  <img
                    src={logo}
                    alt="iCARE++"
                    className="w-full h-full object-contain"
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
              <span className="px-2 py-1.5 bg-gradient-to-r from-[#1B6B7B] to-[#145a63] text-white text-xs font-medium rounded-lg">
                {mobileRoleLabel}
              </span>
            </div>
          </div>

          <div className="flex-1 p-4 lg:p-8 overflow-y-auto h-full custom-scrollbar">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
