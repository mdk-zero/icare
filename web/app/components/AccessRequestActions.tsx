"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faUserPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { AccessRequestInfo, resolveAccessRequest } from "../lib/api";
import { markRead, refreshNotifications } from "../lib/notifications-live";
import { GoogleGlyph } from "./GoogleSignInButton";

/**
 * Opens the Users page with the create form filled in from a request, as
 * Accept does. Clicking the notification itself goes the same way.
 */
export function useOpenAccessRequest() {
  const router = useRouter();
  return (notificationId: string, request: AccessRequestInfo) => {
    void markRead(notificationId);
    const query = new URLSearchParams({ request: request.id, name: request.name, email: request.email });
    if (request.sex) query.set("sex", request.sex);
    if (request.google_linked) query.set("google", "1");
    router.push(`/super-admin/users?${query}`);
  };
}

/**
 * Accept / Decline on a sign-up page account request. Accept opens the Users
 * page with the create form filled in; the request is marked accepted only
 * once that account is saved. Decline settles it here and emails the requester.
 */
export default function AccessRequestActions({
  notificationId,
  request,
  onNavigate,
}: {
  notificationId: string;
  request: AccessRequestInfo;
  /** Called before Accept routes away, e.g. to close the bell's popup. */
  onNavigate?: () => void;
}) {
  const openRequest = useOpenAccessRequest();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (request.status !== "pending") {
    const accepted = request.status === "accepted";
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
          accepted
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "bg-foreground/8 text-foreground/55"
        }`}
      >
        <FontAwesomeIcon icon={accepted ? faCheck : faXmark} className="h-3 w-3" />
        {accepted ? "Accepted" : "Declined"}
        {request.resolved_by_name ? ` by ${request.resolved_by_name}` : ""}
      </span>
    );
  }

  const accept = () => {
    onNavigate?.();
    openRequest(notificationId, request);
  };

  const decline = async () => {
    if (!window.confirm(`Decline ${request.name}'s account request? They will be emailed that it was declined.`)) {
      return;
    }
    setBusy(true);
    setError("");
    const result = await resolveAccessRequest(request.id, "declined");
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Could not decline the request");
    // The stream delivers the settled copy too; this covers a stalled one.
    void refreshNotifications();
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {request.google_linked && (
        <span
          title="Sent with Continue with Google; the new account will sign in with that Google account"
          className="inline-flex items-center gap-1 rounded-full border border-hairline bg-subtle px-2.5 py-1 text-xs font-medium text-foreground/65"
        >
          <GoogleGlyph className="h-3 w-3" />
          Google
        </span>
      )}
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
      >
        <FontAwesomeIcon icon={faUserPlus} className="h-3 w-3" />
        Accept
      </button>
      <button
        type="button"
        onClick={decline}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-subtle px-3 py-1 text-xs font-semibold text-foreground/65 transition-colors hover:border-red-500/40 hover:text-red-600 disabled:opacity-50"
      >
        <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
        {busy ? "Declining…" : "Decline"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
