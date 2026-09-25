"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCopy,
  faMagnifyingGlass,
  faTriangleExclamation,
  faUserSecret,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { refreshCurrentUser } from "@/app/lib/api";
import { clearRequestCache } from "@/app/lib/request-cache";
import { devFetch, type DevUser, type UserReference } from "./types";
import { EcgLoader } from "../components/EcgLoader";

const ROLES = ["student", "faculty", "admin"] as const;

interface Section {
  id: string;
  name: string;
}

function formatWhen(value: string | null): string {
  if (!value) return "never";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function UsersPanel() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<DevUser[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DevUser | null>(null);

  /** Debouncing narrows the window but does not close it: a slow early
   *  response can still land after a fast later one. */
  const request = useRef(0);

  const load = useCallback(async (search: string) => {
    const token = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const result = await devFetch<{ users: DevUser[] }>(
        `/api/dev/users?q=${encodeURIComponent(search)}`,
      );
      if (token !== request.current) return;
      setUsers(result.users);
    } catch (err) {
      if (token !== request.current) return;
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      if (token === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Typing a name should not fire a query per keystroke.
    const timer = setTimeout(() => void load(query), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, load]);

  useEffect(() => {
    // Read through the console's own table endpoint rather than /api/sections,
    // which is gated on faculty/admin — the developer need not be either.
    devFetch<{ rows: Section[] }>("/api/dev/tables/public/sections?limit=200&order=name")
      .then((result) => setSections(result.rows))
      .catch(() => setSections([]));
  }, []);

  const onChanged = (user: DevUser | null, id: string) => {
    setUsers((previous) =>
      user === null
        ? previous.filter((entry) => entry.id !== id)
        : previous.map((entry) => (entry.id === id ? user : entry)),
    );
    setSelected(user);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex items-center gap-3 border-b px-4 py-2.5"
          style={{ borderColor: "var(--dc-line)" }}
        >
          <div className="relative w-72">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2"
              style={{ color: "var(--dc-dim)" }}
            />
            <input
              className="dc-field pl-7"
              placeholder="Search name or email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <span className="text-[11.5px]" style={{ color: "var(--dc-dim)" }}>
            {loading ? "loading…" : `${users.length} shown${users.length === 100 ? " (capped)" : ""}`}
          </span>
        </header>

        <div className="dc-scroll min-h-0 flex-1 overflow-auto">
          {error ? (
            <p
              className="m-4 rounded-md border px-3 py-2.5 font-mono text-[11.5px]"
              style={{ borderColor: "#4a2730", background: "#1e1418", color: "var(--dc-danger)" }}
            >
              {error}
            </p>
          ) : (
            <table className="dc-grid">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Section</th>
                  <th>Sign-in</th>
                  <th>Last login</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => setSelected(user)}
                    style={
                      selected?.id === user.id
                        ? { background: "rgba(94,234,212,0.06)" }
                        : undefined
                    }
                  >
                    <td style={{ fontFamily: "inherit" }}>{user.name}</td>
                    <td>{user.email}</td>
                    <td>
                      <span
                        className="dc-tag"
                        style={
                          user.role === "admin"
                            ? { color: "var(--dc-warn)", borderColor: "#3d3117" }
                            : user.role === "faculty"
                              ? { color: "#93c5fd", borderColor: "#1e3352" }
                              : undefined
                        }
                      >
                        {user.role}
                      </span>
                    </td>
                    <td>
                      {user.section_name ?? <span className="dc-null">none</span>}
                    </td>
                    <td>
                      {[user.has_password && "password", user.google_sub && "google"]
                        .filter(Boolean)
                        .join(" + ") || <span className="dc-null">none</span>}
                    </td>
                    <td>{formatWhen(user.last_login_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {selected && (
        <UserDrawer
          key={selected.id}
          user={selected}
          sections={sections}
          admins={users.filter((entry) => entry.role === "admin")}
          onClose={() => setSelected(null)}
          onChanged={onChanged}
          onImpersonated={(home) => {
            clearRequestCache();
            // Mirror the target into localStorage before leaving, then load
            // the page outright — a router push would keep the developer's
            // cached reads and component state alive inside the new session.
            void refreshCurrentUser().then(() => window.location.assign(home));
          }}
        />
      )}
    </div>
  );
}

function UserDrawer({
  user,
  sections,
  admins,
  onClose,
  onChanged,
  onImpersonated,
}: {
  user: DevUser;
  sections: Section[];
  /** Admin accounts a faculty member can belong to. */
  admins: DevUser[];
  onClose: () => void;
  onChanged: (user: DevUser | null, id: string) => void;
  onImpersonated: (home: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [role, setRole] = useState(user.role);
  const [sectionId, setSectionId] = useState(user.section_id ?? "");
  const [adminId, setAdminId] = useState(user.admin_id ?? "");
  // Undefined before migration 053: there is no owner to set yet.
  const ownerEnabled = user.admin_id !== undefined;

  const [newPassword, setNewPassword] = useState("");
  const [forceChange, setForceChange] = useState(true);
  const [issued, setIssued] = useState<string | null>(null);

  const [references, setReferences] = useState<UserReference[] | null>(null);

  const dirty = useMemo(
    () =>
      role !== user.role ||
      sectionId !== (user.section_id ?? "") ||
      (ownerEnabled && adminId !== (user.admin_id ?? "")),
    [role, sectionId, adminId, ownerEnabled, user],
  );

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const saveRole = () =>
    run("role", async () => {
      const result = await devFetch<{ user: DevUser; warning?: string }>(
        `/api/dev/users/${user.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            role,
            section_id: sectionId || null,
            // Sent only when changed; a role change away from faculty clears it in the database.
            ...(ownerEnabled && role === "faculty" && adminId !== (user.admin_id ?? "")
              ? { admin_id: adminId || null }
              : {}),
          }),
        },
      );
      const section = sections.find((entry) => entry.id === sectionId);
      onChanged(
        {
          ...user,
          role: result.user.role,
          section_id: sectionId || null,
          section_name: section?.name ?? null,
          ...(ownerEnabled ? { admin_id: role === "faculty" ? adminId || null : null } : {}),
        },
        user.id,
      );
      setNote(result.warning ?? "Saved.");
    });

  const setPassword = () =>
    run("password", async () => {
      const result = await devFetch<{ password: string }>(
        `/api/dev/users/${user.id}/password`,
        {
          method: "POST",
          body: JSON.stringify({ password: newPassword || undefined, force_change: forceChange }),
        },
      );
      setIssued(result.password);
      setNewPassword("");
      onChanged({ ...user, has_password: true, force_password_change: forceChange }, user.id);
    });

  const loadReferences = () =>
    run("references", async () => {
      const result = await devFetch<{ references: UserReference[] }>(
        `/api/dev/users/${user.id}/references`,
      );
      setReferences(result.references);
    });

  const hardDelete = () =>
    run("delete", async () => {
      await devFetch(`/api/dev/users/${user.id}`, { method: "DELETE" });
      onChanged(null, user.id);
    });

  const impersonate = () =>
    run("impersonate", async () => {
      const result = await devFetch<{ home: string }>("/api/dev/impersonate", {
        method: "POST",
        body: JSON.stringify({ user_id: user.id }),
      });
      onImpersonated(result.home);
    });

  return (
    <aside
      className="dc-drawer dc-scroll flex w-[400px] shrink-0 flex-col overflow-y-auto border-l"
      style={{ borderColor: "var(--dc-line)", background: "var(--dc-panel)" }}
    >
      <header
        className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--dc-line)", background: "var(--dc-panel)" }}
      >
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{user.name}</p>
          <p className="truncate font-mono text-[11px]" style={{ color: "var(--dc-dim)" }}>
            {user.email}
          </p>
        </div>
        <button className="dc-btn dc-btn-ghost" onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="space-y-5 px-4 py-4">
        {error && (
          <p
            className="rounded-md border px-2.5 py-2 font-mono text-[11px] leading-relaxed"
            style={{ borderColor: "#4a2730", background: "#1e1418", color: "var(--dc-danger)" }}
          >
            {error}
          </p>
        )}
        {note && (
          <p
            className="rounded-md border px-2.5 py-2 text-[11.5px] leading-relaxed"
            style={{ borderColor: "#1e3352", background: "#0d1826", color: "#93c5fd" }}
          >
            {note}
          </p>
        )}

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11.5px]">
          {[
            ["id", user.id],
            ["created", formatWhen(user.created_at)],
            ["last login", formatWhen(user.last_login_at)],
            ["google", user.google_sub ? "linked" : "not linked"],
            [
              "password",
              user.has_password
                ? user.force_password_change
                  ? "set · must change"
                  : "set"
                : "none",
            ],
          ].map(([label, value]) => (
            <div key={label} className="contents">
              <dt style={{ color: "var(--dc-dim)" }}>{label}</dt>
              <dd className="truncate font-mono" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <Block title={ownerEnabled ? "Role, section & admin" : "Role & section"}>
          <div className="flex gap-2">
            <select
              className="dc-field"
              value={role}
              onChange={(event) => setRole(event.target.value as DevUser["role"])}
            >
              {ROLES.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
            <select
              className="dc-field"
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
            >
              <option value="">no section</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </div>
          {ownerEnabled && role === "faculty" && (
            <label className="mt-2 block text-[11.5px]" style={{ color: "var(--dc-dim)" }}>
              Belongs to admin
              <select
                className="dc-field mt-1"
                value={adminId}
                onChange={(event) => setAdminId(event.target.value)}
              >
                <option value="">no admin</option>
                {user.admin_id && !admins.some((admin) => admin.id === user.admin_id) && (
                  <option value={user.admin_id}>current admin (not in this list)</option>
                )}
                {admins.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="dc-btn dc-btn-accent mt-2"
            onClick={saveRole}
            disabled={!dirty || busy !== null}
          >
            {busy === "role" && <EcgLoader size="xs" />}
            Save
          </button>
        </Block>

        <Block title="Password">
          <input
            className="dc-field font-mono"
            placeholder="leave blank to generate one"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <label className="mt-2 flex items-center gap-2 text-[11.5px]" style={{ color: "var(--dc-dim)" }}>
            <input
              type="checkbox"
              checked={forceChange}
              onChange={(event) => setForceChange(event.target.checked)}
              style={{ accentColor: "var(--dc-accent)" }}
            />
            Require a change at next sign-in
          </label>
          <button className="dc-btn mt-2" onClick={setPassword} disabled={busy !== null}>
            {busy === "password" && (
              <EcgLoader size="xs" />
            )}
            {newPassword ? "Set this password" : "Generate and set"}
          </button>
          {issued && (
            <div
              className="mt-2 flex items-center gap-2 rounded-md border px-2.5 py-2"
              style={{ borderColor: "rgba(94,234,212,0.25)", background: "rgba(94,234,212,0.06)" }}
            >
              <code className="flex-1 break-all text-[12px]" style={{ color: "var(--dc-accent)" }}>
                {issued}
              </code>
              <button
                className="dc-btn dc-btn-ghost"
                onClick={() => void navigator.clipboard?.writeText(issued)}
                title="Copy"
              >
                <FontAwesomeIcon icon={faCopy} className="h-3 w-3" />
              </button>
            </div>
          )}
          {issued && (
            <p className="mt-1 text-[11px]" style={{ color: "var(--dc-dim)" }}>
              Shown once — it is hashed in the database and cannot be read back.
            </p>
          )}
        </Block>

        <Block title="Impersonate">
          <p className="mb-2 text-[11.5px] leading-relaxed" style={{ color: "var(--dc-dim)" }}>
            Browse the app as {user.name.split(" ")[0]}. Anything you do is recorded
            against their account, tagged with your email. A banner stays on screen
            until you return.
          </p>
          <button className="dc-btn" onClick={impersonate} disabled={busy !== null}>
            {busy === "impersonate" ? (
              <EcgLoader size="xs" />
            ) : (
              <FontAwesomeIcon icon={faUserSecret} className="h-3 w-3" />
            )}
            Sign in as this user
          </button>
        </Block>

        <Block title="Delete" danger>
          {references === null ? (
            <button className="dc-btn" onClick={loadReferences} disabled={busy !== null}>
              {busy === "references" && (
                <EcgLoader size="xs" />
              )}
              Show what this would take with it
            </button>
          ) : (
            <>
              {references.length === 0 ? (
                <p className="text-[11.5px]" style={{ color: "var(--dc-dim)" }}>
                  Nothing anywhere references this account.
                </p>
              ) : (
                <ul className="mb-2 space-y-1">
                  {references.map((reference) => (
                    <li
                      key={reference.constraint_name}
                      className="flex items-baseline justify-between gap-2 font-mono text-[11.5px]"
                    >
                      <span className="truncate">
                        {reference.child_table}.{reference.child_column}
                      </span>
                      <span
                        className="shrink-0"
                        style={{
                          color:
                            reference.delete_rule === "cascade"
                              ? "var(--dc-danger)"
                              : reference.delete_rule === "set null"
                                ? "var(--dc-warn)"
                                : "var(--dc-dim)",
                        }}
                      >
                        {reference.count ?? "?"} · {reference.delete_rule}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p
                className="mb-2 flex gap-1.5 text-[11px] leading-relaxed"
                style={{ color: "var(--dc-warn)" }}
              >
                <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-3 w-3 shrink-0" />
                Rules are read from the live database, not the migrations — verify
                before you commit to this.
              </p>
              <button className="dc-btn dc-btn-danger" onClick={hardDelete} disabled={busy !== null}>
                {busy === "delete" && (
                  <EcgLoader size="xs" />
                )}
                Delete {user.email} permanently
              </button>
            </>
          )}
        </Block>
      </div>
    </aside>
  );
}

function Block({
  title,
  danger,
  children,
}: {
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-lg border p-3"
      style={{
        borderColor: danger ? "#3a222a" : "var(--dc-line)",
        background: danger ? "#170f12" : "var(--dc-raise)",
      }}
    >
      <h3
        className="mb-2 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: danger ? "var(--dc-danger)" : "var(--dc-dim)" }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}
