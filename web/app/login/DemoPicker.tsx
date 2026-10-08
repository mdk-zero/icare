"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuildingColumns,
  faChalkboardUser,
  faChevronRight,
  faUserShield,
  faXmark,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { EcgLoader } from "../components/EcgLoader";
import { demoHome, startDemo, type DemoRole } from "../lib/demo/session";
import { DEMO_VIEWERS, seedPeople } from "../lib/demo/fixtures/people";

const ROLES: { role: DemoRole; label: string; description: string; icon: IconDefinition }[] = [
  {
    role: "faculty",
    label: "Instructor",
    description: "Groups, patient cases, quizzes, shifts and grading",
    icon: faChalkboardUser,
  },
  {
    role: "admin",
    label: "Dean",
    description: "Instructors, students, wards and school-wide analytics",
    icon: faBuildingColumns,
  },
];

/**
 * Picks the role a demo signs in as. The demo runs on sample data held in the
 * browser: nothing is read from or written to the real database, and every
 * change is dropped at logout.
 */
export default function DemoPicker({ onClose }: { onClose: () => void }) {
  const [starting, setStarting] = useState<DemoRole | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !starting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, starting]);

  const start = (role: DemoRole) => {
    setStarting(role);
    const user = seedPeople().users.find((u) => u.id === DEMO_VIEWERS[role])!;
    startDemo(role, {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      picture_url: user.picture_url,
      sex: user.sex,
      has_password: true,
      google_linked: false,
      force_password_change: false,
    });
    // A full load, so the portal starts with empty caches and the demo's fetch routing on.
    window.location.assign(demoHome(role));
  };

  // Portalled: the login card animates in with a transform, which would
  // otherwise trap this fixed overlay inside the card. Re-entering
  // .auth-screen keeps the auth palette (and its light-mode remapping).
  return createPortal(
    <div
      className="auth-screen fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={() => !starting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-title"
        className="w-full max-w-[420px] rounded-3xl border border-white/20 bg-(--auth-bg-2) p-6 shadow-2xl shadow-black/50 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="demo-title" className="text-xl font-semibold tracking-tight text-white">
              Try iCARE++
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-white/55">
              Pick a role to explore. It runs on sample data — change anything you like; it all
              resets when you log out.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={starting !== null}
            aria-label="Close"
            className="-mr-1 -mt-1 flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        </div>

        <ul className="space-y-2.5">
          {ROLES.map(({ role, label, description, icon }) => (
            <li key={role}>
              <button
                type="button"
                onClick={() => start(role)}
                disabled={starting !== null}
                className="group flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition-all duration-200 hover:border-(--auth-accent)/60 hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--auth-accent)/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-(--auth-accent)">
                  <FontAwesomeIcon icon={icon} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-tight text-white">{label}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-white/55">
                    {description}
                  </span>
                </span>
                {starting === role ? (
                  <EcgLoader className="text-(--auth-accent)" />
                ) : (
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className="h-3.5 w-3.5 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
