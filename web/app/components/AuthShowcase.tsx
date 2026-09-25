"use client";

import { useEffect, useState } from "react";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBandage,
  faCapsules,
  faDroplet,
  faHeartPulse,
  faLungs,
  faNotesMedical,
  faPills,
  faStethoscope,
  faSyringe,
  faTemperatureHalf,
  faUserNurse,
  faVial,
} from "@fortawesome/free-solid-svg-icons";

/*
 * The moving parts of the login and contact screens' brand panel. The form
 * card and the gradient behind it are deliberately untouched; everything here
 * layers onto the panel, and all of it stands still
 * under prefers-reduced-motion (CSS via globals.css, the timers via useTicking).
 */

function useTicking(ms: number, onTick: () => void) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(onTick, ms);
    return () => window.clearInterval(id);
    // onTick is a state setter wrapper; re-subscribing on each render would reset the cadence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
}

/** Cycles the last words of a headline; screen readers get the first one only. */
export function RotatingWords({ words, interval = 2600 }: { words: string[]; interval?: number }) {
  const [index, setIndex] = useState(0);
  useTicking(interval, () => setIndex((i) => (i + 1) % words.length));

  return (
    <span className="relative inline-block">
      <span className="sr-only">{words[0]}</span>
      <span
        key={index}
        aria-hidden
        className="auth-word inline-block bg-gradient-to-r from-[#7DD3D8] via-white to-[#7DD3D8] bg-[length:200%_100%] bg-clip-text text-transparent"
      >
        {words[index]}
      </span>
    </span>
  );
}

/*
 * A nurse's kit drifting up the backdrop. Each icon rises on the outer element
 * and sways on the inner one, at unrelated periods so no two move in step;
 * smaller ones are dimmer and softened so they read as further away. Values are
 * fixed, not random, so the server and client render the same markup.
 */
const DRIFTERS: {
  icon: IconDefinition;
  left: string;
  size: number;
  rise: number;
  sway: number;
  delay: number;
}[] = [
  { icon: faStethoscope, left: "4%", size: 45, rise: 26, sway: 7, delay: -3 },
  { icon: faPills, left: "13%", size: 21, rise: 21, sway: 5, delay: -14 },
  { icon: faHeartPulse, left: "22%", size: 33, rise: 29, sway: 8, delay: -20 },
  { icon: faSyringe, left: "31%", size: 18, rise: 19, sway: 4.5, delay: -7 },
  { icon: faLungs, left: "39%", size: 39, rise: 32, sway: 9, delay: -12 },
  { icon: faDroplet, left: "47%", size: 16, rise: 18, sway: 4, delay: -1 },
  { icon: faTemperatureHalf, left: "55%", size: 27, rise: 24, sway: 6, delay: -17 },
  { icon: faVial, left: "63%", size: 20, rise: 22, sway: 5.5, delay: -9 },
  { icon: faNotesMedical, left: "71%", size: 36, rise: 30, sway: 8.5, delay: -24 },
  { icon: faCapsules, left: "79%", size: 22, rise: 23, sway: 5, delay: -5 },
  { icon: faUserNurse, left: "87%", size: 30, rise: 27, sway: 7.5, delay: -15 },
  { icon: faBandage, left: "94%", size: 18, rise: 20, sway: 4.5, delay: -11 },
];

/*
 * Kept beside the component rather than in globals.css, as Shell does with its
 * styles: the rules only matter where this renders. The global reduced-motion
 * block still stills them.
 */
const driftStyles = `
.auth-drift { animation: authDrift linear infinite; }
@keyframes authDrift {
  from { transform: translate3d(0, 12vh, 0); opacity: 0; }
  12%, 85% { opacity: 1; }
  to { transform: translate3d(0, -110vh, 0); opacity: 0; }
}
.auth-sway { animation: authSway ease-in-out infinite alternate; }
@keyframes authSway {
  from { transform: translateX(-14px) rotate(-14deg); }
  to { transform: translateX(14px) rotate(14deg); }
}
`;

export function DriftingKit() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{driftStyles}</style>
      {DRIFTERS.map((d) => {
        // 16px → far (dim, soft), 45px → near (brighter, crisp).
        const depth = (d.size - 16) / 29;
        return (
          <div
            key={d.left}
            className="auth-drift absolute bottom-0"
            style={{ left: d.left, animationDuration: `${d.rise}s`, animationDelay: `${d.delay}s` }}
          >
            <div
              className="auth-sway"
              style={{
                animationDuration: `${d.sway}s`,
                animationDelay: `${d.delay / 3}s`,
                opacity: 0.1 + depth * 0.14,
                filter: `blur(${((1 - depth) * 1.4).toFixed(2)}px)`,
              }}
            >
              <FontAwesomeIcon
                icon={d.icon}
                style={{ width: d.size, height: d.size, color: "#7DD3D8" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
