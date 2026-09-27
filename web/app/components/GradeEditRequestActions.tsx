"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { GradeEditRequestInfo, resolveGradeEditRequest } from "../lib/api";
import { refreshNotifications } from "../lib/notifications-live";

/**
 * Accept / Decline on a faculty member's request to change a saved scenario
 * grade, with the reason they gave. Either answer settles every admin's copy
 * and tells the faculty member.
 */
export default function GradeEditRequestActions({
  request,
  compact = false,
}: {
  request: GradeEditRequestInfo;
  /** The bell's popup: clamp the reason to a few lines. */
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState("");

  const reason = request.reason && (
    <p
      className={`mb-2 border-l-2 border-hairline pl-2.5 text-xs italic leading-relaxed text-foreground/60 ${
        compact ? "line-clamp-3" : ""
      }`}
    >
      &ldquo;{request.reason}&rdquo;
    </p>
  );

  if (request.status !== "pending") {
    const accepted = request.status === "accepted";
    return (
      <div>
        {reason}
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
      </div>
    );
  }

  const resolve = async (status: "accepted" | "declined") => {
    const question =
      status === "accepted"
        ? `Let ${request.faculty_name} change ${request.student_name}'s grade on "${request.scenario_title}"?`
        : `Decline ${request.faculty_name}'s request to change ${request.student_name}'s grade?`;
    if (!window.confirm(question)) return;
    setBusy(status);
    setError("");
    const result = await resolveGradeEditRequest(request.id, status);
    setBusy(null);
    if (!result.ok) setError(result.error ?? "Could not update the request");
    // The stream delivers the settled copy too; this covers a stalled one.
    void refreshNotifications();
  };

  return (
    <div>
      {reason}
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => resolve("accepted")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
          {busy === "accepted" ? "Accepting…" : "Accept"}
        </button>
        <button
          type="button"
          onClick={() => resolve("declined")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-subtle px-3 py-1 text-xs font-semibold text-foreground/65 transition-colors hover:border-red-500/40 hover:text-red-600 disabled:opacity-50"
        >
          <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
          {busy === "declined" ? "Declining…" : "Decline"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </span>
    </div>
  );
}
