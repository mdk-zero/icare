"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import logo from "../../../public/logo-no-bg.png";
import logoWhite from "../../../public/logo-white-no-bg.png";
import { Icon, ICONS } from "./Icon";
import { SECTION_LINKS } from "./sections";

/**
 * Sits flush and transparent over the hero, then settles into a floating
 * frosted bar once the page moves. Below md the section links fold into a
 * menu, leaving the bar to the logo and the primary action.
 */
export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Highlight whichever linked section is currently under the navbar. The top
  // margin matches the bar's height so a section counts as "current" the moment
  // it clears it, and the -55% bottom keeps only one entry active at a time.
  useEffect(() => {
    const targets = SECTION_LINKS.map(({ id }) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) {
          // Back up in the hero, above the first linked section: nothing is
          // current. Leaving a later section keeps it lit through the unlinked
          // sections that follow it.
          const first = entries.find((e) => e.target.id === SECTION_LINKS[0].id);
          if (first && first.boundingClientRect.top > 0) setActiveSection(null);
          return;
        }
        // Nearest to the top wins when two are on screen together.
        const top = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        );
        setActiveSection(top.target.id);
      },
      { rootMargin: "-80px 0px -55% 0px", threshold: 0 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    // The menu only exists below md; widening past it would strand it open.
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => wide.matches && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [menuOpen]);

  const raised = scrolled || menuOpen;

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4">
      <nav
        aria-label="Main"
        className={`relative mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 rounded-2xl border px-3 transition-all duration-500 ease-out sm:px-4 ${
          raised
            ? "border-hairline bg-surface/80 shadow-tile-hover backdrop-blur-xl"
            : "border-transparent bg-transparent"
        }`}
      >
        <Link href="/" className="flex shrink-0 items-center" onClick={() => setMenuOpen(false)}>
          <Image src={logo} alt="iCARE++" className="h-8 w-auto dark:hidden" loading="eager" />
          <Image
            src={logoWhite}
            alt="iCARE++"
            className="hidden h-8 w-auto dark:block"
            loading="eager"
          />
        </Link>

        <div className="hidden items-center gap-0.5 md:flex">
          {SECTION_LINKS.map((item) => {
            const active = activeSection === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={active ? "true" : undefined}
                className={`relative rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-300 ${
                  active ? "text-brand-700" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {item.label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-3 -bottom-px h-0.5 origin-center rounded-full bg-brand-600 transition-transform duration-300 ${
                    active ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </a>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            href="/login"
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-brand-700 sm:inline-flex"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="group inline-flex items-center gap-1.5 rounded-full bg-brand-600 py-2 pl-4 pr-3.5 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition-colors hover:bg-brand-700"
          >
            Contact Us
            <Icon
              d={ICONS.arrowRight}
              strokeWidth={2}
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="landing-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 md:hidden"
          >
            <Icon d={menuOpen ? ICONS.x : ICONS.menu} className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        {menuOpen && (
          <div
            id="landing-menu"
            className="absolute inset-x-0 top-[calc(100%+0.5rem)] animate-rise rounded-2xl border border-hairline bg-surface p-2 shadow-overlay md:hidden"
          >
            {SECTION_LINKS.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-colors hover:bg-subtle ${
                  activeSection === item.id ? "text-brand-700" : "text-gray-700"
                }`}
              >
                {item.label}
                <Icon d={ICONS.chevronRight} className="h-4 w-4 text-gray-400" />
              </a>
            ))}
            <div className="mt-2 border-t border-hairline px-2 pb-1 pt-3">
              <Link
                href="/login"
                className="flex w-full items-center justify-center rounded-xl border border-hairline px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                Sign In
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
