"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { SkeletonSidebar } from "./skeletons";
import {
  faBars,
  faBell,
  faRightFromBracket,
  faXmark,
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
    // 2000x2000 square mark — works as an icon tile beside a typographic wordmark.
    logo: "/logo-pill.png",
    logoIsWordmark: false,
    portalLabel: "Student Portal",
    mobileRoleLabel: "Student",
    profileHref: "/profile",
    homeHref: "/dashboard",
  },
  faculty: {
    // 602x200 wordmark — must run at its own aspect ratio, never boxed into a square.
    logo: "/logo-white-no-bg.png",
    logoIsWordmark: true,
    portalLabel: "Faculty Portal",
    mobileRoleLabel: "Faculty",
    profileHref: "/faculty/settings",
    homeHref: "/faculty",
  },
  admin: {
    logo: "/logo-white-no-bg.png",
    logoIsWordmark: true,
    portalLabel: "Admin Portal",
    mobileRoleLabel: "Admin",
    profileHref: "/admin/settings",
    homeHref: "/admin",
  },
};

/** The one accent. It marks the current location and nothing else. */
const ACCENT = "#5eead4";

const SIDEBAR_GRADIENT =
  "linear-gradient(180deg, #0b3d3d 0%, #146464 50%, #0f5252 100%)";

/** Cool light falling from the top-left, so the panel has a light source. */
const SIDEBAR_GLOW: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(120% 60% at 0% 0%, rgba(94,234,212,0.14) 0%, transparent 60%)," +
    "radial-gradient(80% 50% at 100% 100%, rgba(0,0,0,0.28) 0%, transparent 70%)",
};

const shellStyles = `
  .custom-scrollbar::-webkit-scrollbar { width: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #2b8a7e; border-radius: 3px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3da89a; }
  .sidebar-scrollbar::-webkit-scrollbar { width: 4px; }
  .sidebar-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .sidebar-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 2px; }
  .sidebar-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.32); }

  @keyframes sbEnter {
    from { opacity: 0; transform: translate3d(-10px, 0, 0); }
    to   { opacity: 1; transform: none; }
  }
  .sb-enter { animation: sbEnter 0.42s cubic-bezier(0.22, 0.61, 0.36, 1) backwards; }

  @keyframes sbSweep {
    from { transform: translateX(-110%); }
    to   { transform: translateX(320%); }
  }
  .sb-sweep { animation: sbSweep 0.9s cubic-bezier(0.45, 0, 0.55, 1) infinite; }

  @keyframes sbFade { from { opacity: 0; } to { opacity: 1; } }
  .sb-fade { animation: sbFade 0.18s ease-out; }

  @keyframes sbPop {
    from { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.97); }
    to   { opacity: 1; transform: none; }
  }
  .sb-pop { animation: sbPop 0.26s cubic-bezier(0.22, 0.61, 0.36, 1); }

  @media (prefers-reduced-motion: reduce) {
    .sb-enter, .sb-fade, .sb-pop { animation: none; }
    .sb-sweep { animation: none; opacity: 0.85; }
  }
`;

/**
 * Live navigation feedback for a nav row. Fixed-size and always rendered — only
 * opacity toggles — so a pending route never shifts the row (per next/link docs).
 */
function NavPendingBar() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`ml-auto h-[3px] w-5 shrink-0 overflow-hidden rounded-full bg-white/15 transition-opacity duration-200 ${
        pending ? "opacity-100" : "opacity-0"
      }`}
    >
      <span
        className="sb-sweep block h-full w-1/2 rounded-full"
        style={{ backgroundColor: ACCENT }}
      />
    </span>
  );
}

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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  const { logo, logoIsWordmark, portalLabel, mobileRoleLabel, profileHref, homeHref } =
    config[role];

  const navGroups = useMemo(
    () =>
      navItems.reduce<{ section: string; items: NavItem[] }[]>((groups, item) => {
        const section = item.section ?? "General";
        const existing = groups.find((g) => g.section === section);
        if (existing) existing.items.push(item);
        else groups.push({ section, items: [item] });
        return groups;
      }, []),
    [navItems],
  );

  // Tracks the `md` breakpoint so the off-screen drawer can be taken out of the
  // tab order on mobile without hiding the always-visible desktop sidebar.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!sidebarOpen && !showLogoutConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // The dialog sits above the drawer, so it dismisses first.
      if (showLogoutConfirm) setShowLogoutConfirm(false);
      else setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen, showLogoutConfirm]);

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
      <style>{shellStyles}</style>
      <div className="h-screen bg-[#f8fafc] flex overflow-hidden">
        <aside
          inert={!isDesktop && !sidebarOpen ? true : undefined}
          className={`fixed md:relative z-40 md:z-auto w-60 h-full font-sans text-white flex flex-col shadow-[4px_0_24px_-8px_rgba(0,0,0,0.45)] transform transition-transform duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } md:translate-x-0`}
          style={{ background: SIDEBAR_GRADIENT }}
        >
          <div aria-hidden className="pointer-events-none absolute inset-0" style={SIDEBAR_GLOW} />
          {/* Lit edge, so the panel reads as a raised bezel against the canvas. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent"
          />

          {/* Brand */}
          <div className="relative z-10 shrink-0 flex items-center gap-2 px-4 pt-4 pb-3.5">
            <Link
              href={homeHref}
              onClick={() => setSidebarOpen(false)}
              className="group flex items-center gap-2.5 min-w-0 flex-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b3d3d]"
            >
              {logoIsWordmark ? (
                <span className="min-w-0">
                  <img
                    src={logo}
                    alt="iCARE++"
                    className="h-[26px] w-auto object-contain brightness-0 invert opacity-95 transition-opacity group-hover:opacity-100"
                  />
                  <span className="mt-2 block font-mono text-[9px] uppercase leading-none tracking-[0.16em] text-white/55 truncate">
                    {portalLabel}
                  </span>
                </span>
              ) : (
                <>
                  <span className="relative w-9 h-9 shrink-0 rounded-[11px] bg-white/[0.08] ring-1 ring-white/15 flex items-center justify-center p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition-colors group-hover:bg-white/[0.13]">
                    <img
                      src={logo}
                      alt=""
                      className="w-full h-full object-contain brightness-0 invert"
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-mono text-[13px] font-bold leading-none tracking-tight text-white">
                      iCARE<span style={{ color: ACCENT }}>++</span>
                    </span>
                    <span className="mt-1.5 block font-mono text-[9px] uppercase leading-none tracking-[0.16em] text-white/55 truncate">
                      {portalLabel}
                    </span>
                  </span>
                </>
              )}
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation"
              className="md:hidden w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <FontAwesomeIcon icon={faXmark} className="w-4 h-4" />
            </button>
          </div>

          {/* Profile */}
          <div className="relative z-10 shrink-0 mx-3 mb-2 flex items-center gap-2">
            <Link
              href={profileHref}
              onClick={() => setSidebarOpen(false)}
              className="group flex items-center gap-2.5 flex-1 min-w-0 rounded-xl px-2 py-2 bg-white/[0.05] ring-1 ring-white/10 hover:bg-white/[0.09] hover:ring-white/20 transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4]/70"
            >
              <span className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-white/25">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full bg-gradient-to-br from-white/25 to-white/5 flex items-center justify-center">
                    <span className="text-[13px] font-bold text-white/90">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </span>
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold text-white truncate leading-tight">
                  {user.name}
                </span>
                <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-white/55 leading-none mt-1">
                  {user.role}
                </span>
              </span>
            </Link>
            {role === "faculty" && (
              <Link
                href="/faculty/notifications"
                onClick={() => setSidebarOpen(false)}
                aria-label="Notifications"
                className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center bg-white/[0.05] ring-1 ring-white/10 text-white/65 hover:text-white hover:bg-white/[0.11] hover:ring-white/20 transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4]/70"
              >
                <FontAwesomeIcon icon={faBell} className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {/* Navigation */}
          <nav
            aria-label="Primary"
            className="relative z-10 flex-1 min-h-0 overflow-y-auto sidebar-scrollbar px-3 py-2"
          >
            {navGroups.map((group, groupIndex) => {
              const headingId = `sb-section-${group.section.toLowerCase().replace(/\s+/g, "-")}`;
              const showHeading = !(navGroups.length === 1 && group.section === "General");
              return (
                <div
                  key={group.section}
                  role="group"
                  aria-labelledby={showHeading ? headingId : undefined}
                  aria-label={showHeading ? undefined : group.section}
                  className="sb-enter mb-3 last:mb-0"
                  style={{ animationDelay: `${groupIndex * 55}ms` }}
                >
                  {showHeading && (
                    <div className="flex items-center gap-2 px-2.5 pb-2 pt-1">
                      <p
                        id={headingId}
                        className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-white/55"
                      >
                        {group.section}
                      </p>
                      <span aria-hidden className="h-px flex-1 bg-white/10" />
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = isActive(item, pathname, searchParams);
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={`group relative flex items-center gap-2.5 rounded-lg pl-3 pr-2.5 py-2 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f5252] ${
                            active ? "bg-white/[0.13]" : "hover:bg-white/[0.07]"
                          }`}
                        >
                          {/* The single active signal. */}
                          <span
                            aria-hidden
                            className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-200 ${
                              active ? "opacity-100 scale-y-100" : "opacity-0 scale-y-50"
                            }`}
                            style={{
                              backgroundColor: ACCENT,
                              boxShadow: active ? `0 0 10px ${ACCENT}66` : undefined,
                            }}
                          />
                          <FontAwesomeIcon
                            icon={item.icon}
                            className={`w-4 h-4 shrink-0 transition-all duration-150 ${
                              active
                                ? "text-white"
                                : "text-white/60 group-hover:text-white/90 group-hover:-translate-y-px"
                            }`}
                          />
                          <span
                            className={`text-[13px] leading-none tracking-[-0.005em] truncate transition-colors duration-150 ${
                              active
                                ? "font-semibold text-white"
                                : "font-medium text-white/75 group-hover:text-white"
                            }`}
                          >
                            {item.label}
                          </span>
                          <NavPendingBar />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="relative z-10 shrink-0 px-3 pt-3 pb-3.5">
            <div
              aria-hidden
              className="mb-3 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
            />
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="group w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 bg-white/[0.04] ring-1 ring-white/10 text-white/70 hover:bg-rose-500/[0.16] hover:ring-rose-300/30 hover:text-rose-50 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f5252]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] transition-colors duration-200 group-hover:bg-rose-400/25">
                <FontAwesomeIcon
                  icon={faRightFromBracket}
                  className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </span>
              <span className="text-[13px] font-semibold leading-none">Log out</span>
              <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] leading-none text-white/35 transition-colors duration-200 group-hover:text-rose-200/80">
                End session
              </span>
            </button>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {showLogoutConfirm && (
          <div
            className="sb-fade fixed inset-0 z-50 flex items-center justify-center bg-[#04201f]/60 backdrop-blur-md p-4"
            onClick={() => setShowLogoutConfirm(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="logout-title"
              aria-describedby="logout-desc"
              className="sb-pop w-full max-w-[400px] overflow-hidden rounded-2xl bg-white shadow-[0_28px_70px_-16px_rgba(4,32,31,0.55)] ring-1 ring-black/[0.06]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header carries the sidebar it was launched from. */}
              <div className="relative px-6 pt-6 pb-5" style={{ background: SIDEBAR_GRADIENT }}>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={SIDEBAR_GLOW}
                />
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  aria-label="Close"
                  className="absolute right-3.5 top-3.5 w-8 h-8 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  <FontAwesomeIcon icon={faXmark} className="w-4 h-4" />
                </button>
                <div className="relative flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.12] ring-1 ring-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                    <FontAwesomeIcon icon={faRightFromBracket} className="w-4 h-4 text-white" />
                  </span>
                  <span>
                    <h2
                      id="logout-title"
                      className="text-[17px] font-bold leading-tight text-white"
                    >
                      Log out
                    </h2>
                    <span className="mt-1.5 block font-mono text-[9px] uppercase leading-none tracking-[0.16em] text-white/60">
                      End session
                    </span>
                  </span>
                </div>
              </div>

              <div className="px-6 pt-5 pb-1">
                <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5 ring-1 ring-gray-200/80">
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-gray-200 flex items-center justify-center bg-[#1B6B7B]/10">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-[#1B6B7B]">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900">
                      {user.name}
                    </span>
                    <span className="block truncate text-xs text-gray-500">{user.email}</span>
                  </span>
                </div>
                <p id="logout-desc" className="mt-4 text-sm leading-relaxed text-gray-600">
                  You&apos;ll need to sign in again to get back into the{" "}
                  {portalLabel.toLowerCase()}.
                </p>
              </div>

              <div className="flex gap-2.5 px-6 pb-6 pt-5">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-300 outline-none focus-visible:ring-2 focus-visible:ring-gray-400/60"
                >
                  Stay signed in
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-2px_rgba(225,29,72,0.45)] transition-all hover:bg-rose-700 hover:shadow-[0_6px_18px_-2px_rgba(225,29,72,0.55)] outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
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
