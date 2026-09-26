"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCopy,
  faKey,
  faMagnifyingGlass,
  faPencil,
  faPlus,
  faTrash,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { apiFetch, getCurrentUser } from "@/app/lib/api";
import { usePageData } from "@/app/lib/use-page-data";
import PageHeader from "../../components/PageHeader";
import FilterSelect from "../../components/FilterSelect";
import Avatar from "../../components/Avatar";

type Role = "student" | "faculty" | "admin" | "super_admin";

interface Account {
  id: string;
  name: string;
  email: string;
  role: Role;
  picture_url: string | null;
  sex: "male" | "female" | null;
  created_at: string;
  last_login_at: string | null;
  force_password_change: boolean;
  section_id: string | null;
  section_name: string | null;
  admin_id?: string | null;
}

interface Section {
  id: string;
  name: string;
}

interface AccountsPayload {
  users: Account[];
  sections: Section[];
  owner_enabled: boolean;
}

interface FormState {
  name: string;
  email: string;
  role: Role;
  sex: string;
  section_id: string;
  admin_id: string;
}

const EMPTY: AccountsPayload = { users: [], sections: [], owner_enabled: false };

const ROLES: { value: Role; label: string; plural: string }[] = [
  { value: "student", label: "Student", plural: "Students" },
  { value: "faculty", label: "Faculty", plural: "Faculty" },
  { value: "admin", label: "Administrator", plural: "Admins" },
  { value: "super_admin", label: "Super Administrator", plural: "Super admins" },
];

const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label])) as Record<Role, string>;

const ROLE_PILL: Record<Role, string> = {
  student: "bg-brand-600/10 text-brand-700",
  faculty: "bg-sky-500/10 text-sky-700",
  admin: "bg-amber-500/10 text-amber-700",
  super_admin: "bg-rose-500/10 text-rose-700",
};

const SEX_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "female", label: "Female (Ms.)" },
  { value: "male", label: "Male (Mr.)" },
];

const CARD =
  "bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]";
const INPUT =
  "w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-surface text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600";
const LABEL = "block text-sm font-medium text-gray-700 mb-1.5";

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function blankForm(): FormState {
  return { name: "", email: "", role: "student", sex: "", section_id: "", admin_id: "" };
}

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  return (await res.json().catch(() => ({}))) as T & { error?: string };
}

export default function SuperAdminUsersClient() {
  const me = getCurrentUser();
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  // One modal at a time: creating, editing an account, or showing a new password.
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [revealed, setRevealed] = useState<{ email: string; password: string; note?: string } | null>(null);

  const flash = (text: string, tone: "ok" | "error" = "ok") => {
    setMessage({ text, tone });
    setTimeout(() => setMessage(null), 5000);
  };

  const { data, loading, setData } = usePageData("super-admin:users", async () => {
    const res = await apiFetch("/api/super-admin/users");
    if (!res.ok) return EMPTY;
    return (await res.json()) as AccountsPayload;
  });
  const payload = data ?? EMPTY;
  const users = payload.users;
  const admins = users.filter((u) => u.role === "admin");

  const setUsers = (update: (previous: Account[]) => Account[]) =>
    setData((previous) => ({ ...(previous ?? EMPTY), users: update((previous ?? EMPTY).users) }));

  const counts = useMemo(() => {
    const byRole: Record<Role, number> = { student: 0, faculty: 0, admin: 0, super_admin: 0 };
    for (const u of users) if (u.role in byRole) byRole[u.role] += 1;
    return byRole;
  }, [users]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter(
      (u) =>
        (roleFilter === "all" || u.role === roleFilter) &&
        (!term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)),
    );
  }, [users, roleFilter, search]);

  const openCreate = () => {
    setForm(blankForm());
    setEditing("new");
  };

  const openEdit = (user: Account) => {
    setForm({
      name: user.name,
      email: user.email,
      role: user.role,
      sex: user.sex ?? "",
      section_id: user.section_id ?? "",
      admin_id: user.admin_id ?? "",
    });
    setEditing(user);
  };

  const handleSave = async () => {
    if (!editing) return;
    setBusy(true);
    const creating = editing === "new";
    const body: Record<string, unknown> = {
      name: form.name,
      role: form.role,
      sex: form.sex,
      section_id: form.role === "student" ? form.section_id || null : null,
      ...(payload.owner_enabled ? { admin_id: form.role === "faculty" ? form.admin_id || null : null } : {}),
      ...(creating ? { email: form.email } : {}),
    };
    const res = await apiFetch(creating ? "/api/super-admin/users" : `/api/super-admin/users/${editing.id}`, {
      method: creating ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await readJson<{ user?: Account; password?: string; warning?: string }>(res);
    setBusy(false);
    if (!res.ok || !json.user) {
      flash(json.error ?? "Could not save the account", "error");
      return;
    }
    const saved = json.user;
    setUsers((prev) => (creating ? [saved, ...prev] : prev.map((u) => (u.id === saved.id ? saved : u))));
    setEditing(null);
    if (creating && json.password) {
      setRevealed({
        email: saved.email,
        password: json.password,
        note:
          json.warning ??
          (saved.role === "student"
            ? "An invitation with this password was emailed to the student."
            : "Hand this temporary password over; it must be changed at first sign-in."),
      });
    } else {
      flash(
        !creating && editing.role !== saved.role
          ? "Account updated. The new role applies at their next sign-in."
          : "Account saved",
      );
    }
  };

  const handleReset = async (user: Account) => {
    if (!window.confirm(`Issue a new temporary password for ${user.name}? Their current password stops working.`)) return;
    setBusy(true);
    const res = await apiFetch(`/api/super-admin/users/${user.id}/password`, { method: "POST" });
    const json = await readJson<{ password?: string }>(res);
    setBusy(false);
    if (!res.ok || !json.password) {
      flash(json.error ?? "Could not reset the password", "error");
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, force_password_change: true } : u)));
    setRevealed({
      email: user.email,
      password: json.password,
      note: "They will be asked to choose a new password when they sign in.",
    });
  };

  const handleDelete = async (user: Account) => {
    if (!window.confirm(`Delete ${user.name} (${user.email})? This cannot be undone.`)) return;
    setBusy(true);
    const res = await apiFetch(`/api/super-admin/users/${user.id}`, { method: "DELETE" });
    const json = await readJson<{ success?: boolean }>(res);
    setBusy(false);
    if (!res.ok) {
      flash(json.error ?? "Could not delete the account", "error");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    flash("Account deleted");
  };

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faUsers} className="w-3.5 h-3.5" />, label: "Accounts" }}
        title="Users"
        subtitle="Every account in the system: create, edit roles, reset passwords and remove access"
        action={{
          icon: <FontAwesomeIcon icon={faPlus} className="w-3.5 h-3.5" />,
          onClick: openCreate,
          label: "Create a new account",
          text: "New account",
        }}
      />

      {message && (
        <div
          role="status"
          className={`mb-4 px-4 py-3 rounded-xl text-sm border ${
            message.tone === "ok"
              ? "bg-brand-600/10 border-brand-600/30 text-brand-800"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* The tiles double as the role filter. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        {[{ value: "all" as const, plural: "All accounts", count: users.length }, ...ROLES.map((r) => ({ ...r, count: counts[r.value] }))].map(
          (tile) => {
            const active = roleFilter === tile.value;
            return (
              <button
                key={tile.value}
                type="button"
                aria-pressed={active}
                onClick={() => setRoleFilter(tile.value)}
                className={`${CARD} text-left p-4 transition-colors ${
                  active ? "ring-2 ring-brand-600 border-transparent" : "hover:border-gray-300"
                }`}
              >
                <p className="text-2xl font-bold text-gray-800 tabular-nums">{loading ? "–" : tile.count}</p>
                <p className="text-xs text-gray-500">{tile.plural}</p>
              </button>
            );
          },
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="relative flex-1 min-w-[220px] max-w-md">
          <span className="sr-only">Search accounts</span>
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            className={`${INPUT} pl-10`}
          />
        </label>
        <FilterSelect value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "all" | Role)}>
          <option value="all">All roles</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </FilterSelect>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-subtle border-b border-gray-100">
              <tr>
                {["User", "Role", "Section / Owner", "Created", "Last sign-in", ""].map((h) => (
                  <th
                    key={h}
                    className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    Loading accounts…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    No accounts match
                  </td>
                </tr>
              ) : (
                visible.map((user) => {
                  const owner = user.admin_id ? admins.find((a) => a.id === user.admin_id)?.name : null;
                  const isMe = me?.id === user.id;
                  return (
                    <tr key={user.id} className="hover:bg-subtle transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={user.name} src={user.picture_url} userId={user.id} sex={user.sex} size="md" />
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 truncate">
                              {user.name}
                              {isMe && <span className="ml-1.5 text-xs font-normal text-gray-400">(you)</span>}
                            </p>
                            <p className="text-sm text-gray-500 truncate">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_PILL[user.role] ?? ""}`}>
                          {ROLE_LABEL[user.role] ?? user.role}
                        </span>
                        {user.force_password_change && (
                          <span className="ml-2 text-[11px] text-amber-700" title="Must set a new password at next sign-in">
                            temp password
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {user.role === "student"
                          ? (user.section_name ?? "No section")
                          : user.role === "faculty" && payload.owner_enabled
                            ? (owner ?? "No admin")
                            : "—"}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500 whitespace-nowrap">{formatDate(user.created_at)}</td>
                      <td className="py-3 px-4 text-sm text-gray-500 whitespace-nowrap">{formatDate(user.last_login_at)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton label="Edit" icon={faPencil} onClick={() => openEdit(user)} />
                          <IconButton
                            label="Reset password"
                            icon={faKey}
                            disabled={busy}
                            onClick={() => handleReset(user)}
                          />
                          <IconButton
                            label="Delete"
                            icon={faTrash}
                            danger
                            disabled={busy || isMe}
                            onClick={() => handleDelete(user)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal title={editing === "new" ? "New account" : "Edit account"} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <div>
              <label className={LABEL} htmlFor="acct-name">Full name</label>
              <input
                id="acct-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={INPUT}
              />
            </div>
            {editing === "new" ? (
              <div>
                <label className={LABEL} htmlFor="acct-email">Email</label>
                <input
                  id="acct-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={INPUT}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-500">{editing.email}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="acct-role">Role</label>
                <select
                  id="acct-role"
                  value={form.role}
                  disabled={editing !== "new" && editing.id === me?.id}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  className={INPUT}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor="acct-sex">Sex</label>
                <select
                  id="acct-sex"
                  value={form.sex}
                  onChange={(e) => setForm({ ...form, sex: e.target.value })}
                  className={INPUT}
                >
                  {SEX_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {form.role === "student" && (
              <div>
                <label className={LABEL} htmlFor="acct-section">Section</label>
                <select
                  id="acct-section"
                  value={form.section_id}
                  onChange={(e) => setForm({ ...form, section_id: e.target.value })}
                  className={INPUT}
                >
                  <option value="">No section</option>
                  {payload.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {form.role === "faculty" && payload.owner_enabled && (
              <div>
                <label className={LABEL} htmlFor="acct-owner">Belongs to admin</label>
                <select
                  id="acct-owner"
                  value={form.admin_id}
                  onChange={(e) => setForm({ ...form, admin_id: e.target.value })}
                  className={INPUT}
                >
                  <option value="">No admin</option>
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {editing === "new" && (
              <p className="text-xs text-gray-500">
                A temporary password is generated and must be changed at first sign-in. Students also get it by email.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="px-4 py-2 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : editing === "new" ? "Create account" : "Save changes"}
            </button>
          </div>
        </Modal>
      )}

      {revealed && (
        <Modal title="Temporary password" onClose={() => setRevealed(null)}>
          <p className="text-sm text-gray-500 mb-3">{revealed.email}</p>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-subtle border border-hairline">
            <code className="flex-1 font-mono text-lg text-gray-900 select-all break-all">{revealed.password}</code>
            <IconButton
              label="Copy"
              icon={faCopy}
              onClick={() => {
                void navigator.clipboard?.writeText(revealed.password);
                flash("Password copied");
              }}
            />
          </div>
          {revealed.note && <p className="text-sm text-gray-600 mt-3">{revealed.note}</p>}
          <p className="text-xs text-gray-400 mt-2">It won&apos;t be shown again.</p>
          <div className="flex justify-end mt-5">
            <button
              type="button"
              onClick={() => setRevealed(null)}
              className="px-4 py-2 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700"
            >
              Done
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: typeof faPencil;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`p-2 rounded-lg text-gray-400 transition-colors disabled:opacity-40 disabled:pointer-events-none ${
        danger ? "hover:text-rose-600 hover:bg-rose-50" : "hover:text-brand-600 hover:bg-brand-600/10"
      }`}
    >
      <FontAwesomeIcon icon={icon} className="w-4 h-4" />
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-surface rounded-xl p-5 w-full max-w-lg shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-hairline"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{title}</h3>
        {children}
      </div>
    </div>
  );
}
