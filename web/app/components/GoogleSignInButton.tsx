"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: {
              theme?: string;
              size?: string;
              shape?: string;
              text?: string;
              logo_alignment?: string;
              width?: number;
            },
          ) => void;
        };
      };
    };
  }
}

/** One shared load across every mount, so the script is never injected twice. */
let gsiPromise: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiPromise) {
    gsiPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gsiPromise = null; // let a later mount retry
        reject(new Error("Failed to load Google Identity Services"));
      };
      document.head.appendChild(script);
    });
  }
  return gsiPromise;
}

/** Google's brand mark — a logo, so it stays an inline SVG rather than an icon. */
export function GoogleGlyph({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

interface Props {
  onSuccess: (response: { credential: string }) => void;
  onError: () => void;
  /** Width handed to Google's renderButton; also the fallback button's width. */
  width?: number;
  /** Classes for the visible button — this is the whole point: style it freely. */
  className?: string;
  /** Defaults to the Google mark + "Continue with Google". */
  children?: ReactNode;
  /** Only seen if the overlay falls back to Google's own button. */
  theme?: "outline" | "filled_blue" | "filled_black";
}

/**
 * A Google sign-in control you can style like any other button.
 *
 * Google's `renderButton` owns its own markup and allows only a handful of
 * preset themes, so instead of styling it we render it invisibly and put our
 * own button on top, forwarding the click. The real button still receives the
 * event, so this stays the standard ID-token flow — no change to
 * /api/auth/google and no client secret needed.
 *
 * If Google ever changes that markup and the click target can't be found, the
 * component reveals the genuine button rather than leaving a dead control.
 */
export default function GoogleSignInButton({
  onSuccess,
  onError,
  width = 400,
  className,
  children,
  theme = "outline",
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [showNative, setShowNative] = useState(false);

  // Kept in refs so re-renders of the parent never re-run the load effect.
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;

    loadGsi()
      .then(() => {
        if (cancelled || !hostRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => onSuccessRef.current(response),
        });
        // renderButton appends; clear so a width/theme change doesn't stack.
        hostRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(hostRef.current, {
          theme,
          size: "large",
          shape: "rectangular",
          text: "continue_with",
          logo_alignment: "left",
          width,
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current();
      });

    return () => {
      cancelled = true;
    };
  }, [width, theme]);

  const handleClick = useCallback(() => {
    const target =
      hostRef.current?.querySelector<HTMLElement>('[role="button"]') ??
      hostRef.current?.querySelector<HTMLElement>("div[tabindex]");
    if (target) {
      // Dispatched inside a real user gesture, so Google's popup isn't blocked.
      target.click();
      return;
    }
    setShowNative(true);
  }, []);

  return (
    <div className="relative w-full">
      <div
        ref={hostRef}
        aria-hidden={!showNative}
        className={
          showNative
            ? "flex w-full justify-center"
            : // Laid out (Google won't render into a display:none host) but
              // invisible and out of the way of real pointer events.
              "pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-0"
        }
      />
      {!showNative && (
        <button type="button" onClick={handleClick} disabled={!ready} className={className}>
          {children ?? (
            <>
              <GoogleGlyph />
              Continue with Google
            </>
          )}
        </button>
      )}
    </div>
  );
}
