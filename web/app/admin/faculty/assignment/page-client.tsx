"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Section {
  id: string;
  name: string;
}

interface Faculty {
  id: string;
  name: string;
  email: string;
  sections: Section[];
  student_count: number;
}

export default function AssignSectionsClient() {
  const router = useRouter();
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [newSectionName, setNewSectionName] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    const [facultyRes, sectionsRes] = await Promise.all([
      fetch("/api/admin/faculty", { credentials: "include" }),
      fetch("/api/sections", { credentials: "include" }),
    ]);
    let loaded: Faculty[] = [];
    if (facultyRes.ok) {
      const json = (await facultyRes.json()) as { faculty: Faculty[] };
      loaded = json.faculty ?? [];
      setFaculty(loaded);
    }
    if (sectionsRes.ok) {
      const json = (await sectionsRes.json()) as { sections: Section[] };
      setSections(json.sections ?? []);
    }
    return loaded;
  }, []);

  useEffect(() => {
    loadData()
      .then((loaded) => {
        if (loaded.length > 0) {
          setSelectedFaculty(loaded[0]);
          setSelectedSections(loaded[0].sections.map((s) => s.id));
        }
      })
      .finally(() => setLoading(false));
  }, [loadData]);

  const handleFacultySelect = (member: Faculty) => {
    if (hasChanges && !window.confirm("Discard unsaved section changes?")) return;
    setSelectedFaculty(member);
    setSelectedSections(member.sections.map((s) => s.id));
    setHasChanges(false);
  };

  const toggleSection = (sectionId: string) => {
    setSelectedSections((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId],
    );
    setHasChanges(true);
  };

  const facultyForSection = (sectionId: string): Faculty[] =>
    faculty.filter((f) => f.sections.some((s) => s.id === sectionId));

  const handleCreateSection = async () => {
    const name = newSectionName.trim();
    if (!name) return;
    setBusy(true);
    const res = await fetch("/api/admin/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    const json = (await res.json()) as { section?: Section; error?: string };
    if (!res.ok || !json.section) {
      flash(json.error ?? "Failed to create section");
      return;
    }
    setSections((prev) =>
      [...prev, json.section!].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setNewSectionName("");
    flash(`Section "${json.section.name}" created`);
  };

  const handleDeleteSection = async (section: Section) => {
    const handlers = facultyForSection(section.id);
    const warning =
      `Delete section "${section.name}"? Its students become unassigned` +
      (handlers.length > 0
        ? ` and it is removed from ${handlers.length} faculty member${handlers.length === 1 ? "" : "s"}.`
        : ".");
    if (!window.confirm(warning)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/sections/${section.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      flash(json.error ?? "Failed to delete section");
      return;
    }
    setSections((prev) => prev.filter((s) => s.id !== section.id));
    setFaculty((prev) =>
      prev.map((f) => ({ ...f, sections: f.sections.filter((s) => s.id !== section.id) })),
    );
    setSelectedSections((prev) => prev.filter((id) => id !== section.id));
    flash(`Section "${section.name}" deleted`);
  };

  const handleSave = async () => {
    if (!selectedFaculty) return;
    setBusy(true);
    const res = await fetch(`/api/admin/faculty/${selectedFaculty.id}/sections`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ section_ids: selectedSections }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      flash(json.error ?? "Failed to save sections");
      return;
    }
    const updatedSections = sections.filter((s) => selectedSections.includes(s.id));
    setFaculty((prev) =>
      prev.map((f) => (f.id === selectedFaculty.id ? { ...f, sections: updatedSections } : f)),
    );
    setHasChanges(false);
    flash(`Sections saved for ${selectedFaculty.name}`);
  };

  const handleBack = () => {
    if (hasChanges && !window.confirm("Discard unsaved section changes?")) return;
    router.push("/admin/faculty");
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sections</h1>
          <p className="text-gray-500">Manage sections and assign them to faculty</p>
        </div>
      </div>

      {message && (
        <div className="mb-4 bg-[#1B6B7B]/10 border border-[#1B6B7B]/30 text-[#155663] px-4 py-3 rounded-xl text-sm">
          {message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-[#1B6B7B] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-xl p-4 border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Sections</h2>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSection();
                  }}
                  maxLength={50}
                  placeholder="New section name (e.g. A)"
                  className="flex-1 min-w-0 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B] focus:border-[#1B6B7B]"
                />
                <button
                  onClick={handleCreateSection}
                  disabled={busy || !newSectionName.trim()}
                  className="px-4 py-2.5 bg-[#1B6B7B] text-white rounded-xl font-medium hover:bg-[#145a63] transition-all disabled:opacity-50 shrink-0"
                >
                  Add
                </button>
              </div>
              <div className="space-y-2">
                {sections.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6">
                    No sections yet — add one above
                  </p>
                ) : (
                  sections.map((section) => {
                    const handlers = facultyForSection(section.id);
                    return (
                      <div
                        key={section.id}
                        className="flex items-center gap-3 p-3 rounded-xl border border-gray-200"
                      >
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#1B6B7B]/10 text-[#1B6B7B] border border-[#1B6B7B]/20 shrink-0">
                          {section.name}
                        </span>
                        <p className="flex-1 text-sm text-gray-500 truncate">
                          {handlers.length === 0
                            ? "No faculty assigned"
                            : handlers.map((f) => f.name).join(", ")}
                        </p>
                        <button
                          onClick={() => handleDeleteSection(section)}
                          disabled={busy}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50 shrink-0"
                          aria-label={`Delete section ${section.name}`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Faculty Members</h2>
              {faculty.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">
                  No faculty accounts yet — create one from Faculty Management first
                </p>
              ) : (
                <div className="space-y-2">
                  {faculty.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => handleFacultySelect(member)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                        selectedFaculty?.id === member.id
                          ? "bg-[#1B6B7B] text-white"
                          : "hover:bg-gray-50 text-gray-800"
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold shrink-0 ${
                          selectedFaculty?.id === member.id
                            ? "bg-white/20 text-white"
                            : "bg-[#1B6B7B]/10 text-[#1B6B7B]"
                        }`}
                      >
                        {member.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{member.name}</p>
                        <p className={`text-sm truncate ${selectedFaculty?.id === member.id ? "text-white/70" : "text-gray-500"}`}>
                          {member.sections.length === 0
                            ? "No sections"
                            : member.sections.map((s) => s.name).join(", ")}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl p-4 border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedFaculty
                      ? `${selectedFaculty.name}'s Sections`
                      : "Select a faculty member"}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {selectedSections.length} of {sections.length} section
                    {sections.length !== 1 ? "s" : ""} selected
                  </p>
                </div>
                <button
                  onClick={handleSave}
                  disabled={busy || !hasChanges || !selectedFaculty}
                  className="px-5 py-2.5 bg-[#1B6B7B] text-white rounded-lg font-medium hover:bg-[#145a63] transition-all disabled:opacity-50 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
                >
                  {busy ? "Saving…" : "Save Sections"}
                </button>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {sections.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">
                    No sections yet — create one from the panel on the left
                  </p>
                ) : (
                  sections.map((section) => {
                    const others = facultyForSection(section.id).filter(
                      (f) => f.id !== selectedFaculty?.id,
                    );
                    return (
                      <label
                        key={section.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedSections.includes(section.id)
                            ? "border-[#1B6B7B] bg-[#1B6B7B]/5"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSections.includes(section.id)}
                          onChange={() => toggleSection(section.id)}
                          disabled={!selectedFaculty}
                          className="w-4 h-4 text-[#1B6B7B] rounded focus:ring-[#1B6B7B]"
                        />
                        <p className="flex-1 min-w-0 font-medium text-gray-800 truncate">
                          Section {section.name}
                        </p>
                        {others.length > 0 && (
                          <span className="text-xs text-gray-400 shrink-0">
                            Also with {others.map((f) => f.name).join(", ")}
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
