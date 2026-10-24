"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowUpRightFromSquare,
  faCircleCheck,
  faEnvelopeOpenText,
  faImage,
  faLifeRing,
  faPaperPlane,
  faReply,
  faRotateLeft,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { apiFetch } from "@/app/lib/api";
import { refreshNotifications } from "@/app/lib/notifications-live";
import { usePageData } from "@/app/lib/use-page-data";
import { SUPPORT_REPLY_LIMIT, type SupportStatus } from "@/app/lib/support";
import PageHeader from "../../components/PageHeader";
import Avatar from "../../components/Avatar";
import { EcgLoader } from "../../components/EcgLoader";
import { SkeletonText } from "../../components/skeletons";
import { toast } from "../../components/Toast";
import { SupportImagePicker, useSupportImages } from "../../components/SupportImagePicker";
import { CARD, StatusText } from "../ui";
import type { RunTone } from "../run-status";

interface RequestSummary {
  id: string;
  status: SupportStatus;
  name: string;
  email: string;
  role: string;
  topic: string;
  subject: string;
  preview: string;
  image_count: number;
  reply_count: number;
  unread: boolean;
  created_at: string;
  last_activity_at: string;
}

interface StoredImage {
  path: string;
  name: string;
  type: string;
  size: number;
  url: string | null;
}

interface Reply {
  id: string;
  by: string;
  by_name: string;
  message: string;
  attachments: StoredImage[];
  sent_at: string;
}

interface RequestDetail {
  id: string;
  status: SupportStatus;
  user_id: string;
  name: string;
  email: string;
  role: string;
  section: string | null;
  topic: string;
  subject: string;
  message: string;
  client: string | null;
  created_at: string;
  attachments: StoredImage[];
  replies: Reply[];
  resolved_by_name: string | null;
  resolved_at: string | null;
}

type Filter = SupportStatus | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Needs Reply" },
  { value: "answered", label: "Answered" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

const STATUS_META: Record<SupportStatus, { label: string; tone: RunTone }> = {
  open: { label: "Needs reply", tone: "warn" },
  answered: { label: "Answered", tone: "good" },
  resolved: { label: "Resolved", tone: "idle" },
};

const EMPTY_TEXT: Record<Filter, string> = {
  open: "Nothing is waiting on a reply.",
  answered: "No answered requests are still open.",
  resolved: "No requests have been resolved yet.",
  all: "No one has written in yet.",
};

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

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

const textareaClass =
  "w-full resize-y rounded-lg border border-gray-200 bg-surface px-3 py-2.5 text-sm leading-relaxed text-gray-800 transition-all focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";

/** A full-screen look at one image, with the original a click away. */
function ImageViewer({ image, onClose }: { image: StoredImage; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      onClick={onClose}
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black/85 p-4"
    >
      <div className="flex w-full max-w-5xl items-center justify-between gap-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 truncate text-sm font-medium">{image.name}</span>
        <div className="flex shrink-0 items-center gap-2">
          {/* Browsers won't open a data: URL in a new tab, which is all the demo has. */}
          {image.url && !image.url.startsWith("data:") && (
            <a
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
            >
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />
              Open Original
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-white/10 hover:bg-white/20"
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        </div>
      </div>
      {image.url && (
        // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed Storage URL
        <img
          src={image.url}
          alt={image.name}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[82vh] max-w-full rounded-lg object-contain shadow-2xl"
        />
      )}
    </div>
  );
}

function ImageStrip({ images, onOpen }: { images: StoredImage[]; onOpen: (image: StoredImage) => void }) {
  if (images.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {images.map((image) => (
        <button
          key={image.path}
          type="button"
          onClick={() => onOpen(image)}
          disabled={!image.url}
          title={image.name}
          className="group relative h-24 w-24 cursor-pointer overflow-hidden rounded-lg border border-hairline bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50 disabled:cursor-default sm:h-28 sm:w-28"
        >
          {image.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed Storage URL
            <img src={image.url} alt={image.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] text-gray-500">
              <FontAwesomeIcon icon={faImage} className="h-4 w-4" />
              Couldn&apos;t load
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function RequestList({
  requests,
  loading,
  filter,
  selectedId,
  onSelect,
}: {
  requests: RequestSummary[];
  loading: boolean;
  filter: Filter;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (loading) {
    return (
      <ul className="divide-y divide-hairline" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="space-y-2 px-4 py-3.5">
            <SkeletonText className="h-3.5 w-32" />
            <SkeletonText className="h-3 w-48" />
            <SkeletonText className="h-3 w-24" />
          </li>
        ))}
      </ul>
    );
  }
  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-subtle text-gray-400">
          <FontAwesomeIcon icon={faEnvelopeOpenText} className="h-5 w-5" />
        </span>
        <p className="text-sm font-semibold text-gray-800">All clear</p>
        <p className="mt-0.5 text-xs text-gray-500">{EMPTY_TEXT[filter]}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-hairline">
      {requests.map((r) => {
        const active = r.id === selectedId;
        const meta = STATUS_META[r.status];
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              aria-current={active ? "true" : undefined}
              className={`block w-full cursor-pointer px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600/50 ${
                active ? "bg-brand-600/[0.07]" : "hover:bg-subtle"
              }`}
            >
              <span className="flex items-center gap-2">
                {r.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" title="Unread" />}
                <span className={`min-w-0 truncate text-sm ${r.unread ? "font-bold" : "font-semibold"} text-gray-900`}>
                  {r.name}
                </span>
                <span className="shrink-0 text-xs text-gray-500">{r.role}</span>
                <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-400">{stamp(r.created_at)}</span>
              </span>
              <span className="mt-0.5 block truncate text-sm text-gray-800">{r.subject}</span>
              <span className="mt-0.5 block truncate text-xs text-gray-500">{r.preview}</span>
              <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                <StatusText tone={meta.tone} className="font-semibold">
                  {meta.label}
                </StatusText>
                <span>{r.topic}</span>
                {r.image_count > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <FontAwesomeIcon icon={faImage} className="h-3 w-3" />
                    {r.image_count}
                  </span>
                )}
                {r.reply_count > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <FontAwesomeIcon icon={faReply} className="h-3 w-3" />
                    {r.reply_count}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RequestView({
  id,
  contactEmail,
  onBack,
  onChanged,
}: {
  id: string;
  contactEmail: string;
  onBack: () => void;
  onChanged: (id: string, patch: Partial<RequestSummary>) => void;
}) {
  const { data, loading, setData } = usePageData(`super-admin:support:${id}`, async () => {
    const res = await apiFetch(`/api/super-admin/support/${encodeURIComponent(id)}`);
    if (res.status === 404) return { request: null };
    if (!res.ok) throw new Error("Unable to load the request");
    return (await res.json()) as { request: RequestDetail | null; marked_read?: boolean };
  });
  const request = data?.request ?? null;
  const markedRead = data?.marked_read === true;

  // Opening it marked the Admin's notification read; bring the bell's count down.
  useEffect(() => {
    if (markedRead) void refreshNotifications();
  }, [markedRead]);

  const [viewing, setViewing] = useState<StoredImage | null>(null);
  const [reply, setReply] = useState("");
  const [resolveAfter, setResolveAfter] = useState(false);
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const images = useSupportImages();

  if (loading) {
    return (
      <div className={`${CARD} space-y-3 p-5`} aria-busy="true">
        <SkeletonText className="h-5 w-64" />
        <SkeletonText className="h-3.5 w-48" />
        <SkeletonText className="h-24 w-full" />
      </div>
    );
  }
  if (!request) {
    return (
      <div className={`${CARD} p-6 text-sm text-gray-600`}>
        <button type="button" onClick={onBack} className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-brand-600 lg:hidden">
          <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
          Back to Requests
        </button>
        <p>This request couldn&apos;t be found. It may have been removed.</p>
      </div>
    );
  }

  const meta = STATUS_META[request.status];
  const canSend = reply.trim().length > 0 && !sending && !images.uploading && !images.failed;

  const applyChange = (patch: Partial<RequestDetail>, summary: Partial<RequestSummary>) => {
    setData((prev) => (prev?.request ? { request: { ...prev.request, ...patch } } : (prev ?? { request: null })));
    onChanged(request.id, summary);
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    try {
      const res = await apiFetch(`/api/super-admin/support/${encodeURIComponent(request.id)}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply, attachments: images.attachments, resolve: resolveAfter }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: boolean;
        reply?: Reply;
        status?: SupportStatus;
        resolved_by_name?: string | null;
        resolved_at?: string | null;
        sent_to?: string;
        notice?: string;
      };
      if (!res.ok || !body.reply || !body.status) {
        // Emailed but not saved: clear the box so it isn't sent twice.
        if (body.sent) {
          setReply("");
          images.clear();
        }
        toast(body.error || "The reply could not be sent.", "error", 7000);
        return;
      }
      const replies = [...request.replies, body.reply];
      applyChange(
        { replies, status: body.status, resolved_by_name: body.resolved_by_name ?? null, resolved_at: body.resolved_at ?? null },
        { status: body.status, reply_count: replies.length, last_activity_at: body.reply.sent_at },
      );
      setReply("");
      setResolveAfter(false);
      images.clear();
      toast(body.notice ?? `Reply emailed to ${body.sent_to ?? request.email}.`);
    } catch {
      toast("The reply could not be sent. Check your connection and try again.", "error");
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status: "resolved" | "open") => {
    setUpdating(true);
    try {
      const res = await apiFetch(`/api/super-admin/support/${encodeURIComponent(request.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        status?: SupportStatus;
        resolved_by_name?: string | null;
        resolved_at?: string | null;
      };
      if (!res.ok || !body.status) {
        toast(body.error || "The request could not be updated.", "error");
        return;
      }
      applyChange(
        { status: body.status, resolved_by_name: body.resolved_by_name ?? null, resolved_at: body.resolved_at ?? null },
        { status: body.status },
      );
      toast(status === "resolved" ? "Marked as resolved." : "Request reopened.");
    } catch {
      toast("The request could not be updated.", "error");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <article className={`${CARD} overflow-hidden`}>
      <header className="border-b border-hairline p-5">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-brand-600 lg:hidden"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
          Back to Requests
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold leading-snug tracking-[-0.01em] text-gray-900 [overflow-wrap:anywhere]">
              {request.subject}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <StatusText tone={meta.tone} className="font-semibold">
                {meta.label}
              </StatusText>
              <span className="rounded-full bg-subtle px-2 py-0.5 font-medium text-gray-600 ring-1 ring-hairline">{request.topic}</span>
              {request.status === "resolved" && request.resolved_by_name && (
                <span>
                  Resolved by {request.resolved_by_name}
                  {request.resolved_at ? `, ${stamp(request.resolved_at)}` : ""}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void setStatus(request.status === "resolved" ? "open" : "resolved")}
            disabled={updating}
            className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 self-start rounded-lg border border-gray-200 bg-surface px-3.5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updating ? (
              <EcgLoader />
            ) : (
              <FontAwesomeIcon icon={request.status === "resolved" ? faRotateLeft : faCircleCheck} className="h-3.5 w-3.5" />
            )}
            {request.status === "resolved" ? "Reopen Request" : "Mark as Resolved"}
          </button>
        </div>
      </header>

      <div className="space-y-6 p-5">
        <section>
          <div className="flex items-start gap-3">
            <Avatar name={request.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold text-gray-900">{request.name}</span>
                <span className="text-gray-500">{request.role}</span>
                <span className="ml-auto text-[11px] tabular-nums text-gray-400">{stamp(request.created_at)}</span>
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                <a href={`mailto:${request.email}`} className="font-medium text-brand-600 [overflow-wrap:anywhere] hover:underline">
                  {request.email}
                </a>
                {request.section && <span>Section {request.section}</span>}
                {request.client && <span>Sent from {request.client}</span>}
              </p>
            </div>
          </div>
          <div className="mt-3 whitespace-pre-wrap rounded-xl border border-hairline bg-subtle p-4 text-sm leading-relaxed text-gray-800 [overflow-wrap:anywhere]">
            {request.message}
          </div>
          <ImageStrip images={request.attachments} onOpen={setViewing} />
        </section>

        {request.replies.length > 0 && (
          <section aria-label="Replies" className="space-y-4">
            {request.replies.map((r) => (
              <div key={r.id} className="border-l-2 border-brand-600/40 pl-4">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold text-gray-900">{r.by_name}</span>
                  <span className="text-xs text-gray-500">replied by email</span>
                  <span className="ml-auto text-[11px] tabular-nums text-gray-400">{stamp(r.sent_at)}</span>
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-800 [overflow-wrap:anywhere]">{r.message}</p>
                <ImageStrip images={r.attachments} onOpen={setViewing} />
              </div>
            ))}
          </section>
        )}

        <form onSubmit={sendReply} className="space-y-3 border-t border-hairline pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="support-reply" className="text-sm font-medium text-gray-700">
              Reply to {firstName(request.name)}
            </label>
            <span className="font-mono text-[11px] tabular-nums text-gray-400">
              {reply.length}/{SUPPORT_REPLY_LIMIT}
            </span>
          </div>
          <textarea
            id="support-reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onPaste={images.onPaste}
            maxLength={SUPPORT_REPLY_LIMIT}
            rows={6}
            disabled={sending}
            placeholder={`Hi ${firstName(request.name)}, …`}
            className={textareaClass}
          />
          <SupportImagePicker
            images={images}
            disabled={sending}
            hint="Screenshots that show the fix or where to find something. You can also paste one into the reply."
          />
          <div className="flex flex-col gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              {request.status !== "resolved" && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={resolveAfter}
                    onChange={(e) => setResolveAfter(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-brand-600"
                  />
                  Mark as resolved after sending
                </label>
              )}
              <p className="text-xs text-gray-500">
                Emailed to <span className="font-medium text-gray-700">{request.email}</span> from the iCARE++ address. If
                they answer, it goes to {contactEmail}.
                {request.status === "resolved" ? " Replying reopens this request as answered." : ""}
              </p>
            </div>
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {sending ? <EcgLoader className="text-white" /> : <FontAwesomeIcon icon={faPaperPlane} className="h-3.5 w-3.5" />}
              {sending ? "Sending…" : images.uploading ? "Uploading images…" : "Send Reply"}
            </button>
          </div>
        </form>
      </div>

      {viewing && <ImageViewer image={viewing} onClose={() => setViewing(null)} />}
    </article>
  );
}

/**
 * The Admin's inbox for Help & Support messages from Instructors, Deans, and
 * students. A reply is emailed to the sender and kept on the request, so
 * every Admin sees what has been answered.
 */
export default function SupportRequestsClient({ contactEmail }: { contactEmail: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("request");
  const [filter, setFilter] = useState<Filter>("open");

  const { data, loading, setData } = usePageData("super-admin:support", async () => {
    const res = await apiFetch("/api/super-admin/support");
    if (!res.ok) throw new Error("Unable to load support requests");
    return (await res.json()) as { requests: RequestSummary[] };
  });
  const requests = useMemo(() => data?.requests ?? [], [data]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { open: 0, answered: 0, resolved: 0, all: requests.length };
    for (const r of requests) c[r.status] += 1;
    return c;
  }, [requests]);
  const shown = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  const select = (id: string | null) =>
    router.replace(id ? `/admin/support?request=${encodeURIComponent(id)}` : "/admin/support", { scroll: false });

  const onChanged = useCallback(
    (id: string, patch: Partial<RequestSummary>) =>
      setData((prev) => ({
        requests: (prev?.requests ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
      })),
    [setData],
  );

  // Opening a request marks the Admin's copy read on the server; mirror it here.
  useEffect(() => {
    if (selectedId && requests.some((r) => r.id === selectedId && r.unread)) {
      onChanged(selectedId, { unread: false });
    }
  }, [selectedId, requests, onChanged]);

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faLifeRing} />, label: "Support" }}
        title="Support Requests"
        subtitle="Problems and questions sent from Help & Support by Instructors, Deans, Program Chairs, and students. Your reply is emailed to them, with any images you attach."
      />

      <div
        role="radiogroup"
        aria-label="Filter requests"
        className="mb-4 flex flex-wrap gap-0.5 self-start rounded-xl border border-hairline bg-surface p-1 sm:inline-flex"
      >
        {FILTERS.map((tab) => {
          const active = filter === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setFilter(tab.value)}
              className={`inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50 ${
                active ? "bg-brand-600 text-white" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
              {loading ? (
                <SkeletonText className="h-3 w-4" />
              ) : (
                <span className={`text-xs tabular-nums ${active ? "text-white/80" : "text-gray-400"}`}>{counts[tab.value]}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <section aria-label="Requests" className={`${CARD} overflow-hidden ${selectedId ? "hidden lg:block" : ""}`}>
          <RequestList requests={shown} loading={loading} filter={filter} selectedId={selectedId} onSelect={select} />
        </section>

        <div className={selectedId ? "" : "hidden lg:block"}>
          {selectedId ? (
            <RequestView key={selectedId} id={selectedId} contactEmail={contactEmail} onBack={() => select(null)} onChanged={onChanged} />
          ) : (
            <div className={`${CARD} flex flex-col items-center px-6 py-16 text-center`}>
              <span className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-brand-600/10 text-brand-600">
                <FontAwesomeIcon icon={faEnvelopeOpenText} className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-gray-800">Pick a request to read it</p>
              <p className="mt-0.5 max-w-[40ch] text-xs text-gray-500">
                You&apos;ll see the message, any images sent with it, and a box to write your reply.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
