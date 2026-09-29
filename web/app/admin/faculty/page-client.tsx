"use client";

import { apiFetch } from "@/app/lib/api";
import { usePageData } from "@/app/lib/use-page-data";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faPlus } from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import FilterSelect from "../../components/FilterSelect";
import Avatar from "../../components/Avatar";
import StatTile from "../../components/StatTile";
import ChangeEmailDialog from "../../components/ChangeEmailDialog";

interface SectionRef {
  id: string;
  name: string;
}

interface GroupRef {
  id: string;
  name: string;
  section_id: string;
  section_name: string;
  faculty_id: string | null;
  faculty_name: string | null;
  member_count: number;
}

interface Faculty {
  id: string;
  name: string;
  email: string;
  picture_url: string | null;
  sex: "male" | "female" | null;
  created_at: string;
  last_login_at: string | null;
  sections: SectionRef[];
  groups: GroupRef[];
  student_count: number;
}

// Stable empty fallbacks, so nothing downstream sees a new array each render.
const NO_FACULTY: Faculty[] = [];
const NO_SECTIONS: SectionRef[] = [];
const NO_GROUPS: GroupRef[] = [];

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function FacultyClient() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newFaculty, setNewFaculty] = useState({ name: "", email: "" });

  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [filterSection, setFilterSection] = useState("");
  const [changingEmail, setChangingEmail] = useState<Faculty | null>(null);

  const { data, loading, refresh: loadData, setData } = usePageData(
    "admin:faculty",
    async () => {
      const [facultyRes, sectionsRes] = await Promise.all([
        apiFetch("/api/admin/faculty", { credentials: "include" }),
        apiFetch("/api/sections", { credentials: "include" }),
      ]);
      const { faculty = NO_FACULTY, groups = NO_GROUPS } = facultyRes.ok
        ? ((await facultyRes.json()) as { faculty?: Faculty[]; groups?: GroupRef[] })
        : {};
      const sections = sectionsRes.ok
        ? ((await sectionsRes.json()) as { sections?: SectionRef[] }).sections ?? NO_SECTIONS
        : NO_SECTIONS;
      return { faculty, sections, groups };
    },
  );

  const faculty = data?.faculty ?? NO_FACULTY;
  const sections = data?.sections ?? NO_SECTIONS;
  const groups = data?.groups ?? NO_GROUPS;

  const filteredFaculty = faculty.filter((f) => {
    if (filterSection === "__none__") return f.groups.length === 0;
    if (filterSection && !f.sections.some((s) => s.id === filterSection)) return false;
    return true;
  });

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };


  const handleAddFaculty = async () => {
    if (!newFaculty.name.trim() || !newFaculty.email.trim()) {
      flash("Name and email are required");
      return;
    }
    setBusy(true);
    const res = await apiFetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...newFaculty, role: "faculty" }),
    });
    setBusy(false);
    const json = (await res.json()) as {
      user?: Omit<Faculty, "sections" | "groups" | "student_count">;
      password?: string;
      error?: string;
    };
    if (!res.ok || !json.user) {
      flash(json.error ?? "Failed to create instructor");
      return;
    }
    setData((previous) => ({
      faculty: [
        ...(previous?.faculty ?? []),
        { ...json.user!, sections: [], groups: [], student_count: 0 },
      ],
      sections: previous?.sections ?? NO_SECTIONS,
      groups: previous?.groups ?? NO_GROUPS,
    }));
    setShowAddModal(false);
    setNewFaculty({ name: "", email: "" });
    if (json.password) setTempPassword({ email: json.user.email, password: json.password });
    flash("Instructor account created");
  };

  const openAssignModal = (member: Faculty) => {
    setSelectedFaculty(member);
    setSelectedGroups(member.groups.map((g) => g.id));
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    );
  };

  const handleSaveAssignments = async () => {
    if (!selectedFaculty) return;
    setBusy(true);
    const res = await apiFetch(`/api/admin/faculty/${selectedFaculty.id}/groups`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ team_ids: selectedGroups }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      flash(json.error ?? "Failed to save groups");
      return;
    }
    setSelectedFaculty(null);
    flash("Groups updated");
    // Reload: a moved group changes another instructor's row too.
    await loadData();
  };

  const facultyWithoutGroups = faculty.filter((f) => f.groups.length === 0).length;

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faUsers} className="w-3.5 h-3.5" />,
          label: "Instructor Management",
        }}
        title="Instructors"
        subtitle="Manage instructor accounts and the groups they handle"
        action={{
          icon: <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />,
          onClick: () => setShowAddModal(true),
          label: "Add an instructor account",
          text: "Add Instructor",
        }}
      />

      {message && (
        <div className="mb-4 bg-brand-600/10 border border-brand-600/30 text-[#155663] px-4 py-3 rounded-xl text-sm">
          {message}
        </div>
      )}

      {tempPassword && (
        <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-4">
          <span>
            Temporary password for <strong>{tempPassword.email}</strong>:{" "}
            <code className="font-mono bg-surface px-2 py-0.5 rounded border border-amber-200">{tempPassword.password}</code>{" "}
            — share it with the faculty member; they must change it at first login.
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
        <StatTile icon={faUsers} value={faculty.length} label="Total Instructors" />
        <StatTile icon={faUsers} value={groups.length} label="Groups" />
        <StatTile icon={faUsers} value={facultyWithoutGroups} label="Instructors Without Groups" />
      </div>

      <div className="flex items-center gap-3 mb-3">
        <FilterSelect value={filterSection} onChange={(e) => setFilterSection(e.target.value)}>
          <option value="">All Sections</option>
          <option value="__none__">No Group</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>Section {s.name}</option>
          ))}
        </FilterSelect>

        {filterSection && (
          <button
            onClick={() => setFilterSection("")}
            className="text-xs text-brand-600 font-medium hover:underline ml-auto"
          >
            Clear filter
          </button>
        )}
      </div>

      <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-subtle border-b border-gray-100">
              <tr>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Instructor</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Groups</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Students</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Last Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
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
                    <td className="py-3 px-4">
                      <div className="flex gap-1.5">
                        <div className="h-5 w-20 rounded-full bg-gray-100" />
                        <div className="h-5 w-16 rounded-full bg-gray-100" />
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 w-8 rounded bg-gray-100" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 w-20 rounded bg-gray-100" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 w-24 rounded bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : filteredFaculty.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">
                    {filterSection ? "No instructors match the selected filter" : "No instructor accounts yet — add one to get started"}
                  </td>
                </tr>
              ) : (
                filteredFaculty.map((member) => (
                  <tr
                    key={member.id}
                    onClick={() => openAssignModal(member)}
                    className="hover:bg-subtle hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={member.name}
                          src={member.picture_url}
                          userId={member.id}
                          sex={member.sex}
                          size="md"
                        />
                        <div>
                          <p className="font-semibold text-gray-800">{member.name}</p>
                          <p className="text-sm text-gray-500">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {member.groups.length === 0 ? (
                        <span className="text-sm text-gray-400">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {member.groups.map((g) => (
                            <span
                              key={g.id}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-600/10 text-brand-600 border border-brand-600/20"
                            >
                              {g.section_name} · {g.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-gray-800 font-medium">{member.student_count}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{formatDate(member.created_at)}</td>
                    <td className="py-3 px-4 text-gray-600">{formatDate(member.last_login_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-4 w-full max-w-lg mx-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-hairline">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Instructor</h3>
            <div className="space-y-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={newFaculty.name}
                  onChange={(e) => setNewFaculty({ ...newFaculty, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
                  placeholder="Dr. Juan dela Cruz"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={newFaculty.email}
                  onChange={(e) => setNewFaculty({ ...newFaculty, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
                  placeholder="faculty@icare.edu"
                />
                <p className="text-xs text-gray-400 mt-2">
                  A temporary password is generated and shown here once; they must change it at first login.
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
                onClick={handleAddFaculty}
                disabled={busy}
                className="px-4 py-2 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-60 transition-all"
              >
                {busy ? "Creating…" : "Add Instructor"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedFaculty && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-4 w-full max-w-lg mx-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-hairline max-h-[80vh] overflow-hidden flex flex-col">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Assign Groups to {selectedFaculty.name}
              </h3>
              <p className="text-sm text-gray-500">
                This instructor handles the students in the checked groups. A group has one
                instructor, so checking another&apos;s group moves it here.
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 text-sm text-gray-600">
                <span className="truncate">{selectedFaculty.email}</span>
                <button
                  type="button"
                  onClick={() => setChangingEmail(selectedFaculty)}
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  Change email
                </button>
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {sections.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">
                  No sections yet — create them on the{" "}
                  <button
                    onClick={() => router.push("/admin/faculty/assignment")}
                    className="text-brand-600 font-medium hover:underline"
                  >
                    Sections page
                  </button>
                </p>
              ) : (
                sections.map((section) => {
                  const sectionGroups = groups.filter((g) => g.section_id === section.id);
                  return (
                    <div key={section.id}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Section {section.name}
                      </p>
                      {sectionGroups.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-gray-200 p-3 text-sm text-gray-400">
                          No groups yet — create them in{" "}
                          <button
                            onClick={() => router.push("/admin/student-management")}
                            className="text-brand-600 font-medium hover:underline"
                          >
                            Student Management
                          </button>
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {sectionGroups.map((group) => {
                            const checked = selectedGroups.includes(group.id);
                            // May be another dean's instructor when a section is shared.
                            const holder =
                              group.faculty_id && group.faculty_id !== selectedFaculty.id
                                ? (group.faculty_name ?? "another instructor")
                                : null;
                            return (
                              <label
                                key={group.id}
                                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                  checked
                                    ? "border-brand-600 bg-brand-600/5"
                                    : "border-gray-200 hover:border-gray-300"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleGroup(group.id)}
                                  className="w-4 h-4 text-brand-600 rounded focus:ring-brand-600"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-gray-800">{group.name}</p>
                                  <p className="text-xs text-gray-400">
                                    {group.member_count} student{group.member_count === 1 ? "" : "s"}
                                  </p>
                                </div>
                                {holder && (
                                  <span
                                    className={`text-xs shrink-0 ${checked ? "text-amber-600" : "text-gray-400"}`}
                                  >
                                    {checked ? `Moves from ${holder}` : `With ${holder}`}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                {selectedGroups.length} group{selectedGroups.length !== 1 ? "s" : ""} selected
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedFaculty(null)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAssignments}
                  disabled={busy}
                  className="px-4 py-2 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition-all disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save Groups"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {changingEmail && (
        <ChangeEmailDialog
          userId={changingEmail.id}
          currentEmail={changingEmail.email}
          whose="their"
          onClose={() => setChangingEmail(null)}
          onChanged={(email) => {
            const id = changingEmail.id;
            void loadData();
            setSelectedFaculty((prev) => (prev && prev.id === id ? { ...prev, email } : prev));
            setChangingEmail(null);
            flash(`Email changed to ${email}. The old address was notified.`);
          }}
        />
      )}
    </div>
  );
}
