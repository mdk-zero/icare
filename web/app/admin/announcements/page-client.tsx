"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBullhorn,
  faChevronDown,
  faEnvelope,
  faMagnifyingGlass,
  faPaperPlane,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { apiFetch } from "@/app/lib/api";
import { refreshNotifications } from "@/app/lib/notifications-live";
import { usePageData } from "@/app/lib/use-page-data";
import { roleLabel } from "@/app/lib/role-labels";
import {
  ANNOUNCEMENT_MAX_PICKED,
  ANNOUNCEMENT_MESSAGE_LIMIT,
  ANNOUNCEMENT_TITLE_LIMIT,
  AUDIENCE_ROLES,
  describeAudience,
  type AnnouncementAudience,
  type AnnouncementSummary,
  type AudienceRole,
} from "@/app/lib/announcements";
import PageHeader from "../../components/PageHeader";
import Avatar from "../../components/Avatar";
import ConfirmModal from "../../components/ConfirmModal";
import { EcgLoader } from "../../components/EcgLoader";
import { SkeletonText } from "../../components/skeletons";
import { toast } from "../../components/Toast";
import { CARD } from "../ui";

interface Account {
  id: string;
  name: string;
  email: string;
  role: AudienceRole;
  admin_title?: string | null;
  picture_url: string | null;
  sex: "male" | "female" | null;
  section_name: string | null;
  institution_name?: string | null;
}

/** The Users page's payload, read under the same cache key; only the accounts matter here. */
interface AccountsPayload {
  users: Account[];
  sections: unknown[];
  owner_enabled: boolean;
}

interface SendResult {
  error?: string;
  recipients?: number;
  notified?: number;
  emailed?: number | null;
  email_error?: string;
  /** The demo says it emailed nobody. */
  notice?: string;
}

type Mode = AnnouncementAudience["kind"];

const MODES: { value: Mode; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "roles", label: "By Role" },
  { value: "users", label: "Specific People" },
];

const ROLE_PILL: Record<AudienceRole, string> = {
  student: "bg-brand-600/10 text-brand-700",
  faculty: "bg-blue-500/10 text-blue-700",
  admin: "bg-amber-500/10 text-amber-700",
  super_admin: "bg-purple-500/10 text-purple-700",
};

/** How many matches the picker lists before asking for a narrower search. */
const LIST_CAP = 100;

const EMPTY: AccountsPayload = { users: [], sections: [], owner_enabled: false };

const INPUT =
  "w-full rounded-lg border border-gray-200 bg-surface px-3 py-2.5 text-sm text-gray-800 transition-all focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";
const LABEL = "text-sm font-medium text-gray-700";

const people = (n: number) => `${n.toLocaleString()} ${n === 1 ? "person" : "people"}`;

function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  const date = d.toLocaleDateString(
    [],
    d.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric" },
  );
  return `${date} · ${time}`;
}

function Counter({ value, limit }: { value: number; limit: number }) {
  return (
    <span className={`font-mono text-[11px] tabular-nums ${value > limit * 0.9 ? "text-amber-600" : "text-gray-400"}`}>
      {value}/{limit}
    </span>
  );
}

/** Search every account and tick the ones to send to; the picks stay as chips above. */
function PeoplePicker({
  accounts,
  loading,
  picked,
  onChange,
}: {
  accounts: Account[];
  loading: boolean;
  picked: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<AudienceRole | "">("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts
      .filter((a) => !role || a.role === role)
      .filter(
        (a) =>
          !q ||
          [a.name, a.email, a.section_name, a.institution_name].some((v) => v?.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts, query, role]);
  const shown = matches.slice(0, LIST_CAP);
  const chosen = useMemo(
    () => accounts.filter((a) => picked.has(a.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [accounts, picked],
  );
  const filtered = query.trim() !== "" || role !== "";
  const unpickedMatches = matches.filter((a) => !picked.has(a.id));

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const addMatches = () => {
    const next = new Set(picked);
    for (const a of unpickedMatches) next.add(a.id);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {chosen.length > 0 && (
        <div className="rounded-lg border border-hairline bg-subtle p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
            <span className="text-xs font-semibold text-gray-600">{people(chosen.length)} picked</span>
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="cursor-pointer text-xs font-medium text-brand-600 hover:underline"
            >
              Clear All
            </button>
          </div>
          <ul className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto" aria-label="Picked people">
            {chosen.map((a) => (
              <li
                key={a.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface py-0.5 pl-2.5 pr-1 text-xs text-gray-700 ring-1 ring-hairline"
              >
                <span className="truncate">{a.name}</span>
                <button
                  type="button"
                  onClick={() => toggle(a.id)}
                  aria-label={`Remove ${a.name}`}
                  className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, section or institution"
            aria-label="Search people"
            className={`${INPUT} pl-9`}
          />
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AudienceRole | "")}
          aria-label="Filter by role"
          className={`${INPUT} sm:w-56`}
        >
          <option value="">All roles</option>
          {AUDIENCE_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-hairline">
        <div className="flex items-center justify-between gap-2 border-b border-hairline bg-subtle px-3 py-2 text-xs text-gray-500">
          <span>
            {loading
              ? "Loading accounts…"
              : matches.length > LIST_CAP
                ? `Showing ${LIST_CAP} of ${matches.length.toLocaleString()}. Search to narrow it down.`
                : filtered
                  ? `${matches.length.toLocaleString()} ${matches.length === 1 ? "match" : "matches"}`
                  : people(matches.length)}
          </span>
          {filtered && unpickedMatches.length > 0 && (
            <button
              type="button"
              onClick={addMatches}
              disabled={picked.size + unpickedMatches.length > ANNOUNCEMENT_MAX_PICKED}
              className="shrink-0 cursor-pointer font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
            >
              Pick All {unpickedMatches.length.toLocaleString()}
            </button>
          )}
        </div>
        <ul className="max-h-80 divide-y divide-hairline overflow-y-auto" aria-label="People">
          {loading
            ? Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <SkeletonText className="h-4 w-4" />
                  <SkeletonText className="h-8 w-8 rounded-full" />
                  <span className="flex-1 space-y-1.5">
                    <SkeletonText className="h-3.5 w-32" />
                    <SkeletonText className="h-3 w-44" />
                  </span>
                </li>
              ))
            : shown.map((a) => {
                const on = picked.has(a.id);
                return (
                  <li key={a.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50 ${on ? "bg-brand-600/[0.04]" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(a.id)}
                        disabled={!on && picked.size >= ANNOUNCEMENT_MAX_PICKED}
                        className="h-4 w-4 shrink-0 rounded border-gray-300 accent-brand-600"
                      />
                      <Avatar name={a.name} src={a.picture_url} userId={a.id} sex={a.sex} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900">{a.name}</span>
                        <span className="block truncate text-xs text-gray-500">
                          {a.email}
                          {a.section_name ? ` · ${a.section_name}` : ""}
                        </span>
                      </span>
                      <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline ${ROLE_PILL[a.role] ?? ""}`}>
                        {roleLabel(a.role, a.admin_title)}
                      </span>
                    </label>
                  </li>
                );
              })}
          {!loading && shown.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-gray-500">Nobody matches that search.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function HistoryItem({ item }: { item: AnnouncementSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600/50"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{item.title}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-gray-400">{stamp(item.sent_at)}</span>
          </span>
          <span className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-gray-500">
            {/* A pick of people is already named by its count. */}
            {item.audience_kind !== "users" && item.audience && (
              <>
                <span>{item.audience}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span>{people(item.recipients)}</span>
            {item.read !== null && (
              <>
                <span aria-hidden>·</span>
                <span>Read by {item.read.toLocaleString()}</span>
              </>
            )}
            {item.emailed !== null && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <FontAwesomeIcon icon={faEnvelope} className="h-2.5 w-2.5" />
                  {item.emailed === item.recipients ? "Emailed" : `Emailed ${item.emailed.toLocaleString()}`}
                </span>
              </>
            )}
          </span>
        </span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`mt-1 h-3 w-3 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="whitespace-pre-wrap rounded-lg border border-hairline bg-subtle p-3 text-sm leading-relaxed text-gray-800 [overflow-wrap:anywhere]">
            {item.message}
          </p>
          {item.by_name && <p className="mt-2 text-xs text-gray-500">Sent by {item.by_name}</p>}
        </div>
      )}
    </li>
  );
}

/**
 * The Admin's announcements: a message to everyone in iCARE++, to whole
 * roles, or to chosen people. It lands in their notifications (and on their
 * phone), and by email when asked.
 */
export default function AnnouncementsClient({ contactEmail }: { contactEmail: string }) {
  const [mode, setMode] = useState<Mode>("all");
  const [roles, setRoles] = useState<Set<AudienceRole>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [withEmail, setWithEmail] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const accountsData = usePageData("super-admin:users", async () => {
    const res = await apiFetch("/api/super-admin/users");
    if (!res.ok) return EMPTY;
    return (await res.json()) as AccountsPayload;
  });
  const accounts = useMemo(() => accountsData.data?.users ?? [], [accountsData.data]);

  const history = usePageData("super-admin:announcements", async () => {
    const res = await apiFetch("/api/super-admin/announcements");
    if (!res.ok) throw new Error("Unable to load announcements");
    return (await res.json()) as { announcements: AnnouncementSummary[] };
  });
  const sent = history.data?.announcements ?? [];

  const roleCounts = useMemo(() => {
    const counts = Object.fromEntries(AUDIENCE_ROLES.map((r) => [r.value, 0])) as Record<AudienceRole, number>;
    for (const a of accounts) if (a.role in counts) counts[a.role] += 1;
    return counts;
  }, [accounts]);

  const audience: AnnouncementAudience =
    mode === "all"
      ? { kind: "all" }
      : mode === "roles"
        ? { kind: "roles", roles: AUDIENCE_ROLES.map((r) => r.value).filter((r) => roles.has(r)) }
        : { kind: "users", user_ids: [...picked] };
  const recipientCount =
    mode === "all"
      ? accounts.length
      : mode === "roles"
        ? accounts.filter((a) => roles.has(a.role)).length
        : accounts.filter((a) => picked.has(a.id)).length;

  const ready = title.trim() !== "" && message.trim() !== "" && recipientCount > 0;
  const missing =
    recipientCount === 0
      ? mode === "roles"
        ? "Pick at least one role."
        : mode === "users"
          ? "Pick at least one person."
          : null
      : !title.trim()
        ? "Add a title."
        : !message.trim()
          ? "Write the message."
          : null;

  const toggleRole = (role: AudienceRole) =>
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });

  const send = async () => {
    setSending(true);
    setSendError(null);
    try {
      const res = await apiFetch("/api/super-admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message, audience, email: withEmail }),
      });
      const body = (await res.json().catch(() => ({}))) as SendResult;
      if (!res.ok) {
        setSendError(body.error || "The announcement could not be sent.");
        return;
      }
      setConfirming(false);
      setTitle("");
      setMessage("");
      setPicked(new Set());
      setRoles(new Set());

      const notified = body.notified ?? 0;
      const total = body.recipients ?? notified;
      if (notified < total) {
        toast(`Only ${people(notified)} of ${total.toLocaleString()} got it. Check the Activity Log before sending again.`, "error", 9000);
      } else if (body.emailed == null) {
        toast(`Sent to ${people(notified)}.`);
      } else if (body.notice) {
        toast(`Sent to ${people(notified)}. ${body.notice}`);
      } else if (body.email_error || body.emailed < notified) {
        toast(
          `Sent to ${people(notified)}, but only ${body.emailed.toLocaleString()} of the emails went out.` +
            (body.email_error ? ` ${body.email_error}` : ""),
          "error",
          9000,
        );
      } else {
        toast(`Sent to ${people(notified)} and emailed.`);
      }
      void history.refresh();
      // The sender may be one of the recipients.
      void refreshNotifications();
    } catch {
      setSendError("The announcement could not be sent.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faBullhorn} />, label: "Announcements" }}
        title="Announcements"
        subtitle="Send a message to everyone in iCARE++, to whole roles, or to the people you pick. It arrives in their notifications and on their phone, and by email if you choose."
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <form
          className={`${CARD} overflow-hidden`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready || sending) return;
            setSendError(null);
            setConfirming(true);
          }}
        >
          <div className="space-y-3 border-b border-hairline p-5">
            <p id="announcement-audience" className={LABEL}>
              Send to
            </p>
            <div
              role="radiogroup"
              aria-labelledby="announcement-audience"
              className="inline-flex w-full flex-wrap gap-0.5 rounded-xl border border-hairline bg-subtle p-1 sm:w-auto"
            >
              {MODES.map((m) => {
                const active = mode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMode(m.value)}
                    className={`flex-1 cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50 sm:flex-none ${
                      active ? "bg-brand-600 text-white" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {mode === "all" && (
              <p className="text-sm text-gray-600">
                {accountsData.loading ? (
                  <SkeletonText className="h-4 w-64" />
                ) : (
                  <>
                    Every account in iCARE++:{" "}
                    <span className="font-semibold text-gray-900">{people(accounts.length)}</span>, across students,
                    Instructors, Deans and Program Chairs, and Admins.
                  </>
                )}
              </p>
            )}

            {mode === "roles" && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Roles">
                {AUDIENCE_ROLES.map((r) => {
                  const on = roles.has(r.value);
                  return (
                    <label
                      key={r.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        on ? "border-brand-600/50 bg-brand-600/[0.05]" : "border-hairline hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleRole(r.value)}
                        className="h-4 w-4 shrink-0 rounded border-gray-300 accent-brand-600"
                      />
                      <span className="min-w-0 flex-1 text-sm font-medium text-gray-800">{r.label}</span>
                      {accountsData.loading ? (
                        <SkeletonText className="h-3 w-6" />
                      ) : (
                        <span className="text-xs tabular-nums text-gray-500">{roleCounts[r.value].toLocaleString()}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {mode === "users" && (
              <PeoplePicker accounts={accounts} loading={accountsData.loading} picked={picked} onChange={setPicked} />
            )}
          </div>

          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="announcement-title" className={LABEL}>
                  Title
                </label>
                <Counter value={title.length} limit={ANNOUNCEMENT_TITLE_LIMIT} />
              </div>
              <input
                id="announcement-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={ANNOUNCEMENT_TITLE_LIMIT}
                disabled={sending}
                placeholder="e.g. System maintenance on Saturday"
                className={INPUT}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="announcement-message" className={LABEL}>
                  Message
                </label>
                <Counter value={message.length} limit={ANNOUNCEMENT_MESSAGE_LIMIT} />
              </div>
              <textarea
                id="announcement-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={ANNOUNCEMENT_MESSAGE_LIMIT}
                rows={7}
                disabled={sending}
                placeholder="What should everyone know?"
                className={`${INPUT} resize-y leading-relaxed`}
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-hairline p-3">
              <input
                type="checkbox"
                checked={withEmail}
                onChange={(e) => setWithEmail(e.target.checked)}
                disabled={sending}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-brand-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-800">Also send it by email</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
                  Each person gets their own copy from the iCARE++ address, so nobody sees anyone else&apos;s. Replies go
                  to {contactEmail}.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t border-hairline bg-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600" aria-live="polite">
              {missing ?? (
                <>
                  Goes to <span className="font-semibold text-gray-900">{people(recipientCount)}</span>
                  {withEmail ? " in the app and by email." : " in the app."}
                </>
              )}
            </p>
            <button
              type="submit"
              disabled={!ready || sending}
              className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              <FontAwesomeIcon icon={faPaperPlane} className="h-3.5 w-3.5" />
              Send Announcement
            </button>
          </div>
        </form>

        <section aria-label="Sent announcements" className={`${CARD} overflow-hidden`}>
          <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Sent</h2>
            {history.revalidating && <EcgLoader />}
          </header>
          {history.loading ? (
            <ul className="divide-y divide-hairline">
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="space-y-2 px-4 py-3.5">
                  <SkeletonText className="h-3.5 w-40" />
                  <SkeletonText className="h-3 w-56" />
                </li>
              ))}
            </ul>
          ) : history.error && sent.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">The sent announcements couldn&apos;t be loaded.</p>
          ) : sent.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-brand-600/10 text-brand-600">
                <FontAwesomeIcon icon={faBullhorn} className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-gray-800">Nothing sent yet</p>
              <p className="mt-0.5 max-w-[34ch] text-xs text-gray-500">
                Announcements you send show up here, with how many people have read them.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {sent.map((item) => (
                <HistoryItem key={item.id} item={item} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {confirming && (
        <ConfirmModal
          config={{
            title: "Send this announcement?",
            message: `It goes to ${
              audience.kind === "all"
                ? `everyone in iCARE++ (${people(recipientCount)})`
                : audience.kind === "roles"
                  ? `${describeAudience(audience)} (${people(recipientCount)})`
                  : `the ${people(recipientCount)} you picked`
            } in the app${withEmail ? " and by email" : ""}. It can't be taken back once it's sent.`,
            confirmLabel: "Send Now",
            danger: false,
            loading: sending,
            error: sendError,
            onConfirm: () => void send(),
            children: (
              <div className="mt-3 rounded-lg border border-hairline bg-subtle p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 [overflow-wrap:anywhere]">
                  <FontAwesomeIcon icon={faBullhorn} className="h-3 w-3 shrink-0 text-brand-600" />
                  {title.trim()}
                </p>
                <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-gray-600 [overflow-wrap:anywhere]">
                  {message.trim()}
                </p>
              </div>
            ),
          }}
          onClose={() => {
            if (!sending) setConfirming(false);
          }}
        />
      )}
    </div>
  );
}
