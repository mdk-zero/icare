"use client";

import { useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faEye,
  faFilePdf,
  faFilePowerpoint,
  faLink,
  faPen,
  faPlay,
  faPlus,
  faSearch,
  faStickyNote,
  faTimes,
  faTrash,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import { SkeletonLibraryMaterials, SkeletonLibrarySkillList } from "../../components/skeletons";
import ConfirmModal, { type ConfirmConfig } from "../../components/ConfirmModal";
import { toast } from "../../components/Toast";
import { usePageData } from "../../lib/use-page-data";
import {
  createLibraryMaterial,
  deleteLibraryMaterial,
  fetchLibrary,
  fetchLibraryMaterial,
  fetchLibrarySuggestions,
  publishLibrarySuggestion,
  setLibraryMaterialStatus,
  updateLibraryMaterial,
  uploadLibraryFile,
  type LibraryKind,
  type LibraryMaterial,
  type LibraryMaterialInput,
  type LibrarySkill,
  type LibrarySuggestion,
  type Section,
} from "../../lib/api";
import { inputClassName, labelClassName } from "../cases/case-ui";

const KINDS: { kind: LibraryKind; label: string; icon: IconDefinition; tint: string }[] = [
  { kind: "video", label: "YouTube video", icon: faPlay, tint: "bg-rose-50 text-rose-600" },
  { kind: "note", label: "Note", icon: faStickyNote, tint: "bg-amber-50 text-amber-600" },
  { kind: "pdf", label: "PDF", icon: faFilePdf, tint: "bg-red-50 text-red-600" },
  { kind: "slides", label: "PowerPoint", icon: faFilePowerpoint, tint: "bg-orange-50 text-orange-600" },
  { kind: "link", label: "Web link", icon: faLink, tint: "bg-sky-50 text-sky-600" },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.kind, k])) as Record<LibraryKind, (typeof KINDS)[number]>;

const NO_SKILLS: LibrarySkill[] = [];
const NO_SECTIONS: Section[] = [];
const NO_MATERIALS: LibraryMaterial[] = [];
const NO_SUGGESTIONS: LibrarySuggestion[] = [];

/** The id of a YouTube link, for the live preview; the server checks it properly. */
function youTubeIdOf(value: string): string | null {
  const m = /(?:youtu\.be\/|[?&]v=|\/(?:embed|shorts|live)\/)([A-Za-z0-9_-]{11})/.exec(value);
  return m?.[1] ?? (/^[A-Za-z0-9_-]{11}$/.test(value.trim()) ? value.trim() : null);
}

const embedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
const thumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

/** A note's opening words without its markdown. */
function plainText(md: string) {
  return md.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#*_>`~-]+/g, " ").replace(/\s+/g, " ").trim();
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function LibraryClient() {
  const { data, loading, refresh } = usePageData("faculty:library", async () => {
    const [lib, sug] = await Promise.all([fetchLibrary(), fetchLibrarySuggestions()]);
    return {
      skills: lib.data?.skills ?? NO_SKILLS,
      sections: lib.data?.sections ?? NO_SECTIONS,
      materials: lib.data?.materials ?? NO_MATERIALS,
      enabled: lib.data?.enabled ?? true,
      suggestions: sug.data?.suggestions ?? NO_SUGGESTIONS,
      error: lib.error ?? null,
    };
  });
  const skills = data?.skills ?? NO_SKILLS;
  const materials = data?.materials ?? NO_MATERIALS;
  const suggestions = data?.suggestions ?? NO_SUGGESTIONS;
  const sections = data?.sections ?? NO_SECTIONS;

  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ material: LibraryMaterial | null; kind: LibraryKind } | null>(null);
  const [previewing, setPreviewing] = useState<LibraryMaterial | LibrarySuggestion | null>(null);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const skillId = picked ?? skills[0]?.id ?? null;
  const skill = skills.find((s) => s.id === skillId) ?? null;

  const countBySkill = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of materials) m.set(x.skill_id, (m.get(x.skill_id) ?? 0) + 1);
    return m;
  }, [materials]);

  const chapters = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groups: { chapter: number; area: string; skills: LibrarySkill[] }[] = [];
    for (const s of skills) {
      if (q && !`${s.id} ${s.title} ${s.area}`.toLowerCase().includes(q)) continue;
      let g = groups.find((x) => x.chapter === s.chapter);
      if (!g) groups.push((g = { chapter: s.chapter, area: s.area, skills: [] }));
      g.skills.push(s);
    }
    return groups;
  }, [skills, search]);

  const skillMaterials = materials.filter((m) => m.skill_id === skillId);
  const skillSuggestions = suggestions.filter((s) => s.skill_id === skillId);
  const published = materials.filter((m) => m.status === "published").length;
  // Only the first load: a refresh behind data already on screen keeps the rows.
  const firstLoad = loading && !data;

  const act = async (id: string, fn: () => Promise<{ error?: string }>, ok: string) => {
    setBusyId(id);
    const res = await fn();
    setBusyId(null);
    if (res.error !== undefined) return toast(res.error, "error");
    toast(ok);
    refresh();
  };

  const askDelete = (m: LibraryMaterial) =>
    setConfirm({
      title: "Delete material?",
      message: `"${m.title}" will be removed from the Library${m.status === "published" ? " and students will no longer see it" : ""}.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        setConfirm(null);
        await act(m.id, () => deleteLibraryMaterial(m.id), "Material deleted");
      },
    });

  return (
    <div className="space-y-4">
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faBookOpen} className="h-4 w-4" />, label: "Library" }}
        title="Library"
        subtitle="Study materials for each Taylor's skill — demo videos, notes, handouts and slides your students open in the app"
      />

      {data && !data.enabled && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The Library needs database migration 061 before materials can be saved.
        </p>
      )}
      {data?.error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{data.error}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
        {/* Skill browser */}
        <aside className="bg-surface rounded-xl border border-hairline shadow-tile overflow-hidden lg:sticky lg:top-3">
          <div className="p-3 border-b border-hairline">
            <div className="relative">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Find a skill…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-surface border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
              />
            </div>
            {firstLoad ? (
              <div className="mt-2.5 h-3 w-36 animate-pulse rounded bg-gray-100" aria-hidden />
            ) : (
              <p className="mt-2 text-xs text-gray-500 tabular-nums">
                {materials.length} material{materials.length === 1 ? "" : "s"} · {published} published
              </p>
            )}
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {firstLoad && <SkeletonLibrarySkillList />}
            {chapters.map((c) => (
              <div key={c.chapter}>
                <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Chapter {c.chapter} · {c.area}
                </p>
                {c.skills.map((s) => {
                  const active = s.id === skillId;
                  const n = countBySkill.get(s.id) ?? 0;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setPicked(s.id)}
                      className={`w-full text-left px-3 py-2 flex items-start gap-2 text-sm transition-colors ${
                        active ? "bg-brand-600/10 text-brand-700" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="font-mono text-xs mt-0.5 w-10 shrink-0 text-gray-500">{s.id}</span>
                      <span className="flex-1 leading-snug">{s.title}</span>
                      {n > 0 && (
                        <span className="shrink-0 rounded-full bg-brand-600/15 text-brand-700 text-[11px] px-1.5 py-0.5 tabular-nums">{n}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        {/* The skill's materials */}
        <section className="space-y-4 min-w-0" aria-busy={firstLoad}>
          {firstLoad && <SkeletonLibraryMaterials />}
          {skill && (
            <div className="bg-surface rounded-xl border border-hairline shadow-tile p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-gray-500">Chapter {skill.chapter} · {skill.area}</p>
                <h2 className="font-semibold text-gray-900">
                  Skill {skill.id} · {skill.title}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {KINDS.map((k) => (
                  <button
                    key={k.kind}
                    onClick={() => setEditing({ material: null, kind: k.kind })}
                    disabled={data?.enabled === false}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:border-brand-600/40 hover:bg-brand-600/5 disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {skillMaterials.length === 0 && !loading && (
            <div className="bg-surface p-10 rounded-xl border border-hairline shadow-tile text-center text-sm text-gray-500">
              Nothing for this skill yet. Add a video, a note, a handout or slides above
              {skillSuggestions.length > 0 ? ", or publish one of the suggested demos below." : "."}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {skillMaterials.map((m) => (
              <MaterialCard
                key={m.id}
                material={m}
                busy={busyId === m.id}
                onPreview={() => setPreviewing(m)}
                onEdit={() => setEditing({ material: m, kind: m.kind })}
                onToggle={() =>
                  act(
                    m.id,
                    () => setLibraryMaterialStatus(m.id, m.status === "published" ? "unpublish" : "publish"),
                    m.status === "published" ? "Moved back to drafts" : "Published to students",
                  )
                }
                onDelete={() => askDelete(m)}
              />
            ))}
          </div>

          {skillSuggestions.length > 0 && (
            <div className="bg-surface rounded-xl border border-hairline shadow-tile p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faWandMagicSparkles} className="w-4 h-4 text-brand-600" />
                <h3 className="font-semibold text-gray-800 text-sm">Suggested demo videos</h3>
                <span className="text-xs text-gray-500">Curated for this skill — students see them only once you publish</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {skillSuggestions.map((s) => (
                  <div key={s.id} className="rounded-lg border border-hairline overflow-hidden flex flex-col">
                    <button onClick={() => setPreviewing(s)} className="relative aspect-video bg-gray-100 group" aria-label={`Preview ${s.title}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbUrl(s.youtube_id)} alt="" className="w-full h-full object-cover" loading="lazy" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/25 transition-colors">
                        <span className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                          <FontAwesomeIcon icon={faPlay} className="w-3.5 h-3.5 text-rose-600 ml-0.5" />
                        </span>
                      </span>
                    </button>
                    <div className="p-2.5 flex-1 flex flex-col gap-2">
                      <p className="text-sm text-gray-800 leading-snug line-clamp-2">{s.title}</p>
                      <p className="text-xs text-gray-500">{s.channel}</p>
                      <button
                        onClick={() => act(s.id, () => publishLibrarySuggestion(s.id, sections.map((x) => x.name)), "Published to your sections")}
                        disabled={busyId === s.id || data?.enabled === false}
                        className="mt-auto px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700 disabled:opacity-60"
                      >
                        {busyId === s.id ? "Publishing…" : "Publish to my sections"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {editing && skill && (
        <MaterialEditor
          skills={skills}
          sections={sections}
          initialSkill={editing.material?.skill_id ?? skill.id}
          kind={editing.kind}
          material={editing.material}
          onClose={() => setEditing(null)}
          onSaved={(skillSaved) => {
            setEditing(null);
            setPicked(skillSaved);
            refresh();
          }}
        />
      )}
      {previewing && <PreviewModal item={previewing} onClose={() => setPreviewing(null)} />}
      {confirm && <ConfirmModal config={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function MaterialCard({
  material: m,
  busy,
  onPreview,
  onEdit,
  onToggle,
  onDelete,
}: {
  material: LibraryMaterial;
  busy: boolean;
  onPreview: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const k = KIND[m.kind];
  const canEdit = m.mine !== false;
  return (
    <div className="bg-surface rounded-xl border border-hairline shadow-tile overflow-hidden flex flex-col">
      {m.kind === "video" && m.youtube_id ? (
        <button onClick={onPreview} className="relative aspect-video bg-gray-100 group" aria-label={`Play ${m.title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(m.youtube_id)} alt="" className="w-full h-full object-cover" loading="lazy" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/25 transition-colors">
            <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
              <FontAwesomeIcon icon={faPlay} className="w-4 h-4 text-rose-600 ml-0.5" />
            </span>
          </span>
        </button>
      ) : (
        <button onClick={onPreview} className="flex items-center gap-3 p-4 text-left hover:bg-gray-50 border-b border-hairline">
          <span className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${k.tint}`}>
            <FontAwesomeIcon icon={k.icon} className="w-4 h-4" />
          </span>
          <span className="text-sm text-gray-600 truncate">
            {m.kind === "link" ? m.url : m.kind === "note" ? plainText(m.body_md ?? "").slice(0, 90) : `${m.file_name ?? ""} ${formatSize(m.file_size)}`}
          </span>
        </button>
      )}
      <div className="p-4 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-800 leading-snug">{m.title}</h3>
          <span
            className={`shrink-0 px-2 py-0.5 text-xs rounded-full ${
              m.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
            }`}
          >
            {m.status === "published" ? "Published" : "Draft"}
          </span>
        </div>
        {m.description && <p className="text-sm text-gray-500 line-clamp-2">{m.description}</p>}
        <div className="flex flex-wrap gap-1.5">
          <span className={`px-2 py-0.5 rounded text-xs ${k.tint}`}>{k.label}</span>
          {(m.target_sections ?? []).map((s) => (
            <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Section {s}</span>
          ))}
          {!m.target_sections?.length && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">All sections</span>}
        </div>
        {m.mine === false && m.author_name && <p className="text-xs text-gray-500">By {m.author_name}</p>}
      </div>
      <div className="px-4 py-2.5 bg-subtle border-t border-hairline flex items-center gap-3 text-xs">
        <span className="text-gray-500 tabular-nums flex items-center gap-1">
          <FontAwesomeIcon icon={faEye} className="w-3 h-3" /> {m.views ?? 0} student{m.views === 1 ? "" : "s"}
        </span>
        <span className="flex-1" />
        {canEdit && (
          <>
            <button onClick={onToggle} disabled={busy} className="font-medium text-brand-700 hover:underline disabled:opacity-50">
              {m.status === "published" ? "Unpublish" : "Publish"}
            </button>
            <button onClick={onEdit} className="text-gray-500 hover:text-gray-800" aria-label="Edit">
              <FontAwesomeIcon icon={faPen} className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} disabled={busy} className="text-gray-500 hover:text-rose-600" aria-label="Delete">
              <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function MaterialEditor({
  skills,
  sections,
  initialSkill,
  kind: initialKind,
  material,
  onClose,
  onSaved,
}: {
  skills: LibrarySkill[];
  sections: Section[];
  initialSkill: string;
  kind: LibraryKind;
  material: LibraryMaterial | null;
  onClose: () => void;
  onSaved: (skillId: string) => void;
}) {
  const [kind, setKind] = useState<LibraryKind>(initialKind);
  const [skillId, setSkillId] = useState(initialSkill);
  const [title, setTitle] = useState(material?.title ?? "");
  const [description, setDescription] = useState(material?.description ?? "");
  const [youtube, setYoutube] = useState(material?.youtube_id ? `https://www.youtube.com/watch?v=${material.youtube_id}` : "");
  const [body, setBody] = useState(material?.body_md ?? "");
  const [notePreview, setNotePreview] = useState(false);
  const [url, setUrl] = useState(material?.url ?? "");
  const [file, setFile] = useState<{ file_path: string; file_name: string; file_size: number; mime_type: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(
    new Set(material?.target_sections?.length ? material.target_sections : sections.map((s) => s.name)),
  );
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const videoId = kind === "video" ? youTubeIdOf(youtube) : null;
  const keepsFile = material && material.kind === kind && (kind === "pdf" || kind === "slides") && !file;

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setProgress(0);
    const res = await uploadLibraryFile(f, setProgress);
    setProgress(null);
    if ("error" in res) return toast(res.error, "error");
    if (res.data.kind !== kind) setKind(res.data.kind);
    setFile({ file_path: res.data.file_path, file_name: res.data.file_name, file_size: res.data.file_size, mime_type: res.data.mime_type });
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  };

  const save = async (publish: boolean) => {
    if (chosen.size === 0 && sections.length > 0) return toast("Choose at least one section", "error");
    const input: LibraryMaterialInput = {
      skill_id: skillId,
      kind,
      title: title.trim(),
      description,
      target_sections: [...chosen],
      ...(kind === "video" ? { youtube_url: youtube } : {}),
      ...(kind === "note" ? { body_md: body } : {}),
      ...(kind === "link" ? { url } : {}),
      ...((kind === "pdf" || kind === "slides") && file ? file : {}),
    };
    if ((kind === "pdf" || kind === "slides") && !file && !keepsFile) return toast("Upload the file first", "error");
    setBusy(true);
    const res = material
      ? await updateLibraryMaterial(material.id, input).then(async (r) =>
          r.error === undefined && publish && material.status !== "published"
            ? setLibraryMaterialStatus(material.id, "publish")
            : r,
        )
      : await createLibraryMaterial({ ...input, publish });
    setBusy(false);
    if (res.error !== undefined) return toast(res.error, "error");
    toast(publish ? "Published to students" : material ? "Changes saved" : "Saved as a draft");
    onSaved(skillId);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-overlay w-full max-w-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto border border-hairline">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">{material ? "Edit material" : "Add material"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 p-1 bg-gray-100 rounded-lg">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              onClick={() => setKind(k.kind)}
              className={`flex-1 min-w-[96px] whitespace-nowrap flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                kind === k.kind ? "bg-surface text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <FontAwesomeIcon icon={k.icon} className="w-3 h-3" />
              {k.label}
            </button>
          ))}
        </div>

        <div>
          <label className={labelClassName} htmlFor="lib-skill">Skill</label>
          <select id="lib-skill" value={skillId} onChange={(e) => setSkillId(e.target.value)} className={inputClassName}>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                Skill {s.id} · {s.title}
              </option>
            ))}
          </select>
        </div>

        {kind === "video" && (
          <div className="space-y-2">
            <label className={labelClassName} htmlFor="lib-yt">YouTube link</label>
            <input
              id="lib-yt"
              value={youtube}
              onChange={(e) => setYoutube(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              className={inputClassName}
            />
            {videoId ? (
              <div className="aspect-video rounded-lg overflow-hidden bg-black">
                <iframe
                  src={embedUrl(videoId)}
                  title="Video preview"
                  className="w-full h-full"
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
            ) : (
              youtube && <p className="text-xs text-rose-600">That doesn&apos;t look like a YouTube video link.</p>
            )}
            <p className="text-xs text-gray-500">Students watch it inside the app. Leave the title empty to use the video&apos;s own.</p>
          </div>
        )}

        {kind === "note" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={labelClassName} htmlFor="lib-note">Note</label>
              <button onClick={() => setNotePreview((v) => !v)} className="text-xs font-medium text-brand-700 hover:underline">
                {notePreview ? "Edit" : "Preview"}
              </button>
            </div>
            {notePreview ? (
              <div className="prose-note min-h-[220px] rounded-xl border border-hairline p-4">
                <Markdown text={body || "_Nothing written yet._"} />
              </div>
            ) : (
              <textarea
                id="lib-note"
                rows={12}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={"## Key points\n- Perform hand hygiene before and after…\n\n**Common errors:** …"}
                className={`${inputClassName} font-mono text-[13px]`}
              />
            )}
            <p className="text-xs text-gray-500">Markdown: **bold**, _italic_, # headings, - lists, [links](https://…).</p>
          </div>
        )}

        {(kind === "pdf" || kind === "slides") && (
          <div className="space-y-2">
            <span className={labelClassName}>{kind === "pdf" ? "PDF handout" : "PowerPoint deck"}</span>
            <div
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void pickFile(e.dataTransfer.files[0]);
              }}
              className="cursor-pointer rounded-xl border-2 border-dashed border-gray-300 hover:border-brand-600/50 p-6 text-center"
            >
              <FontAwesomeIcon icon={KIND[kind].icon} className="w-6 h-6 text-gray-400" />
              <p className="mt-2 text-sm text-gray-700">
                {file
                  ? `${file.file_name} · ${formatSize(file.file_size)}`
                  : keepsFile
                    ? `${material?.file_name ?? "Current file"} — drop a file to replace it`
                    : "Drop a file here or click to choose"}
              </p>
              <p className="text-xs text-gray-500 mt-1">{kind === "pdf" ? "PDF" : ".pptx, .ppt or .ppsx"}, up to 50 MB</p>
              <input
                ref={fileInput}
                type="file"
                hidden
                accept={
                  kind === "pdf"
                    ? "application/pdf,.pdf"
                    : ".pptx,.ppt,.ppsx,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
                }
                onChange={(e) => void pickFile(e.target.files?.[0])}
              />
            </div>
            {progress !== null && (
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-brand-600 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
          </div>
        )}

        {kind === "link" && (
          <div>
            <label className={labelClassName} htmlFor="lib-url">Web address</label>
            <input id="lib-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={inputClassName} />
          </div>
        )}

        <div>
          <label className={labelClassName} htmlFor="lib-title">Title</label>
          <input id="lib-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={inputClassName} />
        </div>
        <div>
          <label className={labelClassName} htmlFor="lib-desc">Description (optional)</label>
          <textarea
            id="lib-desc"
            rows={2}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What to look for, when to review it…"
            className={inputClassName}
          />
        </div>

        <div>
          <span className={labelClassName}>Sections ({chosen.size} selected)</span>
          {sections.length === 0 ? (
            <p className="text-sm text-gray-500">You don&apos;t supervise a group in any section yet — ask your dean to assign you one.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sections.map((s) => {
                const on = chosen.has(s.name);
                return (
                  <button
                    key={s.id}
                    onClick={() =>
                      setChosen((prev) => {
                        const next = new Set(prev);
                        if (on) next.delete(s.name);
                        else next.add(s.name);
                        return next;
                      })
                    }
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      on ? "bg-brand-600 text-white border-brand-600" : "border-gray-300 text-gray-600 hover:border-brand-600/50"
                    }`}
                  >
                    Section {s.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-5 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
            Cancel
          </button>
          {material?.status !== "published" && (
            <button
              onClick={() => save(false)}
              disabled={busy || progress !== null}
              className="px-5 py-2 rounded-lg border border-brand-600 text-brand-700 text-sm hover:bg-brand-600/5 disabled:opacity-60"
            >
              Save draft
            </button>
          )}
          <button
            onClick={() => save(true)}
            disabled={busy || progress !== null}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : material?.status === "published" ? "Save" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="text-sm text-gray-800 leading-relaxed space-y-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-brand-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-gray-200 [&_blockquote]:pl-3 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function PreviewModal({ item, onClose }: { item: LibraryMaterial | LibrarySuggestion; onClose: () => void }) {
  const isMaterial = "kind" in item;
  const kind: LibraryKind = isMaterial ? item.kind : "video";
  const needsFile = isMaterial && (kind === "pdf" || kind === "slides");
  const { data, loading } = usePageData(needsFile ? `faculty:library:file:${item.id}` : null, () => fetchLibraryMaterial(item.id), {
    freshFor: 5 * 60 * 1000,
  });
  const file = data?.data?.file ?? null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-xl shadow-overlay w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-hairline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline">
          <h3 className="font-semibold text-gray-800 truncate">{item.title}</h3>
          <div className="flex items-center gap-3 shrink-0">
            {isMaterial && kind === "link" && item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 hover:underline flex items-center gap-1">
                Open <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="w-3 h-3" />
              </a>
            )}
            {file && (
              <a href={file.direct} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 hover:underline flex items-center gap-1">
                Download <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="w-3 h-3" />
              </a>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
              <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {kind === "video" && item.youtube_id && (
            <div className="aspect-video bg-black">
              <iframe
                src={`${embedUrl(item.youtube_id)}&autoplay=1`}
                title={item.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          )}
          {isMaterial && kind === "note" && (
            <div className="p-5">
              <Markdown text={item.body_md ?? ""} />
            </div>
          )}
          {isMaterial && kind === "link" && (
            <div className="p-5 text-sm text-gray-700 space-y-2">
              <p>Students open this page in an in-app browser:</p>
              <p className="font-mono text-xs break-all">{item.url}</p>
            </div>
          )}
          {needsFile &&
            (loading || !file ? (
              <p className="p-6 text-sm text-gray-500">{loading ? "Loading the file…" : "The file could not be opened."}</p>
            ) : (
              <iframe
                src={kind === "pdf" ? file.direct : file.embed}
                title={item.title}
                className="w-full h-[75vh] bg-white"
              />
            ))}
          {(isMaterial ? item.description : "") && <p className="px-5 py-3 text-sm text-gray-600 border-t border-hairline">{isMaterial ? item.description : ""}</p>}
        </div>
      </div>
    </div>
  );
}
