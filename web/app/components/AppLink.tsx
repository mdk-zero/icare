"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faMobileScreenButton, faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import { fetchAppLink, sendAppLink } from "../lib/api";
import { usePageData } from "../lib/use-page-data";
import { EcgLoader } from "./EcgLoader";
import { loadingToast, toast } from "./Toast";

/** Who the app link can go to: `signedIn` once they've used the app at all. */
export interface AppLinkStudent {
  id: string;
  name: string;
  signedIn: boolean;
}

const plural = (n: number) => `${n} student${n === 1 ? "" : "s"}`;
const NOT_SET_UP = "The download link isn't set up yet. Ask the iCARE++ team to add it.";

/** The link changes only with a redeploy, so one fetch serves every page for a while. */
function useAppLink() {
  const { data, loading } = usePageData("app-link", fetchAppLink, { freshFor: 30 * 60 * 1000 });
  return { url: data ?? null, loading };
}

/** The most the route takes in one request. */
const PER_REQUEST = 200;

/** Sends, toasting progress; true when at least one email went out. */
async function send(students: { id: string; name: string }[]): Promise<boolean> {
  const label = students.length === 1 ? students[0].name : plural(students.length);
  const progress = loadingToast(`Emailing the app link to ${label}…`);
  let sent = 0;
  const problems: string[] = [];
  for (let i = 0; i < students.length; i += PER_REQUEST) {
    if (i > 0) progress.update(`Emailing the app link… ${sent} of ${students.length}`, i / students.length);
    const result = await sendAppLink(students.slice(i, i + PER_REQUEST).map((s) => s.id));
    if ("error" in result) {
      // A refusal (no link, rate limit, provider down) holds for the rest too.
      problems.push(result.error);
      break;
    }
    sent += result.sent;
    if (result.warning) problems.push(result.warning);
  }
  if (sent === 0) {
    progress.error(problems[0] ?? "Unable to send the app link");
    return false;
  }
  const who = students.length === 1 ? students[0].name : plural(sent);
  if (problems.length) progress.error(`Emailed the app link to ${who}. ${problems.join(" ")}`, 8000);
  else progress.success(`Emailed the app link to ${who}`);
  return true;
}

/**
 * The app download link on an Instructor's or Dean's Students page: copy it
 * to share anywhere, or email it to the students in view (`scope` names them,
 * as in "in BSN 2A"). New students already get it in their welcome email.
 */
export function AppLinkCard({ students, scope }: { students: AppLinkStudent[]; scope: string }) {
  const { url, loading } = useAppLink();
  const [emailing, setEmailing] = useState(false);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast("Download link copied");
    } catch {
      toast("Couldn't copy the link. Select it and copy it instead.", "error");
    }
  };

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-4 shadow-tile sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
          <FontAwesomeIcon icon={faMobileScreenButton} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">iCARE++ mobile app</p>
          {loading ? (
            <p className="text-sm text-gray-400">Loading the download link…</p>
          ) : url ? (
            <p className="text-sm text-gray-500 [overflow-wrap:anywhere]">
              Students sign in on the Android app. Download link:{" "}
              <a href={url} className="font-medium text-brand-700 hover:underline">
                {url.replace(/^https?:\/\//, "")}
              </a>
            </p>
          ) : (
            <p className="text-sm text-gray-500">{NOT_SET_UP}</p>
          )}
        </div>
      </div>
      {url && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            onClick={copy}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-brand-300 hover:text-brand-700"
          >
            <FontAwesomeIcon icon={faCopy} className="h-3.5 w-3.5" />
            Copy link
          </button>
          <button
            onClick={() => setEmailing(true)}
            disabled={students.length === 0}
            title={students.length === 0 ? `No students ${scope} yet` : undefined}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faPaperPlane} className="h-3.5 w-3.5" />
            Email to students
          </button>
        </div>
      )}
      {emailing && <EmailAppLinkModal students={students} scope={scope} onClose={() => setEmailing(false)} />}
    </div>
  );
}

/** Picks who gets it: by default only those who've never signed in, as they're the ones without the app. */
function EmailAppLinkModal({
  students,
  scope,
  onClose,
}: {
  students: AppLinkStudent[];
  scope: string;
  onClose: () => void;
}) {
  const notSignedIn = students.filter((s) => !s.signedIn);
  const [who, setWho] = useState<"new" | "all">(notSignedIn.length > 0 ? "new" : "all");
  const [sending, setSending] = useState(false);
  const recipients = who === "new" ? notSignedIn : students;

  const submit = async () => {
    setSending(true);
    const ok = await send(recipients);
    setSending(false);
    if (ok) onClose();
  };

  const option = (value: "new" | "all", label: string, count: number) => (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
        who === value ? "border-brand-600 bg-brand-600/5" : "border-gray-200 hover:border-brand-300"
      } ${count === 0 ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        type="radio"
        name="app-link-recipients"
        checked={who === value}
        disabled={count === 0 || sending}
        onChange={() => setWho(value)}
        className="h-4 w-4 accent-brand-600"
      />
      <span className="flex-1 text-gray-700">{label}</span>
      <span className="text-gray-500">{plural(count)}</span>
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={sending ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-link-title"
        className="w-full max-w-md overflow-hidden rounded-xl border border-hairline bg-surface p-5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="app-link-title" className="font-display text-lg font-semibold text-gray-900">
          Email the app link
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Each student {scope} gets their own email with the download link and how to install the app.
        </p>
        <div className="mt-4 space-y-2">
          {option("new", "Haven't signed in yet", notSignedIn.length)}
          {option("all", "Everyone", students.length)}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-lg border border-gray-200 bg-surface px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={sending || recipients.length === 0}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-700 disabled:opacity-50"
          >
            {sending ? <EcgLoader /> : <FontAwesomeIcon icon={faPaperPlane} className="h-3.5 w-3.5" />}
            {sending ? "Sending…" : `Send to ${plural(recipients.length)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One student's "send the app link again", for their detail page. */
export function SendAppLinkButton({ student }: { student: { id: string; name: string } }) {
  const { url, loading } = useAppLink();
  const [sending, setSending] = useState(false);

  return (
    <button
      onClick={async () => {
        setSending(true);
        await send([student]);
        setSending(false);
      }}
      disabled={!url || sending}
      title={loading ? undefined : url ? `Email ${student.name} the app download link` : NOT_SET_UP}
      className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-surface px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <FontAwesomeIcon icon={faPaperPlane} className="h-3.5 w-3.5" />
      Send app link
    </button>
  );
}
