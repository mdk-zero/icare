"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { SkeletonSidebar } from "./skeletons";
import {
  faAnglesLeft,
  faAnglesRight,
  faBars,
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
import { defaultAvatarSrc } from "../lib/default-avatar";
import {
  onNotificationArrival,
  stopNotificationStream,
  useNotifications,
} from "../lib/notifications-live";
import ToastContainer, { toast } from "./Toast";
import NotificationsPopover from "./NotificationsPopover";
import CacheConsentBanner from "./CacheConsentBanner";
import { onCacheClear } from "../lib/request-cache";

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

const SIDEBAR_GRADIENT = "linear-gradient(180deg, #0b3d3d 0%, #146464 50%, #0f5252 100%)";

/** Cool light falling from the top-left, so the panel has a light source. */
const SIDEBAR_GLOW: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(120% 60% at 0% 0%, rgba(94,234,212,0.14) 0%, transparent 60%)," +
    "radial-gradient(80% 50% at 100% 100%, rgba(0,0,0,0.28) 0%, transparent 70%)",
};

/**
 * Whether the desktop sidebar is collapsed to its icon rail; the mobile drawer
 * always opens at full width. Read through useSyncExternalStore so hydration
 * renders the server's expanded default first, then the stored choice. The
 * in-memory value keeps the toggle working where storage is blocked.
 */
const COLLAPSED_STORAGE_KEY = "icare_sidebar_collapsed";
const collapsedListeners = new Set<() => void>();
let collapsedValue: boolean | null = null;

function getCollapsed(): boolean {
  if (collapsedValue === null) {
    try {
      collapsedValue = window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
    } catch {
      collapsedValue = false;
    }
  }
  return collapsedValue;
}

function setCollapsedPreference(next: boolean) {
  collapsedValue = next;
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Storage blocked: the choice still holds until the page reloads.
  }
  collapsedListeners.forEach((listener) => listener());
}

function subscribeCollapsed(listener: () => void) {
  collapsedListeners.add(listener);
  return () => {
    collapsedListeners.delete(listener);
  };
}

/**
 * Hover intent for the collapsed rail: brushing past it on the way to the page
 * doesn't throw it open, and a pointer that slips off its edge for a moment
 * doesn't slam it shut.
 */
const PEEK_OPEN_DELAY = 120;
const PEEK_CLOSE_DELAY = 220;

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
 * On the collapsed rail it tucks under the icon, the only part of the row left.
 */
function NavPendingBar({ rail }: { rail: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`h-[3px] w-5 shrink-0 overflow-hidden rounded-full bg-white/15 transition-opacity duration-200 ${
        rail ? "absolute bottom-1 left-3" : "ml-auto"
      } ${pending ? "opacity-100" : "opacity-0"}`}
    >
      <span
        className="sb-sweep block h-full w-1/2 rounded-full"
        style={{ backgroundColor: ACCENT }}
      />
    </span>
  );
}

export default function Shell({ role, navItems, isActive, children }: ShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsed, () => false);
  // Three things open the collapsed rail out over the page: the pointer
  // resting on it, keyboard focus inside it, and the bell's cloud, which stays
  // aimed at the bell and so needs the bell kept where it was.
  const [hoverPeek, setHoverPeek] = useState(false);
  const [focusPeek, setFocusPeek] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const peekTimer = useRef<number | undefined>(undefined);
  // Collapsing leaves the pointer over the rail. Without this it would spring
  // straight back open; it clears once the pointer leaves.
  const peekSuppressed = useRef(false);
  const rail = isDesktop && collapsed && !hoverPeek && !focusPeek && !bellOpen;
  // Keeps the live stream open for every role so arrival toasts fire on pages
  // that have no bell of their own (students, admins). The bell below reads the
  // same store for its badge and preview.
  const { unread } = useNotifications();

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

  /**
   * Native listeners rather than React's onPointerEnter/Leave: React counts a
   * portal as inside its parent, so the bell cloud's full-screen backdrop
   * would read as the pointer never having left the rail.
   */
  useEffect(() => {
    const aside = asideRef.current;
    if (!aside || !collapsed) return;
    const schedule = (open: boolean) => {
      window.clearTimeout(peekTimer.current);
      peekTimer.current = window.setTimeout(
        () => setHoverPeek(open),
        open ? PEEK_OPEN_DELAY : PEEK_CLOSE_DELAY,
      );
    };
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && !peekSuppressed.current) schedule(true);
    };
    const onLeave = () => {
      peekSuppressed.current = false;
      schedule(false);
    };
    aside.addEventListener("pointerenter", onEnter);
    aside.addEventListener("pointerleave", onLeave);
    return () => {
      aside.removeEventListener("pointerenter", onEnter);
      aside.removeEventListener("pointerleave", onLeave);
      window.clearTimeout(peekTimer.current);
    };
  }, [collapsed, isLoading]);

  const toggleLabel = !collapsed
    ? "Collapse sidebar"
    : rail
      ? "Expand sidebar"
      : "Keep sidebar open";

  const toggleCollapsed = () => {
    const next = !collapsed;
    window.clearTimeout(peekTimer.current);
    setHoverPeek(false);
    setFocusPeek(false);
    peekSuppressed.current = next && !!asideRef.current?.matches(":hover");
    setCollapsedPreference(next);
  };

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
      // localStorage is only a mirror of the session cookie and the two can
      // disagree; an empty mirror asks the server rather than assuming nobody
      // is signed in, since the proxy would bounce that redirect back here.
      const cached = getCurrentUser();
      const fresh: User | null = cached && role !== "student" ? cached : await refreshCurrentUser();

      if (!mounted) return;
      if (!fresh) {
        router.replace("/login");
        return;
      }

      setUser(fresh);
      setIsLoading(false);
      const url = await getDisplayAvatarUrl(fresh.picture_url);
      if (mounted) {
        setAvatarUrl(url ?? defaultAvatarSrc(fresh.id, fresh.sex));
      }
    }
    init();
    return () => {
      mounted = false;
    };
  }, [router, role]);

  // Surface arrivals while the user is on some other page.
  useEffect(() => onNotificationArrival((notification) => toast(notification.title, "info")), []);

  /**
   * The first navigation ends the entrance animations for good — see
   * `.no-entrance` in globals.css. Search params count as a navigation because
   * the student dashboard's tabs are query-string links onto one page, and
   * those re-reveal the same content.
   *
   * Defaulting to animating and opting out from here, rather than the reverse,
   * keeps the reveal working if this never runs.
   */
  const location = `${pathname}?${searchParams}`;
  const openedAt = useRef(location);
  useEffect(() => {
    if (location !== openedAt.current) document.documentElement.classList.add("no-entrance");
  }, [location]);

  /**
   * Server-rendered pages — the admin overview above all — are held by the
   * router's segment cache, which a write through `apiFetch` cannot reach. A
   * refresh bumps that cache's version globally, so the next visit to any of
   * them reflects the write rather than a copy from before it.
   */
  useEffect(() => onCacheClear(() => router.refresh()), [router]);

  const handleLogout = () => {
    stopNotificationStream();
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
    return <SkeletonSidebar collapsed={collapsed} />;
  }

  return (
    <>
      <style>{shellStyles}</style>
      <div className="h-screen bg-canvas flex overflow-hidden">
        {/* Holds the sidebar's place in the row on desktop. It follows the
            pinned state only, so a peeking rail spreads over the page instead
            of pushing it aside. Every overlay the pages open sits at z-40 or
            above, so the sidebar's z-30 stays under them. */}
        <div
          className={`relative w-0 shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
            collapsed ? "md:w-[68px]" : "md:w-72"
          }`}
        >
          <aside
            ref={asideRef}
            inert={!isDesktop && !sidebarOpen ? true : undefined}
            onFocus={(e) => {
              // Keyboard focus only: a mouse click leaves focus on the link it
              // hit, which would hold the rail open after the pointer has gone.
              // Focus inside the bell's portal isn't in this subtree at all.
              if (
                collapsed &&
                e.currentTarget.contains(e.target) &&
                e.target.matches(":focus-visible")
              ) {
                setFocusPeek(true);
              }
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setFocusPeek(false);
            }}
            className={`group/sidebar fixed md:absolute inset-y-0 left-0 z-40 md:z-30 font-sans text-white shadow-[4px_0_24px_-8px_rgba(0,0,0,0.45)] transform transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
              rail ? "w-[68px]" : "w-72"
            } ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
            style={{ background: SIDEBAR_GRADIENT }}
          >
            {/* Clips the full-width content down to the rail. The collapse
                button sits outside it so it can straddle the edge. */}
            <div className="relative flex h-full flex-col overflow-hidden">
              <div aria-hidden className="pointer-events-none absolute inset-0" style={SIDEBAR_GLOW} />
              {/* Lit edge, so the panel reads as a raised bezel against the canvas. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent"
              />

              {/* Brand. Laid out at full width whatever the sidebar's width, so the
                  bell doesn't slide across as the rail opens; the clip reveals it. */}
              <div className="relative z-10 w-72 shrink-0 flex items-center gap-2 px-4 pt-4 pb-3.5">
                <Link
                  href={homeHref}
                  onClick={() => setSidebarOpen(false)}
                  className="group flex items-center gap-2.5 min-w-0 flex-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b3d3d]"
                >
                  <span
                    className={`flex min-w-0 items-center gap-2.5 transition-opacity duration-200 ${
                      rail ? "opacity-0" : "opacity-100"
                    }`}
                  >
                    {logoIsWordmark ? (
                      <span className="min-w-0">
                        <img
                          src={logo}
                          alt="iCARE++"
                          className="h-12 w-auto object-contain brightness-0 invert opacity-95 transition-opacity group-hover:opacity-100"
                        />
                        <span className="mt-2 block font-mono text-[10px] uppercase leading-none tracking-[0.16em] text-white/55 truncate">
                          {portalLabel}
                        </span>
                      </span>
                    ) : (
                      <>
                        <span className="relative w-10 h-10 shrink-0 rounded-[11px] bg-white/[0.08] ring-1 ring-white/15 flex items-center justify-center p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition-colors group-hover:bg-white/[0.13]">
                          <img
                            src={logo}
                            alt=""
                            className="w-full h-full object-contain brightness-0 invert"
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-mono text-sm font-bold leading-none tracking-tight text-white">
                            iCARE<span style={{ color: ACCENT }}>++</span>
                          </span>
                          <span className="mt-1.5 block font-mono text-[10px] uppercase leading-none tracking-[0.16em] text-white/55 truncate">
                            {portalLabel}
                          </span>
                        </span>
                      </>
                    )}
                  </span>
                  {/* The rail's mark: the square logo on the rail's centre line,
                      over the full brand, which stays in flow (faded out) so the
                      rows below keep their height. The wordmark can't be boxed
                      into a square, so every role gets the pill here. */}
                  <span
                    aria-hidden
                    className={`absolute left-3.5 top-4 bottom-3.5 flex items-center transition-opacity duration-200 ${
                      rail ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                  >
                    <span className="relative w-10 h-10 rounded-[11px] bg-white/[0.08] ring-1 ring-white/15 flex items-center justify-center p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                      <img
                        src="/logo-pill.png"
                        alt=""
                        className="w-full h-full object-contain brightness-0 invert"
                      />
                      {/* The bell is clipped off the rail; this keeps unread news visible. */}
                      {role === "faculty" && unread > 0 && (
                        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#0b3d3d]" />
                      )}
                    </span>
                  </span>
                </Link>
                {/* Beside the logo, where the eye lands first, rather than tucked
                    after the profile card. Centred on the 48px wordmark, not on the
                    wordmark plus the portal label under it. */}
                {role === "faculty" && (
                  <div className="mt-1.5 shrink-0 self-start">
                    <NotificationsPopover variant="sidebar" onOpenChange={setBellOpen} />
                  </div>
                )}
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
                  className={`group flex items-center gap-2.5 flex-1 min-w-0 overflow-hidden rounded-xl py-2 ring-1 transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4]/70 ${
                    rail
                      ? "px-1 bg-transparent ring-transparent"
                      : "px-2 bg-white/[0.05] ring-white/10 hover:bg-white/[0.09] hover:ring-white/20"
                  }`}
                >
                  <span className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-white/25">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full bg-gradient-to-br from-white/25 to-white/5 flex items-center justify-center">
                        <span className="text-sm font-bold text-white/90">
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                      </span>
                    )}
                  </span>
                  <span
                    className={`flex-1 min-w-0 transition-opacity duration-200 ${
                      rail ? "opacity-0" : "opacity-100"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-white truncate leading-tight">
                      {user.name}
                    </span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-white/55 leading-none mt-1">
                      {user.role}
                    </span>
                  </span>
                </Link>
              </div>

              {/* Navigation */}
              <nav
                aria-label="Primary"
                className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden sidebar-scrollbar px-3 py-2"
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
                        <div className="relative flex items-center gap-2 overflow-hidden px-2.5 pb-2 pt-1">
                          <p
                            id={headingId}
                            className={`whitespace-nowrap font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-white/55 transition-opacity duration-200 ${
                              rail ? "opacity-0" : "opacity-100"
                            }`}
                          >
                            {group.section}
                          </p>
                          <span aria-hidden className="h-px flex-1 bg-white/10" />
                          <span
                            aria-hidden
                            className={`absolute inset-x-2.5 top-1 bottom-2 flex items-center transition-opacity duration-200 ${
                              rail ? "opacity-100" : "opacity-0"
                            }`}
                          >
                            <span className="h-px w-full bg-white/20" />
                          </span>
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
                              className={`group relative flex items-center gap-2.5 overflow-hidden rounded-lg pl-3 pr-2.5 py-2.5 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f5252] ${
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
                                className={`w-5 h-5 shrink-0 transition-all duration-150 ${
                                  active
                                    ? "text-white"
                                    : "text-white/60 group-hover:text-white/90 group-hover:-translate-y-px"
                                }`}
                              />
                              <span
                                className={`text-[15px] leading-none tracking-[-0.005em] truncate transition-[color,opacity] duration-150 ${
                                  active
                                    ? "font-semibold text-white"
                                    : "font-medium text-white/75 group-hover:text-white"
                                } ${rail ? "opacity-0" : "opacity-100"}`}
                              >
                                {item.label}
                              </span>
                              <NavPendingBar rail={rail} />
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
                {/* Hover tint is a literal rose-100: the `rose-50` token retint to
                    near-black in dark mode would blacken the label and icon here,
                    since this sidebar is dark in both schemes. */}
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className={`group w-full flex items-center gap-2.5 overflow-hidden rounded-xl py-2.5 ring-1 text-white/70 hover:bg-rose-500/[0.16] hover:ring-rose-300/30 hover:text-[#ffe4e6] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f5252] cursor-pointer ${
                    rail ? "px-1.5 bg-transparent ring-transparent" : "px-2.5 bg-white/[0.04] ring-white/10"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] transition-colors duration-200 group-hover:bg-rose-400/25">
                    <FontAwesomeIcon
                      icon={faRightFromBracket}
                      className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </span>
                  <span
                    className={`whitespace-nowrap text-sm font-semibold leading-none transition-opacity duration-200 ${
                      rail ? "opacity-0" : "opacity-100"
                    }`}
                  >
                    Log out
                  </span>
                </button>
              </div>
            </div>

            {/* Collapse / keep-open toggle, straddling the edge. It shows on
                hover, and never on the closed rail: a peek would carry it off
                from under the pointer. Keyboard focus opens the rail first.
                Touch screens can't hover or peek, so there it always shows,
                or a collapsed rail could never be opened again. */}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={toggleLabel}
              title={toggleLabel}
              className={`absolute top-7 -right-3 z-20 hidden md:flex h-6 w-6 items-center justify-center rounded-full bg-[#0f5252] text-white/75 ring-1 ring-white/25 shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-[opacity,color,background-color] duration-200 hover:bg-[#146464] hover:text-white outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#5eead4]/70 cursor-pointer ${
                rail
                  ? "pointer-events-none opacity-0 [@media(hover:none)]:pointer-events-auto"
                  : "opacity-0 group-hover/sidebar:opacity-100"
              } [@media(hover:none)]:opacity-100`}
            >
              <FontAwesomeIcon icon={collapsed ? faAnglesRight : faAnglesLeft} className="w-2.5 h-2.5" />
            </button>
          </aside>
        </div>

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
              className="sb-pop w-full max-w-[400px] overflow-hidden rounded-2xl bg-surface shadow-[0_28px_70px_-16px_rgba(4,32,31,0.55)] ring-1 ring-black/[0.06]"
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
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-gray-200 flex items-center justify-center bg-brand-600/10">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-brand-600">
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
                  You&apos;ll need to sign in again to get back into the {portalLabel.toLowerCase()}
                  .
                </p>
              </div>

              <div className="flex gap-2.5 px-6 pb-6 pt-5">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 rounded-xl border border-gray-200 bg-surface px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-300 outline-none focus-visible:ring-2 focus-visible:ring-gray-400/60"
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
          <div className="md:hidden flex items-center justify-between p-3 bg-surface border-b border-gray-200 shadow-sm">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FontAwesomeIcon icon={faBars} className="w-5 h-5 text-gray-600" />
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
              {role === "faculty" && <NotificationsPopover variant="topbar" />}
              <span className="px-2 py-1.5 bg-gradient-to-br from-[#0b3d3d] to-[#146464] text-white text-xs font-medium rounded-lg">
                {mobileRoleLabel}
              </span>
            </div>
          </div>

          {/* `relative` makes this the containing block for any absolutely
              positioned descendant without a closer one (an `sr-only` list,
              say). Otherwise that element anchors to the viewport, escapes
              this scroller, and stretches the document past the h-screen
              shell — the page then scrolls on into bare body background. */}
          <div className="relative flex-1 p-3 lg:p-5 overflow-y-auto h-full custom-scrollbar">
            {children}
          </div>
        </div>
      </div>
      {/* Mounted here so every role gets arrival toasts from one container. */}
      <ToastContainer />
      <CacheConsentBanner />
    </>
  );
}
