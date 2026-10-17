import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import type { EmailAttachment } from '@/app/lib/auth/email';
import { SUPPORT_ATTACHMENTS, type SupportAttachment, type SupportStatus } from '@/app/lib/support';

/**
 * Help & Support requests, kept the way account requests are: one
 * notification per Admin (super admin), all sharing `request_id`, so each
 * Admin's bell shows it and the Support Requests page reads it back. Any
 * change rewrites every copy, so the Admins all see the same thread.
 *
 * Images live in the private `support` bucket under support/<uploader id>/.
 */
export const SUPPORT_BUCKET = 'support';

export type SupportReply = {
  id: string;
  by: string;
  by_name: string;
  message: string;
  attachments: SupportAttachment[];
  sent_at: string;
};

export type SupportRequestData = {
  kind: 'support_request';
  request_id: string;
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
  attachments: SupportAttachment[];
  replies: SupportReply[];
  resolved_by_name?: string | null;
  resolved_at?: string | null;
};

export type SupportCopy = { id: string; user_id: string; data: SupportRequestData; read_at: string | null; created_at: string };

const ALLOWED_TYPES: readonly string[] = SUPPORT_ATTACHMENTS.types;

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'image';
}

/**
 * Saves one image into the uploader's folder. The first upload on a
 * deployment without migration 078 creates the bucket, so images work
 * before anyone runs it.
 */
export async function storeSupportImage(uid: string, file: File): Promise<SupportAttachment> {
  const storage = getSupabaseAdmin().storage;
  const path = `${uid}/${randomUUID()}-${safeName(file.name)}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const upload = () =>
    storage.from(SUPPORT_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });

  let { error } = await upload();
  if (error && /bucket not found/i.test(error.message)) {
    const created = await storage.createBucket(SUPPORT_BUCKET, {
      public: false,
      fileSizeLimit: SUPPORT_ATTACHMENTS.maxBytes,
      allowedMimeTypes: [...SUPPORT_ATTACHMENTS.types],
    });
    if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
    ({ error } = await upload());
  }
  if (error) throw error;
  return { path, name: file.name.slice(0, 120) || 'image', type: file.type, size: file.size };
}

/**
 * The images a message names, or null when the list is malformed. Only paths
 * in the sender's own folder pass, so nobody can mail out someone else's file.
 */
export function parseAttachments(value: unknown, uid: string): SupportAttachment[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > SUPPORT_ATTACHMENTS.max) return null;
  const seen = new Set<string>();
  const out: SupportAttachment[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const { path, name, type, size } = item as Record<string, unknown>;
    if (typeof path !== 'string' || !path.startsWith(`${uid}/`) || path.includes('..')) return null;
    if (typeof type !== 'string' || !ALLOWED_TYPES.includes(type)) return null;
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({
      path,
      name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : 'image',
      type,
      size: Number.isFinite(Number(size)) ? Number(size) : 0,
    });
  }
  return out;
}

/** Reads the images back for an email. Throws if any of them isn't stored. */
export async function downloadAttachments(attachments: SupportAttachment[]): Promise<EmailAttachment[]> {
  const bucket = getSupabaseAdmin().storage.from(SUPPORT_BUCKET);
  return Promise.all(
    attachments.map(async (a) => {
      const { data, error } = await bucket.download(a.path);
      if (error || !data) throw error ?? new Error(`Missing support image ${a.path}`);
      return { filename: a.name, content: Buffer.from(await data.arrayBuffer()), contentType: a.type };
    }),
  );
}

/** Short-lived links for the Admin portal to show the images, by path. */
export async function signAttachments(paths: string[], seconds = 3600): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await getSupabaseAdmin().storage.from(SUPPORT_BUCKET).createSignedUrls(paths, seconds);
  if (error || !data) {
    console.error('Failed to sign support images', error);
    return {};
  }
  const out: Record<string, string> = {};
  for (const item of data) if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  return out;
}

/** Fills in what an older or hand-edited copy may lack, so readers can trust the shape. */
export function toSupportData(raw: Record<string, unknown>): SupportRequestData {
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const status: SupportStatus = raw.status === 'answered' || raw.status === 'resolved' ? raw.status : 'open';
  return {
    kind: 'support_request',
    request_id: text(raw.request_id),
    status,
    user_id: text(raw.user_id),
    name: text(raw.name),
    email: text(raw.email),
    role: text(raw.role),
    section: typeof raw.section === 'string' ? raw.section : null,
    topic: text(raw.topic),
    subject: text(raw.subject),
    message: text(raw.message),
    client: typeof raw.client === 'string' ? raw.client : null,
    attachments: list(raw.attachments) as SupportAttachment[],
    replies: list(raw.replies) as SupportReply[],
    resolved_by_name: typeof raw.resolved_by_name === 'string' ? raw.resolved_by_name : null,
    resolved_at: typeof raw.resolved_at === 'string' ? raw.resolved_at : null,
  };
}

/**
 * Files a new request in every Admin's notifications. Returns its id, or null
 * when there is no Admin to file it with or the insert failed; the team's
 * email still carries it then.
 */
export async function fileSupportRequest(
  request: Omit<SupportRequestData, 'kind' | 'request_id' | 'status' | 'replies'>,
): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: admins, error } = await supabase.from('users').select('id').eq('role', 'super_admin');
    if (error) throw error;
    if (!admins?.length) return null;

    const requestId = randomUUID();
    const data: SupportRequestData = {
      ...request,
      kind: 'support_request',
      request_id: requestId,
      status: 'open',
      replies: [],
    };
    const images = request.attachments.length;
    const { error: insertError } = await supabase.from('notifications').insert(
      admins.map((admin) => ({
        user_id: admin.id,
        type: 'system' as const,
        title: `Support request from ${request.name}`,
        body: `${request.role} · ${request.topic}: ${request.subject}${images ? ` · ${images} image${images === 1 ? '' : 's'}` : ''}`,
        data,
      })),
    );
    if (insertError) throw insertError;
    return requestId;
  } catch (err) {
    console.error('Failed to file a support request for the Admins', err);
    return null;
  }
}

/** Every Admin's copy of one request, oldest copy first. */
export async function loadSupportCopies(requestId: string): Promise<SupportCopy[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('notifications')
    .select('id, user_id, data, read_at, created_at')
    .eq('data->>kind', 'support_request')
    .eq('data->>request_id', requestId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, data: toSupportData(row.data as Record<string, unknown>) }));
}

/** Writes the same request state into every copy. */
export async function saveSupportCopies(copies: SupportCopy[], data: SupportRequestData): Promise<void> {
  const supabase = getSupabaseAdmin();
  const results = await Promise.all(
    copies.map((copy) => supabase.from('notifications').update({ data }).eq('id', copy.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
