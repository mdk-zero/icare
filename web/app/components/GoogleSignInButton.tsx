"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

let gsiLoaded = false;

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

interface Props {
  onSuccess: (response: { credential: string }) => void;
  onError: () => void;
  width: number;
}

export default function GoogleSignInButton({ onSuccess, onError, width }: Props) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(gsiLoaded);
  const onSuccessRef = useRef(onSuccess);

  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    if (!gsiLoaded) {
      gsiLoaded = true;
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        window.google!.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            onSuccessRef.current(response);
          },
        });
        setReady(true);
      };
      script.onerror = () => {
        onError();
      };
      document.head.appendChild(script);
    } else if (window.google) {
      setReady(true);
    }
  }, [onError]);

  useEffect(() => {
    if (ready && buttonRef.current && window.google) {
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        logo_alignment: "left",
        width,
      });
    }
  }, [ready, width]);

  return <div ref={buttonRef} />;
}
