"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "../../components/PageHeader";

interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: "student" | "faculty" | "admin";
  created_at: string;
  last_login_at: string | null;
}

const roleLabels: Record<string, string> = {
  student: "Student",
  faculty: "Faculty",
  admin: "Administrator",
};

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function UsersClient() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "student" });
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "student" });

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users", { credentials: "include" });
    if (res.ok) {
      const json = (await res.json()) as { users: UserAccount[] };
      setUsers(json.users ?? []);
    }
  }, []);

  useEffect(() => {
    loadUsers().finally(() => setLoading(false));
  }, [loadUsers]);

  const handleCreateUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim()) {
      flash("Name and email are required");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(newUser),
    });
    setBusy(false);
    const json = (await res.json()) as {
      user?: UserAccount;
      password?: string;
      warning?: string;
      error?: string;
    };
    if (!res.ok || !json.user) {
      flash(json.error ?? "Failed to create user");
      return;
    }
    setUsers((prev) => [json.user!, ...prev]);
    setShowAddModal(false);
    setNewUser({ name: "", email: "", role: "student" });
    if (json.password) {
      setTempPassword({ email: json.user.email, password: json.password });
    }
    flash(json.warning ?? "User created");
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${editingUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(editForm),
    });
    setBusy(false);
    const json = (await res.json()) as { user?: UserAccount; error?: string };
    if (!res.ok || !json.user) {
      flash(json.error ?? "Failed to update user");
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === json.user!.id ? json.user! : u)));
    setEditingUser(null);
    flash("User updated");
  };

  const handleDeleteUser = async (user: UserAccount) => {
    if (!window.confirm(`Delete ${user.name} (${user.email})? This cannot be undone.`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      flash(json.error ?? "Failed to delete user");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    flash("User deleted");
  };

  const filteredUsers = users.filter(
    (u) => userRoleFilter === "all" || u.role === userRoleFilter,
  );

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        badge={{
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ),
          label: "User Management",
        }}
        title="User Management"
        subtitle="Manage user accounts, roles, and access permissions"
      />

      {message && (
        <div className="mb-4 bg-[#1B6B7B]/10 border border-[#1B6B7B]/30 text-[#155663] px-4 py-3 rounded-xl text-sm">
          {message}
        </div>
      )}

      {tempPassword && (
        <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-4">
          <span>
            Temporary password for <strong>{tempPassword.email}</strong>:{" "}
            <code className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200">{tempPassword.password}</code>{" "}
            — they will be asked to change it at first login.
          </span>
          <button
            onClick={() => setTempPassword(null)}
            className="text-amber-700 hover:text-amber-900 font-medium shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Users", count: users.length },
          { label: "Students", count: users.filter((u) => u.role === "student").length },
          { label: "Faculty", count: users.filter((u) => u.role === "faculty").length },
          { label: "Admins", count: users.filter((u) => u.role === "admin").length },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{stat.count}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <select
          value={userRoleFilter}
          onChange={(e) => setUserRoleFilter(e.target.value)}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/50 focus:border-[#1B6B7B] transition-all cursor-pointer"
        >
          <option value="all">All Roles</option>
          <option value="student">Student</option>
          <option value="faculty">Faculty</option>
          <option value="admin">Administrator</option>
        </select>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1B6B7B] text-white font-medium rounded-xl hover:bg-[#145a63] hover:shadow-lg transition-all duration-300 ml-auto"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50/50 border-b border-gray-200">
              <tr>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">User</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Role</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Created</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Last Login</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">
                    Loading users…
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">
                    No users found
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-full flex items-center justify-center text-[#1B6B7B] font-semibold">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{user.name}</p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="px-3 py-1 bg-[#1B6B7B]/10 text-[#1B6B7B] rounded-full text-sm font-medium">
                        {roleLabels[user.role] ?? user.role}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-gray-500">{formatDate(user.created_at)}</td>
                    <td className="py-4 px-6 text-gray-500">{formatDate(user.last_login_at)}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingUser(user);
                            setEditForm({ name: user.name, role: user.role });
                          }}
                          title="Edit"
                          className="p-2 text-gray-400 hover:text-[#1B6B7B] hover:bg-[#1B6B7B]/10 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          disabled={busy}
                          title="Delete"
                          className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New User</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B] focus:border-[#1B6B7B]"
                  placeholder="Juan dela Cruz"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B] focus:border-[#1B6B7B]"
                  placeholder="user@icare.edu"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B] focus:border-[#1B6B7B]"
                >
                  <option value="student">Student</option>
                  <option value="faculty">Faculty</option>
                  <option value="admin">Administrator</option>
                </select>
                <p className="text-xs text-gray-400 mt-2">
                  A temporary password is generated; students receive it by email, other roles are shown it here once.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={busy}
                className="px-4 py-2 bg-[#1B6B7B] text-white rounded-xl font-medium hover:bg-[#145a63] disabled:opacity-60 transition-all"
              >
                {busy ? "Creating…" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Edit User</h3>
            <p className="text-sm text-gray-500 mb-4">{editingUser.email}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B] focus:border-[#1B6B7B]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B] focus:border-[#1B6B7B]"
                >
                  <option value="student">Student</option>
                  <option value="faculty">Faculty</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={busy}
                className="px-4 py-2 bg-[#1B6B7B] text-white rounded-xl font-medium hover:bg-[#145a63] disabled:opacity-60 transition-all"
              >
                {busy ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
