"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faCopy,
  faEnvelope,
  faGlobe,
  faTriangleExclamation,
  faUserCheck,
} from "@fortawesome/free-solid-svg-icons";
import { apiFetch } from "@/app/lib/api";
import { usePageData } from "@/app/lib/use-page-data";
import { STUDENT_WEB_PATH, STUDENT_WEB_SESSION_DAYS, type StudentWebSummary } from "@/app/lib/student-web";
import PageHeader from "../../components/PageHeader";
import ConfirmModal from "../../components/ConfirmModal";
import { EcgLoader } from "../../components/EcgLoader";
import { SkeletonText } from "../../components/skeletons";
import { toast } from "../../components/Toast";
import { CARD, StatusText } from "../ui";

function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const students = (n: number) => `${n.toLocaleString()} ${n === 1 ? "student" : "students"}`;

/**
 * Whether the web app's files are on this site. They're published from
 * mobile/ (scripts/publish-web.mjs) and deployed with the portal, so a fresh
 * checkout may not have them yet.
 */
function usePublished(): boolean | null {
  const [published, setPublished] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${STUDENT_WEB_PATH}/index.html`, { method: "HEAD", cache: "no-store" })
      .then((res) => !cancelled && setPublished(res.ok))
      .catch(() => !cancelled && setPublished(null));
    return () => {
      cancelled = true;
    };
  }, []);
  return published;
}

export default function StudentWebClient() {
  const data = usePageData("super-admin:student-web", async () => {
    const res = await apiFetch("/api/super-admin/student-web");
    if (!res.ok) throw new Error("Unable to load the web version settings");
    return (await res.json()) as StudentWebSummary;
  });
  const summary = data.data;
  const published = usePublished();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window only exists after mount
    setOrigin(window.location.origin);
  }, []);
  const address = `${origin}${STUDENT_WEB_PATH}`;
  const on = summary?.on ?? false;

  const change = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch("/api/super-admin/student-web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: !on }),
      });
      const body = (await res.json().catch(() => ({}))) as StudentWebSummary & { error?: string };
      if (!res.ok) {
        setSaveError(body.error || "The setting could not be changed.");
        return;
      }
      setConfirming(false);
      data.setData(body);
      toast(body.on ? "The web version is on." : "The web version is off.");
    } catch {
      setSaveError("The setting could not be changed.");
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast("Address copied.");
    } catch {
      toast("Couldn't copy. Select the address and copy it instead.", "error");
    }
  };

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faGlobe} />, label: "Student Web App" }}
        title="Student Web App"
        subtitle="A backup for students who can't install the mobile app, such as iPhone users. It's the same app, opened in a browser. Turn it on when students need it and off when they don't."
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-4">
          {published === false && (
            <div className="flex gap-3 rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-900">
              <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                The web version isn&apos;t published on this site yet, so students would find nothing at its address.
                Run <code className="font-mono text-xs">node scripts/publish-web.mjs</code> in{" "}
                <code className="font-mono text-xs">mobile/</code>, then commit and deploy.
              </p>
            </div>
          )}

          <section className={`${CARD} overflow-hidden`} aria-label="Web version switch">
            <div className="flex items-start gap-4 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-600/10 text-brand-600">
                <FontAwesomeIcon icon={faGlobe} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-gray-900">
                      Web version for students
                    </h2>
                    {data.loading ? (
                      <SkeletonText className="mt-1.5 h-3.5 w-16" />
                    ) : (
                      <StatusText tone={on ? "good" : "idle"} className="mt-0.5 text-sm font-medium">
                        {on ? "On" : "Off"}
                      </StatusText>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={data.loading || !summary}
                    onClick={() => {
                      setSaveError(null);
                      setConfirming(true);
                    }}
                    className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                      on
                        ? "border border-gray-200 bg-surface text-gray-800 hover:bg-subtle"
                        : "bg-brand-600 text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] hover:bg-brand-700"
                    }`}
                  >
                    {on ? "Turn Off" : "Turn On"}
                  </button>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  {on
                    ? "Students can sign in at the address below with their usual account. Browsers can't get push notifications, so each notification is also emailed to students signed in on the web, unless they turn that off in their Settings."
                    : "Nobody can sign in on the web. Turning it on lets students use the app from a browser with their usual account, and emails them their notifications while they're signed in there."}
                </p>
              </div>
            </div>

            <div className="border-t border-hairline bg-subtle px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">Address</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-hairline bg-surface px-3 py-2 font-mono text-sm text-gray-800">
                  {address || STUDENT_WEB_PATH}
                </code>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <FontAwesomeIcon icon={faCopy} className="h-3.5 w-3.5" />
                  Copy
                </button>
                <a
                  href={STUDENT_WEB_PATH}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5" />
                  Open
                </a>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-gray-500">
                While it&apos;s on, iPhones that open the app download link are offered this address instead.
              </p>
            </div>
          </section>

          <section className={`${CARD} grid grid-cols-1 divide-y divide-hairline sm:grid-cols-2 sm:divide-x sm:divide-y-0`} aria-label="Usage">
            <div className="flex items-start gap-3 p-5">
              <FontAwesomeIcon icon={faUserCheck} className="mt-1 h-4 w-4 text-brand-600" />
              <div>
                <p className="text-sm text-gray-500">Signed in on the web</p>
                {data.loading ? (
                  <SkeletonText className="mt-1.5 h-6 w-20" />
                ) : (
                  <p className="font-display text-2xl font-semibold tabular-nums text-gray-900">
                    {students(summary?.signedIn ?? 0)}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-gray-500">In the last {STUDENT_WEB_SESSION_DAYS} days</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-5">
              <FontAwesomeIcon icon={faEnvelope} className="mt-1 h-4 w-4 text-brand-600" />
              <div>
                <p className="text-sm text-gray-500">Getting notifications by email</p>
                {data.loading ? (
                  <SkeletonText className="mt-1.5 h-6 w-20" />
                ) : (
                  <p className="font-display text-2xl font-semibold tabular-nums text-gray-900">
                    {students(summary?.emailed ?? 0)}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-gray-500">{on ? "Of those signed in" : "None while it's off"}</p>
              </div>
            </div>
          </section>
        </div>

        <section aria-label="Switch history" className={`${CARD} overflow-hidden`}>
          <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">History</h2>
            {data.revalidating && <EcgLoader />}
          </header>
          {data.loading ? (
            <ul className="divide-y divide-hairline">
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="space-y-2 px-4 py-3.5">
                  <SkeletonText className="h-3.5 w-32" />
                  <SkeletonText className="h-3 w-44" />
                </li>
              ))}
            </ul>
          ) : data.error && !summary ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">The history couldn&apos;t be loaded.</p>
          ) : !summary || summary.history.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-gray-500">
              It has never been turned on. Each time it&apos;s turned on or off, it shows here.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {summary.history.map((change) => (
                <li key={change.at} className="px-4 py-3">
                  <StatusText tone={change.on ? "good" : "idle"} className="text-sm font-medium">
                    {change.on ? "Turned on" : "Turned off"}
                  </StatusText>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {stamp(change.at)}
                    {change.by ? ` · ${change.by}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {confirming && (
        <ConfirmModal
          config={{
            title: on ? "Turn off the web version?" : "Turn on the web version?",
            message: on
              ? "Students signed in on the web are signed out the next time they tap anything, and nobody can sign in there until it's turned on again. Their work is kept, and the mobile app isn't affected."
              : `Students can then sign in at ${address || STUDENT_WEB_PATH} with their usual account, and those signed in there get their notifications by email.`,
            confirmLabel: on ? "Turn Off" : "Turn On",
            danger: on,
            loading: saving,
            error: saveError,
            onConfirm: () => void change(),
          }}
          onClose={() => {
            if (!saving) setConfirming(false);
          }}
        />
      )}
    </div>
  );
}
