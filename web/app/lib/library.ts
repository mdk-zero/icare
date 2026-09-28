// Server code only.
import type { getSupabaseAdmin } from './supabase/server';
import { getAdminScope } from './admin-scope';
import { getFacultySectionIds } from './roster';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * The Library (migration 061): study materials instructors publish for a
 * Taylor's skill. See the migration for the shape of a material.
 */

export const LIBRARY_BUCKET = 'library';
export const MATERIAL_KINDS = ['video', 'note', 'pdf', 'slides', 'link'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** Largest upload, matching the bucket's file_size_limit. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Accepted upload types per file kind. */
export const FILE_TYPES: Record<'pdf' | 'slides', Record<string, string>> = {
  pdf: { 'application/pdf': '.pdf' },
  slides: {
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/vnd.openxmlformats-officedocument.presentationml.slideshow': '.ppsx',
    'application/vnd.ms-powerpoint': '.ppt',
  },
};

/** The file kind an upload is, from its MIME type or, failing that, its extension. */
export function fileKindOf(mime: string, fileName: string): 'pdf' | 'slides' | null {
  for (const kind of ['pdf', 'slides'] as const) {
    if (mime && FILE_TYPES[kind][mime]) return kind;
  }
  const ext = /\.[a-z0-9]+$/i.exec(fileName)?.[0]?.toLowerCase();
  for (const kind of ['pdf', 'slides'] as const) {
    if (ext && Object.values(FILE_TYPES[kind]).includes(ext)) return kind;
  }
  return null;
}

export function isMaterialKind(value: unknown): value is MaterialKind {
  return typeof value === 'string' && (MATERIAL_KINDS as readonly string[]).includes(value);
}

/**
 * The 11-character id of a YouTube video from any of the URL forms people
 * paste (watch, youtu.be, shorts, embed, live, m.youtube), or a bare id.
 */
export function parseYouTubeId(input: string): string | null {
  const value = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname);
      id = m?.[1] ?? null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export interface YouTubeInfo {
  title: string;
  channel: string;
}

/**
 * Whether a video exists and may be embedded, with its title and channel.
 * YouTube's oEmbed endpoint answers 401/403 for videos whose owner disabled
 * embedding and 404 for removed or private ones; either way it can't play in
 * the app. Null on any failure.
 */
export async function verifyYouTube(id: string): Promise<YouTubeInfo | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
      { signal: AbortSignal.timeout(8000), cache: 'no-store' },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { title?: string; author_name?: string };
    return { title: json.title ?? '', channel: json.author_name ?? '' };
  } catch {
    return null;
  }
}

/** An external link: http(s) only. */
export function normaliseLink(input: string): string | null {
  try {
    const url = new URL(input.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The sections a faculty or admin session publishes to, as {id, name}.
 * `null` means no limit (an admin before 053): every section.
 */
export async function publishableSections(
  supabase: Supabase,
  session: { uid: string; role: string },
): Promise<{ id: string; name: string }[] | null> {
  let ids: string[];
  if (session.role === 'admin') {
    const scope = await getAdminScope(supabase, session.uid);
    if (!scope) return null;
    ids = scope.sectionIds;
  } else {
    ids = await getFacultySectionIds(supabase, session.uid);
  }
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('sections').select('id, name').in('id', ids);
  if (error) throw new Error('Unable to read your sections');
  return (data ?? []).map((s) => ({ id: s.id as string, name: s.name as string })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The target_sections to store: the chosen names, which must all be the
 * caller's own sections. Choosing none means all of them; for a caller with
 * no limit that is null (every section). An error string when a name isn't
 * theirs, or they have no section to publish to.
 */
export function resolveTargetSections(
  chosen: unknown,
  own: { name: string }[] | null,
): { value: string[] | null } | { error: string } {
  if (chosen !== undefined && chosen !== null) {
    if (!Array.isArray(chosen) || chosen.some((s) => typeof s !== 'string')) {
      return { error: 'Invalid target_sections' };
    }
  }
  const names = Array.isArray(chosen) ? [...new Set((chosen as string[]).map((s) => s.trim()).filter(Boolean))] : [];
  if (own === null) return { value: names.length ? names : null };
  const ownNames = own.map((s) => s.name);
  const foreign = names.filter((n) => !ownNames.includes(n));
  if (foreign.length) return { error: `Not one of your sections: ${foreign.join(', ')}` };
  if (names.length) return { value: names };
  if (ownNames.length === 0) return { error: 'You have no sections to publish to yet' };
  return { value: ownNames };
}

/** Whether a student in `section` (a name, or null) may see a material aimed at `target`. */
export function visibleToSection(target: string[] | null | undefined, section: string | null): boolean {
  if (!target || target.length === 0) return true;
  return section !== null && target.includes(section);
}

/** Columns every material read selects. */
export const MATERIAL_COLUMNS =
  'id, skill_id, kind, title, description, youtube_id, body_md, url, file_path, file_name, file_size, mime_type, target_sections, status, published_at, created_by, created_at, updated_at';

export interface MaterialRow {
  id: string;
  skill_id: string;
  kind: MaterialKind;
  title: string;
  description: string;
  youtube_id: string | null;
  body_md: string | null;
  url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  target_sections: string[] | null;
  status: 'draft' | 'published';
  published_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** A short-lived link to a stored file, for viewers that fetch it themselves. */
export async function signedFileUrl(supabase: Supabase, path: string, seconds = 600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(LIBRARY_BUCKET).createSignedUrl(path, seconds);
  if (error || !data) {
    console.error('Failed to sign a library file', error);
    return null;
  }
  return data.signedUrl;
}

/**
 * How an app shows a stored file without downloading it. PDFs open directly
 * where the platform can render them (browsers, iOS); Android's WebView
 * can't, so it goes through Google's viewer. PowerPoint always goes through
 * Microsoft's Office viewer. Both viewers fetch the short-lived signed URL.
 */
export function fileViewerUrls(kind: 'pdf' | 'slides', signed: string): { direct: string; embed: string } {
  const src = encodeURIComponent(signed);
  if (kind === 'slides') {
    return { direct: signed, embed: `https://view.officeapps.live.com/op/embed.aspx?src=${src}` };
  }
  return { direct: signed, embed: `https://docs.google.com/gview?embedded=1&url=${src}` };
}

/** Whether a stored path is inside the caller's own upload folder. */
export function ownsUploadPath(uid: string, path: unknown): path is string {
  return typeof path === 'string' && path.startsWith(`${uid}/`) && !path.includes('..');
}

/** Whether an error means migration 061 isn't applied yet. */
export function isMissingLibrary(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

/** Notify the students a newly published material is for. Never fails the request. */
export async function notifyPublished(supabase: Supabase, material: Pick<MaterialRow, 'id' | 'title' | 'skill_id' | 'kind' | 'target_sections'>): Promise<void> {
  try {
    let query = supabase.from('users').select('id').eq('role', 'student').limit(5000);
    if (material.target_sections && material.target_sections.length) {
      const { data: sections } = await supabase.from('sections').select('id').in('name', material.target_sections);
      const ids = (sections ?? []).map((s) => s.id as string);
      if (ids.length === 0) return;
      query = query.in('section_id', ids);
    }
    const { data: students, error } = await query;
    if (error || !students?.length) return;
    const noun = { video: 'video', note: 'note', pdf: 'handout', slides: 'presentation', link: 'link' }[material.kind];
    const { error: insertError } = await supabase.from('notifications').insert(
      students.map((s) => ({
        user_id: s.id as string,
        type: 'system',
        title: `New study ${noun} in the Library`,
        body: `"${material.title}" for Skill ${material.skill_id}.`,
        data: { kind: 'library', materialId: material.id, skillId: material.skill_id },
      })),
    );
    if (insertError) console.error('Failed to notify students of a library material', insertError);
  } catch (err) {
    console.error('Library notification failed', err);
  }
}

export interface MaterialInput {
  skill_id: string;
  kind: MaterialKind;
  title: string;
  description: string;
  youtube_id: string | null;
  body_md: string | null;
  url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
}

const MAX_NOTE = 50_000;

/**
 * Validates a material from a request body: the content field its kind needs,
 * and nothing of the others. YouTube videos are checked with oEmbed, and a
 * missing title is taken from the video. Files must have been uploaded to the
 * caller's own folder.
 */
export async function parseMaterialInput(
  body: Record<string, unknown>,
  uid: string,
  isSkillId: (v: unknown) => v is string,
): Promise<{ value: MaterialInput } | { error: string }> {
  const { skill_id, kind } = body;
  if (!isSkillId(skill_id)) return { error: 'Choose a skill from the list' };
  if (!isMaterialKind(kind)) return { error: 'Invalid material type' };
  let title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : '';

  const value: MaterialInput = {
    skill_id, kind, title, description,
    youtube_id: null, body_md: null, url: null,
    file_path: null, file_name: null, file_size: null, mime_type: null,
  };

  if (kind === 'video') {
    const id = typeof body.youtube_url === 'string' ? parseYouTubeId(body.youtube_url) : null;
    if (!id) return { error: 'That is not a YouTube video link' };
    const info = await verifyYouTube(id);
    if (!info) return { error: 'That video is unavailable or its owner does not allow it to be embedded' };
    value.youtube_id = id;
    if (!title) title = info.title;
  } else if (kind === 'note') {
    const text = typeof body.body_md === 'string' ? body.body_md.trim() : '';
    if (!text) return { error: 'Write the note first' };
    if (text.length > MAX_NOTE) return { error: 'The note is too long' };
    value.body_md = text;
  } else if (kind === 'link') {
    const url = typeof body.url === 'string' ? normaliseLink(body.url) : null;
    if (!url) return { error: 'Enter a web address starting with https://' };
    value.url = url;
  } else {
    if (!ownsUploadPath(uid, body.file_path)) return { error: 'Upload the file first' };
    const fileName = typeof body.file_name === 'string' ? body.file_name.slice(0, 200) : '';
    const mime = typeof body.mime_type === 'string' ? body.mime_type : '';
    if (fileKindOf(mime, fileName) !== kind) {
      return { error: kind === 'pdf' ? 'Upload a PDF file' : 'Upload a PowerPoint file (.pptx, .ppt or .ppsx)' };
    }
    value.file_path = body.file_path;
    value.file_name = fileName || null;
    value.mime_type = mime || null;
    value.file_size = typeof body.file_size === 'number' && Number.isFinite(body.file_size) ? Math.round(body.file_size) : null;
  }

  if (!title) return { error: 'Give the material a title' };
  value.title = title.slice(0, 200);
  return { value };
}

export const LIBRARY_NEEDS_MIGRATION = 'The Library needs database migration 061. Ask an administrator to apply it.';
