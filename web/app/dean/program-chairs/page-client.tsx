"use client";

import { useState, type FormEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPenToSquare,
  faPlus,
  faSitemap,
  faTrashCan,
  faUserTie,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { apiFetch } from "@/app/lib/api";
import { usePageData } from "@/app/lib/use-page-data";
import PageHeader from "../../components/PageHeader";
import Avatar from "../../components/Avatar";
import StatTile from "../../components/StatTile";
import ActionsMenu from "../../components/ActionsMenu";
import ChangeEmailDialog from "../../components/ChangeEmailDialog";
import ConfirmModal from "../../components/ConfirmModal";
import GenderField from "../../components/GenderField";

interface ProgramChair {
  id: string;
  name: string;
  email: string;
  picture_url: string | null;
  sex: "male" | "female" | null;
  created_at: string;
  last_login_at: string | null;
  instructor_count: number;
  student_count: number;
}

// A stable empty fallback, so nothing downstream sees a new array each render.
const NO_CHAIRS: ProgramChair[] = [];

const INPUT =
  "w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600";
const COLUMN = "text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider";
const COLUMNS = ["Program Chair", "Instructors", "Students", "Added", "Last Login"];
const CONNECTION_ERROR = "Something went wrong. Check your connection and try again.";

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function byName(a: ProgramChair, b: ProgramChair) {
  return a.name.localeCompare(b.name);
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
      {message}
    </p>
  );
}

export default function ProgramChairsClient() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string; warning?: string } | null>(null);

  const [adding, setAdding] = useState(false);
  const [newChair, setNewChair] = useState({ name: "", email: "", sex: "" });
  const [addError, setAddError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ProgramChair | null>(null);
  const [editForm, setEditForm] = useState({ name: "", sex: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [changingEmail, setChangingEmail] = useState<ProgramChair | null>(null);

  const [deleting, setDeleting] = useState<ProgramChair | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, loading, error, refresh, setData } = usePageData("admin:program-chairs", async () => {
    const res = await apiFetch("/api/admin/program-chairs", { credentials: "include" });
    if (!res.ok) throw new Error(`Program Chairs failed to load (${res.status})`);
    return ((await res.json()) as { program_chairs: ProgramChair[] }).program_chairs;
  });

  const chairs = data ?? NO_CHAIRS;
  const failed = Boolean(error) && !data;

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

  const closeAdd = () => {
    setAdding(false);
    setAddError(null);
    setNewChair({ name: "", email: "", sex: "" });
  };

  const openEdit = (chair: ProgramChair) => {
    setEditing(chair);
    setEditForm({ name: chair.name, sex: chair.sex ?? "" });
    setEditError(null);
  };

  const openDelete = (chair: ProgramChair) => {
    setDeleting(chair);
    setDeleteError(null);
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (!newChair.name.trim() || !newChair.email.trim()) {
      setAddError("Name and email are required");
      return;
    }
    setBusy(true);
    setAddError(null);
    try {
      const res = await apiFetch("/api/admin/program-chairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newChair),
      });
      const json = (await res.json().catch(() => ({}))) as {
        user?: ProgramChair;
        password?: string;
        warning?: string;
        error?: string;
      };
      if (!res.ok || !json.user) {
        setAddError(json.error ?? "Unable to add this Program Chair");
        return;
      }
      const added = json.user;
      setData((previous) => [...(previous ?? []), added].sort(byName));
      closeAdd();
      // The password comes back only when the welcome email could not go out.
      if (json.password) {
        setTempPassword({ email: added.email, password: json.password, warning: json.warning });
        flash("Program Chair account created");
      } else {
        flash(`Program Chair account created. Their temporary password was emailed to ${added.email}.`);
      }
    } catch {
      setAddError(CONNECTION_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const name = editForm.name.trim();
    if (!name) {
      setEditError("Name is required");
      return;
    }
    // Nothing to save, so nothing for the audit log to record.
    if (name === editing.name && editForm.sex === (editing.sex ?? "")) {
      setEditing(null);
      return;
    }
    setBusy(true);
    setEditError(null);
    try {
      const res = await apiFetch(`/api/admin/program-chairs/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, sex: editForm.sex }),
      });
      const json = (await res.json().catch(() => ({}))) as { user?: ProgramChair; error?: string };
      if (!res.ok || !json.user) {
        setEditError(json.error ?? "Unable to save these changes");
        return;
      }
      const saved = json.user;
      setData((previous) => (previous ?? []).map((c) => (c.id === saved.id ? saved : c)).sort(byName));
      setEditing(null);
      flash("Program Chair account updated");
    } catch {
      setEditError(CONNECTION_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    setDeleteError(null);
    try {
      const res = await apiFetch(`/api/admin/program-chairs/${deleting.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setDeleteError(json.error ?? "Unable to delete this account");
        return;
      }
      const { id, name } = deleting;
      setData((previous) => (previous ?? []).filter((c) => c.id !== id));
      setDeleting(null);
      flash(`${name}'s account was deleted`);
    } catch {
      setDeleteError(CONNECTION_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faSitemap} className="w-3.5 h-3.5" />,
          label: "Program Chair Management",
        }}
        title="Program Chairs"
        subtitle="Each has their own instructors, students and wards. Only Deans can see this page."
      />

      {message && (
        <div className="mb-4 bg-brand-600/10 border border-brand-600/30 text-[#155663] px-4 py-3 rounded-xl text-sm">
          {message}
        </div>
      )}

      {tempPassword && (
        <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-4">
          <span>
            {tempPassword.warning && <span className="block mb-1">{tempPassword.warning}</span>}
            Temporary password for <strong>{tempPassword.email}</strong>:{" "}
            <code className="font-mono bg-surface px-2 py-0.5 rounded border border-amber-200">{tempPassword.password}</code>{" "}
            — they must change it at first login.
          </span>
          <button
            onClick={() => setTempPassword(null)}
            className="text-amber-700 hover:text-amber-900 font-medium shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <StatTile icon={faSitemap} value={failed ? "—" : chairs.length} label="Program Chairs" />
        <StatTile
          icon={faUserTie}
          value={failed ? "—" : chairs.reduce((sum, c) => sum + c.instructor_count, 0)}
          label="Their Instructors"
        />
        <StatTile
          icon={faUsers}
          value={failed ? "—" : chairs.reduce((sum, c) => sum + c.student_count, 0)}
          label="Their Students"
        />
      </div>

      <div className="mb-4">
        <button
          onClick={() => setAdding(true)}
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700"
        >
          <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
          Add Program Chair
        </button>
      </div>

      <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-subtle border-b border-gray-100">
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column} className={COLUMN}>{column}</th>
                ))}
                <th className="py-3 px-4">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse" aria-hidden>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 rounded-full bg-gray-100" />
                        <div className="space-y-1.5">
                          <div className="h-4 w-32 rounded bg-gray-100" />
                          <div className="h-3.5 w-44 rounded bg-gray-100" />
                        </div>
                      </div>
                    </td>
                    {[32, 32, 80, 96, 32].map((width, cell) => (
                      <td key={cell} className="py-3 px-4">
                        <div className="h-4 rounded bg-gray-100" style={{ width }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : failed ? (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="py-12 text-center text-gray-500">
                    Program Chairs couldn&apos;t be loaded.{" "}
                    <button onClick={() => void refresh()} className="font-medium text-brand-600 hover:underline">
                      Try again
                    </button>
                  </td>
                </tr>
              ) : chairs.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="py-12 text-center text-gray-400">
                    No Program Chairs yet — add one to get started
                  </td>
                </tr>
              ) : (
                chairs.map((chair) => (
                  <tr
                    key={chair.id}
                    onClick={() => openEdit(chair)}
                    className="hover:bg-subtle hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={chair.name} src={chair.picture_url} userId={chair.id} sex={chair.sex} size="md" />
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800">{chair.name}</p>
                          <p className="text-sm text-gray-500">{chair.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-800 font-medium">{chair.instructor_count}</td>
                    <td className="py-3 px-4 text-gray-800 font-medium">{chair.student_count}</td>
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{formatDate(chair.created_at)}</td>
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{formatDate(chair.last_login_at)}</td>
                    {/* The menu portals out, but its clicks still bubble here through React. */}
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <ActionsMenu
                          variant="compact"
                          label={`Actions for ${chair.name}`}
                          actions={[
                            { label: "Edit Account", icon: faPenToSquare, onClick: () => openEdit(chair) },
                            { label: "Delete Account", icon: faTrashCan, danger: true, onClick: () => openDelete(chair) },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form
            onSubmit={handleAdd}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-chair-title"
            className="bg-surface rounded-xl p-4 w-full max-w-lg mx-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-hairline"
          >
            <h3 id="add-chair-title" className="text-lg font-semibold text-gray-900 mb-4">Add New Program Chair</h3>
            <div className="space-y-2">
              <div>
                <label htmlFor="chair-name" className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  id="chair-name"
                  type="text"
                  autoFocus
                  value={newChair.name}
                  onChange={(e) => setNewChair({ ...newChair, name: e.target.value })}
                  className={INPUT}
                  placeholder="Dr. Juan dela Cruz"
                />
              </div>
              <GenderField
                id="chair-gender"
                value={newChair.sex}
                onChange={(sex) => setNewChair({ ...newChair, sex })}
              />
              <div>
                <label htmlFor="chair-email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  id="chair-email"
                  type="email"
                  value={newChair.email}
                  onChange={(e) => setNewChair({ ...newChair, email: e.target.value })}
                  className={INPUT}
                  placeholder="chair@icare.edu"
                />
                <p className="text-xs text-gray-400 mt-2">
                  They get a welcome email with a temporary password, which they must change at first login.
                </p>
              </div>
            </div>
            <FormError message={addError} />
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={closeAdd}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-60 transition-all"
              >
                {busy ? "Creating…" : "Add Program Chair"}
              </button>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form
            onSubmit={handleSaveEdit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-chair-title"
            className="bg-surface rounded-xl p-4 w-full max-w-lg mx-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-hairline"
          >
            <h3 id="edit-chair-title" className="text-lg font-semibold text-gray-900 mb-4">Edit Program Chair Account</h3>
            <div className="space-y-2">
              <div>
                <label htmlFor="edit-chair-name" className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  id="edit-chair-name"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={INPUT}
                />
              </div>
              <GenderField
                id="edit-chair-gender"
                value={editForm.sex}
                onChange={(sex) => setEditForm({ ...editForm, sex })}
              />
              <div>
                <p className="block text-sm font-medium text-gray-700 mb-2">Email</p>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-subtle px-4 py-2.5">
                  <span className="min-w-0 truncate text-gray-800">{editing.email}</span>
                  <button
                    type="button"
                    onClick={() => setChangingEmail(editing)}
                    className="shrink-0 text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Change Email
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  A code goes to the new address, and the change happens once it is entered.
                </p>
              </div>
            </div>
            <FormError message={editError} />
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-60 transition-all"
              >
                {busy ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <ConfirmModal
          onClose={() => setDeleting(null)}
          config={{
            title: `Delete ${deleting.name}'s account?`,
            message: `${deleting.email} will no longer be able to sign in. This cannot be undone. An account that still has instructors, students or records can't be deleted.`,
            confirmLabel: "Delete Account",
            loading: busy,
            error: deleteError,
            onConfirm: () => void handleDelete(),
          }}
        />
      )}

      {changingEmail && (
        <ChangeEmailDialog
          userId={changingEmail.id}
          currentEmail={changingEmail.email}
          whose="their"
          onClose={() => setChangingEmail(null)}
          onChanged={(email) => {
            const id = changingEmail.id;
            setData((previous) => (previous ?? []).map((c) => (c.id === id ? { ...c, email } : c)));
            setEditing((previous) => (previous && previous.id === id ? { ...previous, email } : previous));
            setChangingEmail(null);
            flash(`Email changed to ${email}. The old address was notified.`);
          }}
        />
      )}
    </div>
  );
}
