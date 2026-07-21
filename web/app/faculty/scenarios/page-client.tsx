"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRobot,
  faPlus,
  faSearch,
  faFilter,
  faTimes,
  faSpinner,
  faEye,
  faUserPlus,
  faBookOpen,
  faListCheck,
  faHeartbeat,
  faStethoscope,
  faCalendarDay,
  faGraduationCap,
  faHospitalUser,
  faNotesMedical,
  faBolt,
  faExclamationTriangle,
  faUsers,
  faCheck,
  faUser,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchFacultyScenarios,
  createScenario,
  updateScenario,
  generateAIScenario,
  suggestAIScenario,
  SimulationScenario,
  fetchFacultyStudents,
  FacultyStudent,
  assignScenarioToStudents,
  logAuditAction,
  getCurrentFacultyUser,
  fetchFacultyPatients,
  FacultyPatient,
} from "../../lib/api";
import { SkeletonInlineStatCard, SkeletonScenarioCard } from "../../components/skeletons";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";
import Card from "../../components/Card";

const emptyCreateForm = {
  title: "",
  description: "",
  difficulty: "intermediate" as "beginner" | "intermediate" | "advanced",
  category: "",
  learningObjectives: "",
  patientId: "",
};

const inputClassName =
  "w-full px-4 py-3 bg-white border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] focus:bg-white transition-all text-sm shadow-sm";

const labelClassName = "block text-sm font-bold text-gray-800 mb-2";

export default function FacultyScenariosClient() {
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [creating, setCreating] = useState(false);

  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [patientSearchQuery, setPatientSearchQuery] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiPreview, setAiPreview] = useState<Partial<SimulationScenario> | null>(null);
  const [savingAIPreview, setSavingAIPreview] = useState(false);
  const [suggestDifficulty, setSuggestDifficulty] = useState("");
  const [suggestCategory, setSuggestCategory] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [patients, setPatients] = useState<FacultyPatient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<SimulationScenario | null>(null);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [students, setStudents] = useState<FacultyStudent[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [assignDeadline, setAssignDeadline] = useState("");
  const [assignRequired, setAssignRequired] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [showLinkPatientModal, setShowLinkPatientModal] = useState(false);
  const [linkPatientTarget, setLinkPatientTarget] = useState<SimulationScenario | null>(null);
  const [linkPatientId, setLinkPatientId] = useState("");
  const [linkPatientSearchQuery, setLinkPatientSearchQuery] = useState("");
  const [savingPatientLink, setSavingPatientLink] = useState(false);

  const loadStudents = useCallback(async () => {
    const data = await fetchFacultyStudents();
    setStudents(data);
  }, []);

  const loadScenarios = useCallback(async () => {
    setLoading(true);
    const data = await fetchFacultyScenarios();
    setScenarios(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function init() {
      await loadScenarios();
      if (mounted) await loadStudents();
    }
    void init();
    return () => {
      mounted = false;
    };
  }, [loadScenarios, loadStudents]);

  const loadPatientsForSelector = async () => {
    setLoadingPatients(true);
    const data = await fetchFacultyPatients();
    setPatients(data);
    setLoadingPatients(false);
  };

  const categories = useMemo(
    () => Array.from(new Set(scenarios.map((s) => s.category).filter(Boolean))),
    [scenarios],
  );

  const filteredScenarios = useMemo(() => {
    return scenarios.filter((scenario) => {
      const matchesSearch =
        scenario.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        scenario.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        scenario.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDifficulty =
        difficultyFilter === "all" || scenario.difficulty === difficultyFilter;
      const matchesCategory = categoryFilter === "all" || scenario.category === categoryFilter;
      return matchesSearch && matchesDifficulty && matchesCategory;
    });
  }, [scenarios, searchQuery, difficultyFilter, categoryFilter]);

  const filteredPatients = useMemo(() => {
    const q = patientSearchQuery.toLowerCase();
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.diagnosis.toLowerCase().includes(q) ||
        (p.mimic_id || "").toLowerCase().includes(q) ||
        p.room_number.toLowerCase().includes(q),
    );
  }, [patients, patientSearchQuery]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) || null,
    [patients, selectedPatientId],
  );

  const linkModalFilteredPatients = useMemo(() => {
    const q = linkPatientSearchQuery.toLowerCase();
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.diagnosis.toLowerCase().includes(q) ||
        (p.mimic_id || "").toLowerCase().includes(q) ||
        p.room_number.toLowerCase().includes(q),
    );
  }, [patients, linkPatientSearchQuery]);

  const linkPatientSelected = useMemo(
    () => patients.find((p) => p.id === linkPatientId) || null,
    [patients, linkPatientId],
  );

  const handleCreateScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) return;

    setCreating(true);
    const newScenario = await createScenario({
      title: createForm.title,
      description: createForm.description,
      difficulty: createForm.difficulty,
      category: createForm.category || "General",
      patient_id: createForm.patientId || null,
      learning_objectives: createForm.learningObjectives
        .split("\n")
        .map((o) => o.trim())
        .filter(Boolean),
    });

    if (newScenario) {
      setScenarios([newScenario, ...scenarios]);
      const faculty = getCurrentFacultyUser();
      if (faculty) {
        logAuditAction({
          faculty_id: faculty.id,
          faculty_name: faculty.name,
          tab: "scenarios",
          action: "create_scenario",
          details: `Created scenario: ${newScenario.title}`,
          target_type: "scenario",
          target_id: newScenario.id,
          metadata: { scenario_title: newScenario.title },
        });
      }
    }
    setCreating(false);
    setShowCreateModal(false);
    setCreateForm(emptyCreateForm);
  };

  const handleGenerateAI = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    setAiPreview(null);
    setAiError(null);

    const preview = await generateAIScenario(aiPrompt, selectedPatientId || undefined);

    if ("error" in preview) {
      setAiError(preview.error);
    } else {
      setAiPreview(preview);
    }
    setGenerating(false);
  };

  const handleSuggestAI = async () => {
    setSuggesting(true);
    setAiPreview(null);
    setAiError(null);

    const result = await suggestAIScenario(
      suggestDifficulty || undefined,
      suggestCategory || undefined,
      selectedPatientId || undefined,
    );

    if ("error" in result) {
      setAiError(result.error);
    } else {
      setAiPrompt(result.prompt);
      setSelectedPatientId(result.patient_id);
      setAiPreview(result.scenario);
    }
    setSuggesting(false);
  };

  const handleSaveAIPreview = async () => {
    if (!aiPreview) return;
    setSavingAIPreview(true);

    const newScenario = await createScenario({
      title: aiPreview.title,
      description: aiPreview.description,
      difficulty: aiPreview.difficulty,
      category: aiPreview.category,
      patient_case: aiPreview.patient_case,
      patient_id: selectedPatientId || null,
      learning_objectives: aiPreview.learning_objectives,
      is_ai_generated: true,
    });

    if (newScenario) {
      setScenarios([newScenario, ...scenarios]);
      const faculty = getCurrentFacultyUser();
      if (faculty) {
        logAuditAction({
          faculty_id: faculty.id,
          faculty_name: faculty.name,
          tab: "scenarios",
          action: "ai_generate_scenario",
          details: `AI generated and saved scenario: ${newScenario.title}`,
          target_type: "scenario",
          target_id: newScenario.id,
          metadata: {
            scenario_title: newScenario.title,
            patient_id: selectedPatientId || null,
          },
        });
      }
    }

    setSavingAIPreview(false);
    setShowAIModal(false);
    setAiPreview(null);
    setAiPrompt("");
    setSelectedPatientId("");
    setPatientSearchQuery("");
  };

  const closeAIModal = () => {
    setShowAIModal(false);
    setAiPreview(null);
    setAiPrompt("");
    setSelectedPatientId("");
    setPatientSearchQuery("");
    setSuggestDifficulty("");
    setSuggestCategory("");
    setAiError(null);
  };

  const openAIModal = () => {
    setAiPrompt("");
    setSelectedPatientId("");
    setPatientSearchQuery("");
    setAiPreview(null);
    setSuggestDifficulty("");
    setSuggestCategory("");
    setAiError(null);
    setShowAIModal(true);
    void loadPatientsForSelector();
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "advanced":
        return "bg-rose-100 text-rose-700 border-rose-200";
      case "intermediate":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "beginner":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const difficultyBar: Record<string, string> = {
    advanced: "bg-rose-500",
    intermediate: "bg-amber-500",
    beginner: "bg-emerald-500",
  };

  const getDifficultyIcon = (difficulty: string) => {
    switch (difficulty) {
      case "advanced":
        return faExclamationTriangle;
      case "beginner":
        return faGraduationCap;
      default:
        return faBookOpen;
    }
  };

  const handleViewDetails = (scenario: SimulationScenario) => {
    setSelectedScenario(scenario);
    setShowDetailsModal(true);
  };

  const handleOpenAssignModal = (scenario: SimulationScenario) => {
    setSelectedScenario(scenario);
    setSelectedStudents([]);
    setAssignDeadline("");
    setAssignRequired(false);
    setStudentSearchQuery("");
    setShowAssignModal(true);
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId],
    );
  };

  const handleAssignScenario = async () => {
    if (!selectedScenario || selectedStudents.length === 0 || !assignDeadline) return;

    setAssigning(true);
    const assignments = await assignScenarioToStudents(
      selectedScenario.id,
      selectedStudents,
      assignDeadline,
      assignRequired,
    );

    if (assignments.length > 0) {
      await loadScenarios();
      const faculty = getCurrentFacultyUser();
      if (faculty) {
        logAuditAction({
          faculty_id: faculty.id,
          faculty_name: faculty.name,
          tab: "scenarios",
          action: "assign_scenario",
          details: `Assigned scenario "${selectedScenario.title}" to ${selectedStudents.length} student(s)`,
          target_type: "scenario",
          target_id: selectedScenario.id,
          metadata: {
            scenario_title: selectedScenario.title,
            student_count: selectedStudents.length,
            required: assignRequired,
          },
        });
      }
    }

    setAssigning(false);
    setShowAssignModal(false);
    setSelectedScenario(null);
    setSelectedStudents([]);
    setStudentSearchQuery("");
  };

  const handleOpenLinkPatientModal = (scenario: SimulationScenario) => {
    setLinkPatientTarget(scenario);
    setLinkPatientId(scenario.patient_id || "");
    setLinkPatientSearchQuery("");
    setShowLinkPatientModal(true);
    if (patients.length === 0) void loadPatientsForSelector();
  };

  const closeLinkPatientModal = () => {
    setShowLinkPatientModal(false);
    setLinkPatientTarget(null);
    setLinkPatientId("");
    setLinkPatientSearchQuery("");
  };

  const handleSavePatientLink = async () => {
    if (!linkPatientTarget) return;

    setSavingPatientLink(true);
    const updated = await updateScenario(linkPatientTarget.id, {
      patient_id: linkPatientId || null,
    });

    if (updated) {
      await loadScenarios();
      const faculty = getCurrentFacultyUser();
      if (faculty) {
        logAuditAction({
          faculty_id: faculty.id,
          faculty_name: faculty.name,
          tab: "scenarios",
          action: "link_scenario_patient",
          details: linkPatientId
            ? `Linked scenario "${linkPatientTarget.title}" to a patient`
            : `Unlinked patient from scenario "${linkPatientTarget.title}"`,
          target_type: "scenario",
          target_id: linkPatientTarget.id,
          metadata: { scenario_title: linkPatientTarget.title, patient_id: linkPatientId || null },
        });
      }
    }

    setSavingPatientLink(false);
    closeLinkPatientModal();
  };

  const filteredStudents = students.filter(
    (student) =>
      student.name.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
      student.email.toLowerCase().includes(studentSearchQuery.toLowerCase()),
  );

  const selectClassName =
    "w-full px-4 py-3 bg-white border border-gray-400 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] focus:bg-white transition-all text-sm appearance-none shadow-sm cursor-pointer";

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faNotesMedical} className="w-3.5 h-3.5" />,
          label: "Simulation Scenarios",
        }}
        title="Simulation Scenarios"
        subtitle="Manage clinical simulation scenarios for student training"
      />

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonInlineStatCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <StatTile
            icon={<FontAwesomeIcon icon={faNotesMedical} className="w-5 h-5" />}
            value={scenarios.length}
            label="Total Scenarios"
            iconBg="bg-[#1B6B7B]/10"
            iconColor="text-[#1B6B7B]"
          />
          <StatTile
            icon={<FontAwesomeIcon icon={faRobot} className="w-5 h-5" />}
            value={scenarios.filter((s) => s.is_ai_generated).length}
            label="AI Generated"
            iconBg="bg-purple-50"
            iconColor="text-purple-600"
          />
          <StatTile
            icon={<FontAwesomeIcon icon={faUsers} className="w-5 h-5" />}
            value={scenarios.reduce((sum, s) => sum + s.student_count, 0)}
            label="Students Assigned"
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-4">
        <div className="relative w-full lg:w-96">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
          />
          <input
            type="text"
            placeholder="Search scenarios..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={inputClassName + " pl-10"}
          />
        </div>
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="relative flex-1 lg:flex-none">
            <FontAwesomeIcon
              icon={faFilter}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            />
            <select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              className={selectClassName + " pl-10 pr-10 w-full lg:w-44"}
            >
              <option value="all">All Difficulties</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
            <FontAwesomeIcon
              icon={faChevronDown}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
            />
          </div>
          <div className="relative flex-1 lg:flex-none">
            <FontAwesomeIcon
              icon={faHospitalUser}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={selectClassName + " pl-10 pr-10 w-full lg:w-48"}
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <FontAwesomeIcon
              icon={faChevronDown}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1B6B7B] text-white font-medium rounded-lg hover:bg-[#145a63] transition-all shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
            >
              <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
              Create Scenario
            </button>
            <button
              onClick={openAIModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/20"
            >
              <FontAwesomeIcon icon={faRobot} className="w-4 h-4" />
              AI Generate
            </button>
          </div>
        </div>
      </div>

      {/* Scenarios Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonScenarioCard key={i} />
          ))}
        </div>
      ) : filteredScenarios.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-12 text-center">
          <FontAwesomeIcon icon={faNotesMedical} className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700">No scenarios found</h3>
          <p className="text-gray-500 text-sm mt-1">
            {searchQuery || difficultyFilter !== "all" || categoryFilter !== "all"
              ? "Try adjusting your filters."
              : "Create or generate your first scenario."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredScenarios.map((scenario) => (
            <div
              key={scenario.id}
              className="group relative bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200 overflow-hidden flex flex-col"
            >
              <span
                className={`absolute left-0 top-0 h-full w-0.5 ${difficultyBar[scenario.difficulty] ?? "bg-gray-500"}`}
                aria-hidden
              />
              <div className="p-3 border-b border-gray-100/80 flex-1">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 line-clamp-2 pr-2">
                    {scenario.title}
                  </h3>
                  {scenario.is_ai_generated && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full flex items-center gap-1 whitespace-nowrap">
                      <FontAwesomeIcon icon={faRobot} className="w-3 h-3" />
                      AI
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 mb-4">{scenario.description}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1 ${getDifficultyColor(
                      scenario.difficulty,
                    )}`}
                  >
                    <FontAwesomeIcon
                      icon={getDifficultyIcon(scenario.difficulty)}
                      className="w-3 h-3"
                    />
                    {scenario.difficulty}
                  </span>
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
                    {scenario.category}
                  </span>
                  {scenario.patient_name && (
                    <span className="px-2.5 py-1 bg-teal-50 text-teal-700 text-xs font-medium rounded-full flex items-center gap-1">
                      <FontAwesomeIcon icon={faUsers} className="w-3 h-3" />
                      {scenario.patient_name}
                    </span>
                  )}
                </div>
              </div>
              <div className="p-5 bg-gray-50/50">
                <div className="flex items-center justify-between text-sm mb-4">
                  <span className="text-gray-500 flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faUsers} className="w-3.5 h-3.5" />
                    {scenario.student_count} students
                  </span>
                  <span className="text-gray-400 flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faCalendarDay} className="w-3.5 h-3.5" />
                    {new Date(scenario.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleViewDetails(scenario)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-[#1B6B7B] font-medium hover:text-[#145a63] transition-colors py-2 rounded-lg hover:bg-[#1B6B7B]/5"
                  >
                    <FontAwesomeIcon icon={faEye} className="w-4 h-4" />
                    View
                  </button>
                  <button
                    onClick={() => handleOpenAssignModal(scenario)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-[#1B6B7B] font-medium hover:text-[#145a63] transition-colors py-2 rounded-lg hover:bg-[#1B6B7B]/5"
                  >
                    <FontAwesomeIcon icon={faUserPlus} className="w-4 h-4" />
                    Assign
                  </button>
                  <button
                    onClick={() => handleOpenLinkPatientModal(scenario)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-[#1B6B7B] font-medium hover:text-[#145a63] transition-colors py-2 rounded-lg hover:bg-[#1B6B7B]/5"
                  >
                    <FontAwesomeIcon icon={faHospitalUser} className="w-4 h-4" />
                    {scenario.patient_name ? "Patient" : "Link Patient"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Scenario Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-200/80">
            <div className="p-4 border-b border-gray-100/80 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-lg flex items-center justify-center">
                  <FontAwesomeIcon icon={faPlus} className="text-[#1B6B7B] w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Create Scenario</h3>
                  <p className="text-sm text-gray-500">Build a custom clinical case</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreateScenario} className="p-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className={labelClassName}>Title</label>
                <input
                  required
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="e.g. Acute MI Response"
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName}>Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Brief overview of the scenario..."
                  rows={3}
                  className={inputClassName + " resize-none"}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClassName}>Difficulty</label>
                  <div className="relative">
                    <select
                      value={createForm.difficulty}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          difficulty: e.target.value as typeof createForm.difficulty,
                        })
                      }
                      className={selectClassName + " pr-10"}
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                    <FontAwesomeIcon
                      icon={faChevronDown}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClassName}>Category</label>
                  <div className="relative">
                    <select
                      value={createForm.category}
                      onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                      className={selectClassName + " pr-10"}
                    >
                      <option value="">Select category</option>
                      <option value="Cardiac Emergency">Cardiac Emergency</option>
                      <option value="Respiratory Emergency">Respiratory Emergency</option>
                      <option value="Neurological Emergency">Neurological Emergency</option>
                      <option value="Trauma">Trauma</option>
                      <option value="Medical-Surgical">Medical-Surgical</option>
                      <option value="Patient Education">Patient Education</option>
                      <option value="Infection Management">Infection Management</option>
                      <option value="Critical Care">Critical Care</option>
                      <option value="Medication Safety">Medication Safety</option>
                      <option value="General">General</option>
                    </select>
                    <FontAwesomeIcon
                      icon={faChevronDown}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className={labelClassName}>Patient</label>
                <div className="relative">
                  <select
                    value={createForm.patientId}
                    onChange={(e) => setCreateForm({ ...createForm, patientId: e.target.value })}
                    className={selectClassName + " pr-10"}
                  >
                    <option value="">No linked patient</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name} — {patient.diagnosis}
                        {patient.room_number ? ` (Room ${patient.room_number})` : ""}
                      </option>
                    ))}
                  </select>
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  Students only see patients linked to their assigned scenarios — link one so they
                  can chart vitals and EHR records for this case.
                </p>
              </div>
              <div>
                <label className={labelClassName}>Learning Objectives</label>
                <textarea
                  value={createForm.learningObjectives}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, learningObjectives: e.target.value })
                  }
                  placeholder="One objective per line&#10;e.g. Recognize signs of acute MI"
                  rows={4}
                  className={inputClassName + " resize-none"}
                />
                <p className="text-xs text-gray-500 mt-1.5">Enter one objective per line.</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !createForm.title.trim()}
                  className="px-5 py-2.5 bg-[#1B6B7B] text-white rounded-lg font-medium hover:bg-[#145a63] transition-all disabled:opacity-50 flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
                >
                  {creating && <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />}
                  Create Scenario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Generate Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-200/80">
            <div className="p-4 border-b border-gray-100/80 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <FontAwesomeIcon icon={faRobot} className="text-purple-600 w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">AI Scenario Generator</h3>
                  <p className="text-sm text-gray-500">Generate a case from a prompt or patient</p>
                </div>
              </div>
              <button
                onClick={closeAIModal}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClassName}>Suggested Difficulty</label>
                  <div className="relative">
                    <select
                      value={suggestDifficulty}
                      onChange={(e) => setSuggestDifficulty(e.target.value)}
                      className={selectClassName + " pr-10"}
                    >
                      <option value="">Any difficulty</option>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                    <FontAwesomeIcon
                      icon={faChevronDown}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClassName}>Suggested Category</label>
                  <div className="relative">
                    <select
                      value={suggestCategory}
                      onChange={(e) => setSuggestCategory(e.target.value)}
                      className={selectClassName + " pr-10"}
                    >
                      <option value="">Any category</option>
                      <option value="Cardiac Emergency">Cardiac Emergency</option>
                      <option value="Respiratory Emergency">Respiratory Emergency</option>
                      <option value="Neurological Emergency">Neurological Emergency</option>
                      <option value="Trauma">Trauma</option>
                      <option value="Medical-Surgical">Medical-Surgical</option>
                      <option value="Patient Education">Patient Education</option>
                      <option value="Infection Management">Infection Management</option>
                      <option value="Critical Care">Critical Care</option>
                      <option value="Medication Safety">Medication Safety</option>
                      <option value="General">General</option>
                    </select>
                    <FontAwesomeIcon
                      icon={faChevronDown}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelClassName}>Prompt</label>
                  <button
                    type="button"
                    onClick={handleSuggestAI}
                    disabled={suggesting || patients.length === 0}
                    className="text-sm flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {suggesting && (
                      <FontAwesomeIcon icon={faSpinner} spin className="w-3.5 h-3.5" />
                    )}
                    <FontAwesomeIcon icon={faRobot} className="w-3.5 h-3.5" />
                    {suggesting ? "Suggesting..." : "Suggest Scenario"}
                  </button>
                </div>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe the clinical scenario you want to generate, or click Suggest Scenario to auto-fill..."
                  rows={4}
                  className={inputClassName + " resize-none"}
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Suggest uses one AI request and picks a patient with abnormal labs when none is
                  selected.
                </p>
                {aiError && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5">
                    <FontAwesomeIcon
                      icon={faExclamationTriangle}
                      className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0"
                    />
                    <p className="text-sm text-red-700">{aiError}</p>
                  </div>
                )}
              </div>

              <div>
                <label className={labelClassName}>Base on MIMIC-IV Patient</label>
                <p className="text-sm text-gray-500 mb-3">
                  Click a row to select a patient, or choose to generate from the prompt only.
                </p>

                {/* Prompt-only option */}
                <button
                  onClick={() => setSelectedPatientId("")}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all mb-3 ${
                    selectedPatientId === ""
                      ? "border-[#1B6B7B] bg-[#1B6B7B]/5"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-sm font-medium text-gray-700">
                    Generate from prompt only
                  </span>
                  {selectedPatientId === "" && (
                    <div className="w-6 h-6 bg-[#1B6B7B] rounded-full flex items-center justify-center">
                      <FontAwesomeIcon icon={faCheck} className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </button>

                {/* Selected patient badge */}
                {selectedPatient && (
                  <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600">
                        <FontAwesomeIcon icon={faHospitalUser} className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          {selectedPatient.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {selectedPatient.diagnosis} · {selectedPatient.mimic_id}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedPatientId("")}
                      className="text-xs text-purple-700 hover:text-purple-900 font-medium"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {/* Searchable patient table */}
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="p-3 border-b border-gray-200 bg-gray-50/50">
                    <div className="relative">
                      <FontAwesomeIcon
                        icon={faSearch}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                      />
                      <input
                        type="text"
                        value={patientSearchQuery}
                        onChange={(e) => setPatientSearchQuery(e.target.value)}
                        placeholder="Search patients by name, diagnosis, MIMIC ID, or room..."
                        className={inputClassName + " pl-10"}
                      />
                    </div>
                  </div>
                  <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
                    {loadingPatients ? (
                      <div className="p-8 text-center">
                        <FontAwesomeIcon icon={faSpinner} spin className="w-6 h-6 text-[#1B6B7B]" />
                        <p className="text-sm text-gray-500 mt-2">Loading patients...</p>
                      </div>
                    ) : filteredPatients.length === 0 ? (
                      <div className="p-6 text-center text-gray-500 text-sm">
                        {patientSearchQuery
                          ? "No patients match your search."
                          : "No MIMIC-IV patients available."}
                      </div>
                    ) : (
                      <table className="w-full">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600">
                              Patient
                            </th>
                            <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600">
                              Diagnosis
                            </th>
                            <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600">
                              Room
                            </th>
                            <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600">
                              MIMIC ID
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredPatients.map((patient) => (
                            <tr
                              key={patient.id}
                              onClick={() => setSelectedPatientId(patient.id)}
                              className={`cursor-pointer transition-colors ${
                                selectedPatientId === patient.id
                                  ? "bg-[#1B6B7B]/5 hover:bg-[#1B6B7B]/10"
                                  : "hover:bg-gray-50"
                              }`}
                            >
                              <td className="py-2.5 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 bg-[#1B6B7B]/10 rounded-full flex items-center justify-center text-[#1B6B7B] text-xs font-semibold">
                                    {patient.name.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-800">
                                      {patient.name}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {patient.age}yo {patient.gender}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-sm text-gray-600">
                                {patient.diagnosis}
                              </td>
                              <td className="py-2.5 px-4 text-sm text-gray-600">
                                {patient.room_number}
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="text-xs font-mono text-gray-500">
                                  {patient.mimic_id}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Preview */}
              {aiPreview && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100/80">
                    <FontAwesomeIcon icon={faRobot} className="text-purple-600" />
                    <h4 className="font-bold text-gray-900">Generated Preview</h4>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Title
                      </p>
                      <p className="text-sm font-medium text-gray-900">{aiPreview.title}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Description
                      </p>
                      <p className="text-sm text-gray-700">{aiPreview.description}</p>
                    </div>
                    <div className="flex gap-4">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Difficulty
                        </p>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${getDifficultyColor(aiPreview.difficulty || "intermediate")}`}
                        >
                          {aiPreview.difficulty}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Category
                        </p>
                        <p className="text-sm text-gray-700">{aiPreview.category}</p>
                      </div>
                    </div>
                    {Array.isArray(aiPreview.learning_objectives) &&
                      aiPreview.learning_objectives.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Learning Objectives
                          </p>
                          <ul className="list-disc list-inside text-sm text-gray-700">
                            {aiPreview.learning_objectives.map((obj, i) => (
                              <li key={i}>{obj}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100/80 bg-gray-50/50 flex justify-end gap-3">
              {!aiPreview ? (
                <>
                  <button
                    onClick={closeAIModal}
                    className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGenerateAI}
                    disabled={generating || !aiPrompt.trim()}
                    className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
                  >
                    {generating && <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />}
                    <FontAwesomeIcon icon={faBolt} className="w-4 h-4" />
                    {generating ? "Generating..." : "Generate Scenario"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setAiPreview(null)}
                    className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
                  >
                    Regenerate
                  </button>
                  <button
                    onClick={closeAIModal}
                    className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSaveAIPreview}
                    disabled={savingAIPreview}
                    className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {savingAIPreview && (
                      <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />
                    )}
                    <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
                    {savingAIPreview ? "Saving..." : "Save Scenario"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedScenario && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-200/80">
            <div className="p-4 border-b border-gray-100/80 bg-gray-50/50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-lg flex items-center justify-center">
                      <FontAwesomeIcon icon={faNotesMedical} className="text-[#1B6B7B] w-5 h-5" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">{selectedScenario.title}</h2>
                    {selectedScenario.is_ai_generated && (
                      <span className="px-2.5 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full flex items-center gap-1">
                        <FontAwesomeIcon icon={faRobot} className="w-3 h-3" />
                        AI Generated
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600">{selectedScenario.description}</p>
                </div>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="flex items-center gap-3 mt-4 flex-wrap">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-semibold border flex items-center gap-1 ${getDifficultyColor(
                    selectedScenario.difficulty,
                  )}`}
                >
                  <FontAwesomeIcon
                    icon={getDifficultyIcon(selectedScenario.difficulty)}
                    className="w-3 h-3"
                  />
                  {selectedScenario.difficulty}
                </span>
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm font-semibold rounded-full">
                  {selectedScenario.category}
                </span>
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <FontAwesomeIcon icon={faUsers} className="w-3.5 h-3.5" />
                  {selectedScenario.student_count} students
                </span>
                <span className="text-sm text-gray-400 flex items-center gap-1">
                  <FontAwesomeIcon icon={faCalendarDay} className="w-3.5 h-3.5" />
                  Created: {new Date(selectedScenario.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faStethoscope} className="text-[#1B6B7B]" />
                  Patient Case
                </h3>
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                  {selectedScenario.patient_case ? (
                    <div className="space-y-4">
                      {selectedScenario.patient_case.chief_complaint && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                          <p className="text-sm font-bold text-red-700 mb-1 flex items-center gap-2">
                            <FontAwesomeIcon icon={faExclamationTriangle} className="w-4 h-4" />
                            Chief Complaint
                          </p>
                          <p className="text-gray-800">
                            {selectedScenario.patient_case.chief_complaint}
                          </p>
                        </div>
                      )}
                      {selectedScenario.patient_case.vitals && (
                        <div>
                          <p className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-2">
                            <FontAwesomeIcon icon={faHeartbeat} className="w-4 h-4 text-red-500" />
                            Vital Signs
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {Object.entries(selectedScenario.patient_case.vitals).map(
                              ([key, value]) => (
                                <div
                                  key={key}
                                  className="bg-white rounded-lg p-3 border border-gray-200"
                                >
                                  <p className="text-xs text-gray-500 capitalize">
                                    {key.replace(/_/g, " ")}
                                  </p>
                                  <p className="font-semibold text-gray-800">{String(value)}</p>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                      {selectedScenario.patient_case.medical_history && (
                        <div>
                          <p className="text-sm font-bold text-gray-600 mb-1">Medical History</p>
                          <p className="text-gray-800">
                            {selectedScenario.patient_case.medical_history}
                          </p>
                        </div>
                      )}
                      {selectedScenario.patient_case.physical_exam && (
                        <div>
                          <p className="text-sm font-bold text-gray-600 mb-1">
                            Physical Examination
                          </p>
                          <p className="text-gray-800">
                            {selectedScenario.patient_case.physical_exam}
                          </p>
                        </div>
                      )}
                      {selectedScenario.patient_case.diagnosis && (
                        <div>
                          <p className="text-sm font-bold text-gray-600 mb-1">Diagnosis</p>
                          <p className="text-gray-800">{selectedScenario.patient_case.diagnosis}</p>
                        </div>
                      )}
                      {selectedScenario.patient_case.treatment_plan && (
                        <div>
                          <p className="text-sm font-bold text-gray-600 mb-1">Treatment Plan</p>
                          <p className="text-gray-800">
                            {selectedScenario.patient_case.treatment_plan}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-500">No patient case details available</p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faListCheck} className="text-[#1B6B7B]" />
                  Learning Objectives
                </h3>
                <ul className="space-y-2">
                  {selectedScenario.learning_objectives &&
                  selectedScenario.learning_objectives.length > 0 ? (
                    selectedScenario.learning_objectives.map((objective, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-[#1B6B7B]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-sm font-bold text-[#1B6B7B]">{index + 1}</span>
                        </div>
                        <p className="text-gray-700">{objective}</p>
                      </li>
                    ))
                  ) : (
                    <p className="text-gray-500">No learning objectives defined</p>
                  )}
                </ul>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100/80 bg-gray-50/50">
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    handleOpenAssignModal(selectedScenario);
                  }}
                  className="px-5 py-2.5 bg-[#1B6B7B] text-white rounded-lg font-medium hover:bg-[#145a63] transition-all flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
                >
                  <FontAwesomeIcon icon={faUserPlus} className="w-4 h-4" />
                  Assign to Students
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && selectedScenario && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-200/80">
            <div className="p-4 border-b border-gray-100/80 bg-gray-50/50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-lg flex items-center justify-center">
                    <FontAwesomeIcon icon={faUserPlus} className="text-[#1B6B7B] w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Assign Scenario</h2>
                    <p className="text-sm text-gray-500">{selectedScenario.title}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faCalendarDay} className="text-[#1B6B7B]" />
                  Assignment Settings
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClassName}>Deadline</label>
                    <div className="relative">
                      <FontAwesomeIcon
                        icon={faCalendarDay}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                      />
                      <input
                        type="date"
                        value={assignDeadline}
                        onChange={(e) => setAssignDeadline(e.target.value)}
                        className={inputClassName + " pl-10"}
                      />
                    </div>
                  </div>
                  <div className="flex items-center pt-7">
                    <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors w-full">
                      <input
                        type="checkbox"
                        checked={assignRequired}
                        onChange={(e) => setAssignRequired(e.target.checked)}
                        className="w-5 h-5 text-[#1B6B7B] rounded focus:ring-[#1B6B7B]"
                      />
                      <span className="text-sm font-semibold text-gray-700">
                        Required for all students
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <FontAwesomeIcon icon={faUser} className="text-[#1B6B7B]" />
                    Select Students
                  </h3>
                  <button
                    onClick={() => setSelectedStudents(filteredStudents.map((s) => s.id))}
                    className="text-sm text-[#1B6B7B] hover:text-[#145a63] font-semibold"
                  >
                    Select All
                  </button>
                </div>
                <div className="mb-3">
                  <div className="relative">
                    <FontAwesomeIcon
                      icon={faSearch}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
                    />
                    <input
                      type="text"
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      placeholder="Search by name or email..."
                      className={inputClassName + " pl-10"}
                    />
                  </div>
                </div>
                <div className="border border-gray-200 rounded-xl max-h-[280px] overflow-y-auto custom-scrollbar">
                  {filteredStudents.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      {studentSearchQuery
                        ? "No students match your search"
                        : "No students available"}
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600">
                            Select
                          </th>
                          <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600">
                            Name
                          </th>
                          <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600">
                            Email
                          </th>
                          <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600">
                            Risk
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredStudents.map((student) => (
                          <tr
                            key={student.id}
                            className={`transition-colors cursor-pointer ${
                              selectedStudents.includes(student.id)
                                ? "bg-[#1B6B7B]/5 hover:bg-[#1B6B7B]/10"
                                : "hover:bg-gray-50"
                            }`}
                            onClick={() => toggleStudentSelection(student.id)}
                          >
                            <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedStudents.includes(student.id)}
                                onChange={() => toggleStudentSelection(student.id)}
                                className="w-4 h-4 text-[#1B6B7B] rounded focus:ring-[#1B6B7B]"
                              />
                            </td>
                            <td className="py-2.5 px-4 text-sm text-gray-800">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 bg-[#1B6B7B]/10 rounded-full flex items-center justify-center text-[#1B6B7B] text-xs font-bold">
                                  {student.name.charAt(0)}
                                </div>
                                {student.name}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-sm text-gray-500">{student.email}</td>
                            <td className="py-2.5 px-4">
                              <span
                                className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                                  student.risk_level === "high"
                                    ? "bg-red-100 text-red-700"
                                    : student.risk_level === "medium"
                                      ? "bg-amber-100 text-amber-700"
                                      : student.risk_level === "low"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {student.risk_level ? student.risk_level : "Unknown"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  {selectedStudents.length} student(s) selected
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100/80 bg-gray-50/50">
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignScenario}
                  disabled={selectedStudents.length === 0 || !assignDeadline || assigning}
                  className="px-5 py-2.5 bg-[#1B6B7B] text-white rounded-lg font-medium hover:bg-[#145a63] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
                >
                  {assigning && <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />}
                  Assign to {selectedStudents.length} Student
                  {selectedStudents.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link Patient Modal */}
      {showLinkPatientModal && linkPatientTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-200/80">
            <div className="p-4 border-b border-gray-100/80 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-lg flex items-center justify-center">
                  <FontAwesomeIcon icon={faHospitalUser} className="text-[#1B6B7B] w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Link Patient</h3>
                  <p className="text-sm text-gray-500 line-clamp-1">{linkPatientTarget.title}</p>
                </div>
              </div>
              <button
                onClick={closeLinkPatientModal}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <p className="text-sm text-gray-500">
                Students only see patients linked to their assigned scenarios — pick one so it
                shows up for anyone already assigned this scenario.
              </p>

              <button
                type="button"
                onClick={() => setLinkPatientId("")}
                className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                  linkPatientId === ""
                    ? "border-[#1B6B7B] bg-[#1B6B7B]/5"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <span className="text-sm font-medium text-gray-700">No linked patient</span>
                {linkPatientId === "" && (
                  <div className="w-6 h-6 bg-[#1B6B7B] rounded-full flex items-center justify-center">
                    <FontAwesomeIcon icon={faCheck} className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </button>

              {linkPatientSelected && (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center text-teal-700">
                      <FontAwesomeIcon icon={faHospitalUser} className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {linkPatientSelected.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {linkPatientSelected.diagnosis} · {linkPatientSelected.mimic_id}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setLinkPatientId("")}
                    className="text-xs text-teal-700 hover:text-teal-900 font-medium"
                  >
                    Clear
                  </button>
                </div>
              )}

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="p-3 border-b border-gray-200 bg-gray-50/50">
                  <div className="relative">
                    <FontAwesomeIcon
                      icon={faSearch}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                    />
                    <input
                      type="text"
                      value={linkPatientSearchQuery}
                      onChange={(e) => setLinkPatientSearchQuery(e.target.value)}
                      placeholder="Search patients by name, diagnosis, MIMIC ID, or room..."
                      className={inputClassName + " pl-10"}
                    />
                  </div>
                </div>
                <div className="max-h-[260px] overflow-y-auto custom-scrollbar">
                  {loadingPatients ? (
                    <div className="p-8 text-center">
                      <FontAwesomeIcon icon={faSpinner} spin className="w-6 h-6 text-[#1B6B7B]" />
                      <p className="text-sm text-gray-500 mt-2">Loading patients...</p>
                    </div>
                  ) : linkModalFilteredPatients.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 text-sm">
                      {linkPatientSearchQuery
                        ? "No patients match your search."
                        : "No MIMIC-IV patients available."}
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600">
                            Patient
                          </th>
                          <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600">
                            Diagnosis
                          </th>
                          <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600">
                            Room
                          </th>
                          <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600">
                            MIMIC ID
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {linkModalFilteredPatients.map((patient) => (
                          <tr
                            key={patient.id}
                            onClick={() => setLinkPatientId(patient.id)}
                            className={`cursor-pointer transition-colors ${
                              linkPatientId === patient.id
                                ? "bg-[#1B6B7B]/5 hover:bg-[#1B6B7B]/10"
                                : "hover:bg-gray-50"
                            }`}
                          >
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 bg-[#1B6B7B]/10 rounded-full flex items-center justify-center text-[#1B6B7B] text-xs font-semibold">
                                  {patient.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-800">
                                    {patient.name}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {patient.age}yo {patient.gender}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-sm text-gray-600">
                              {patient.diagnosis}
                            </td>
                            <td className="py-2.5 px-4 text-sm text-gray-600">
                              {patient.room_number}
                            </td>
                            <td className="py-2.5 px-4">
                              <span className="text-xs font-mono text-gray-500">
                                {patient.mimic_id}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100/80 bg-gray-50/50 flex justify-end gap-3">
              <button
                onClick={closeLinkPatientModal}
                className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePatientLink}
                disabled={savingPatientLink}
                className="px-5 py-2.5 bg-[#1B6B7B] text-white rounded-lg font-medium hover:bg-[#145a63] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
              >
                {savingPatientLink && <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
