"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faCircleXmark,
  faTriangleExclamation,
  faPlus,
  faXmark,
  faUser,
  faEnvelope,
  faSpinner,
  faTrashCan,
  faFileCsv,
  faDownload,
  faCircleCheck,
  faHourglassHalf,
  faEllipsisVertical,
  faLayerGroup,
  faChevronRight,
  faArrowLeft,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchFacultyStudents,
  createFacultyStudent,
  fetchAllStudentUsers,
  fetchAllPredictions,
  fetchFacultySections,
  updateStudentUser,
  deleteStudentUser,
  logAuditAction,
  getCurrentFacultyUser,
  FacultyStudent,
  StudentUser,
  RiskPrediction,
  Section,
} from "../../lib/api";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";
import Card from "../../components/Card";
import Avatar from "../../components/Avatar";
import { SkeletonSectionGrid, SkeletonTable } from "../../components/skeletons";

/** Minimal CSV parser: quoted fields, "" escapes, \r\n or \n row breaks. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim().length > 0)) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim().length > 0)) rows.push(row);
  return rows;
}

const STUDENT_CSV_TEMPLATE = `first_name,middle_name,last_name,email,section
Juan,Santos,Dela Cruz,juan.delacruz@batstate-u.edu.ph,A
Maria,,Reyes,maria.reyes@batstate-u.edu.ph,
`;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Group key for students who have no section assigned. */
const UNASSIGNED_KEY = "__unassigned__";

interface SectionGroup {
  /** Section id, or UNASSIGNED_KEY. */
  key: string;
  name: string;
  /** Members left after the search and risk filters. */
  students: StudentUser[];
  /** Members before filtering, so cards can show "3 of 12". */
  total: number;
}

interface BulkRow {
  line: number;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  /** Section name as written in the CSV (may be empty). */
  sectionName: string;
  /** Resolved section id when sectionName matched one of the faculty's sections. */
  sectionId: string | null;
  /** Validation problem found before import; the row is skipped. */
  invalidReason?: string;
  status: "ready" | "creating" | "created" | "warning" | "failed";
  resultText?: string;
}

export default function FacultyStudentsClient() {
  const router = useRouter();
  const [students, setStudents] = useState<FacultyStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [studentUsers, setStudentUsers] = useState<StudentUser[]>([]);
  const [loadingStudentUsers, setLoadingStudentUsers] = useState(true);
  const [predictions, setPredictions] = useState<Record<string, RiskPrediction>>({});
  const [sections, setSections] = useState<Section[]>([]);
  /** Section whose roster is open; null shows the section cards. */
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);

  useEffect(() => {
    loadStudents();
    loadStudentUsers();
  }, [riskFilter, searchQuery]);

  useEffect(() => {
    fetchFacultySections().then(setSections);
  }, []);

  useEffect(() => {
    fetchAllPredictions().then((rows) => {
      const map: Record<string, RiskPrediction> = {};
      for (const row of rows) map[row.student_id] = row;
      setPredictions(map);
    });
  }, []);

  const loadStudents = async () => {
    setLoading(true);
    const data = await fetchFacultyStudents(riskFilter, searchQuery);
    setStudents(data);
    setLoading(false);
  };

  const loadStudentUsers = async () => {
    setLoadingStudentUsers(true);
    const data = await fetchAllStudentUsers();
    setStudentUsers(data);
    setLoadingStudentUsers(false);
  };

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [middleInitial, setMiddleInitial] = useState("");
  const [lastName, setLastName] = useState("");
  const [newSectionId, setNewSectionId] = useState("");
  const newEmailRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updatingStudent, setUpdatingStudent] = useState<StudentUser | null>(null);
  const [updateName, setUpdateName] = useState("");
  const [updateSectionId, setUpdateSectionId] = useState("");
  const updateEmailRef = useRef<HTMLInputElement>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState<StudentUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [openMenu, setOpenMenu] = useState<{
    user: StudentUser;
    x: number;
    y: number;
    openUp: boolean;
  } | null>(null);

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkFileName, setBulkFileName] = useState<string | null>(null);
  const [bulkFileError, setBulkFileError] = useState<string | null>(null);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [bulkFinished, setBulkFinished] = useState(false);
  const [bulkDefaultSectionId, setBulkDefaultSectionId] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);

  const closeBulkModal = () => {
    if (isBulkImporting) return;
    setShowBulkModal(false);
    setBulkRows([]);
    setBulkFileName(null);
    setBulkFileError(null);
    setBulkFinished(false);
    setBulkDefaultSectionId("");
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const downloadCsvTemplate = () => {
    const blob = new Blob([STUDENT_CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "icare-students-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvFile = async (file: File) => {
    setBulkFileError(null);
    setBulkFinished(false);
    setBulkRows([]);
    setBulkFileName(file.name);

    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      setBulkFileError("The CSV needs a header row and at least one student row.");
      return;
    }

    const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const firstIdx = header.indexOf("first_name");
    const middleIdx = header.findIndex((h) => h === "middle_name" || h === "middle_initial");
    const lastIdx = header.indexOf("last_name");
    const emailIdx = header.indexOf("email");
    const sectionIdx = header.indexOf("section");

    const missing = [
      firstIdx === -1 && "first_name",
      lastIdx === -1 && "last_name",
      emailIdx === -1 && "email",
    ].filter(Boolean);
    if (missing.length > 0) {
      setBulkFileError(
        `The CSV header is missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template for the expected format.`,
      );
      return;
    }

    const seenEmails = new Set<string>();
    const existingEmails = new Set(studentUsers.map((u) => u.email.toLowerCase()));
    const sectionByName = new Map(sections.map((s) => [s.name.toLowerCase(), s.id]));
    const parsed: BulkRow[] = rows.slice(1).map((cells, i) => {
      const sectionName = sectionIdx === -1 ? "" : (cells[sectionIdx] ?? "").trim();
      const row: BulkRow = {
        line: i + 2,
        firstName: (cells[firstIdx] ?? "").trim(),
        middleName: middleIdx === -1 ? "" : (cells[middleIdx] ?? "").trim(),
        lastName: (cells[lastIdx] ?? "").trim(),
        email: (cells[emailIdx] ?? "").trim().toLowerCase(),
        sectionName,
        sectionId: sectionName ? (sectionByName.get(sectionName.toLowerCase()) ?? null) : null,
        status: "ready",
      };
      if (!row.firstName) row.invalidReason = "Missing first name";
      else if (!row.lastName) row.invalidReason = "Missing last name";
      else if (!row.email) row.invalidReason = "Missing email";
      else if (!EMAIL_REGEX.test(row.email)) row.invalidReason = "Invalid email address";
      else if (seenEmails.has(row.email)) row.invalidReason = "Duplicate email in this file";
      else if (existingEmails.has(row.email))
        row.invalidReason = "A student with this email already exists";
      else if (row.sectionName && !row.sectionId)
        row.invalidReason = `"${row.sectionName}" is not one of your sections`;
      seenEmails.add(row.email);
      return row;
    });

    setBulkRows(parsed);
  };

  const handleBulkImport = async () => {
    const importable = bulkRows.filter((r) => !r.invalidReason);
    if (importable.length === 0 || isBulkImporting) return;
    if (importable.some((r) => !r.sectionId) && !bulkDefaultSectionId) return;

    setIsBulkImporting(true);
    const rows = [...bulkRows];
    let createdCount = 0;

    for (let i = 0; i < rows.length; i++) {
      if (rows[i].invalidReason) continue;
      rows[i] = { ...rows[i], status: "creating" };
      setBulkRows([...rows]);

      const { firstName, middleName, lastName, email } = rows[i];
      const fullName = middleName
        ? `${firstName} ${middleName} ${lastName}`
        : `${firstName} ${lastName}`;
      const sectionId = rows[i].sectionId ?? bulkDefaultSectionId;

      try {
        const { data, error } = await createFacultyStudent(fullName, email, sectionId);
        if (error) {
          rows[i] = { ...rows[i], status: "failed", resultText: error };
        } else if (data?.warning) {
          createdCount++;
          rows[i] = {
            ...rows[i],
            status: "warning",
            resultText: `Created, but the invitation email failed — temporary password: ${data.password}`,
          };
        } else {
          createdCount++;
          rows[i] = { ...rows[i], status: "created", resultText: "Invitation emailed" };
        }
      } catch {
        rows[i] = { ...rows[i], status: "failed", resultText: "Unexpected error" };
      }
      setBulkRows([...rows]);
    }

    setIsBulkImporting(false);
    setBulkFinished(true);

    if (createdCount > 0) {
      loadStudents();
      loadStudentUsers();
      const faculty = getCurrentFacultyUser();
      if (faculty) {
        logAuditAction({
          faculty_id: faculty.id,
          faculty_name: faculty.name,
          tab: "students",
          action: "bulk_register_students",
          details: `Registered ${createdCount} student${createdCount === 1 ? "" : "s"} via CSV import`,
          target_type: "student",
          target_id: "",
          metadata: { created: createdCount, file: bulkFileName ?? "" },
        });
      }
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const firstNameTrimmed = firstName.trim();
    const middleInitialTrimmed = middleInitial.trim();
    const lastNameTrimmed = lastName.trim();
    const emailTrimmed = (newEmailRef.current?.value ?? "").trim();

    if (!firstNameTrimmed) {
      setMessage({ type: "error", text: "First name is required" });
      return;
    }

    if (!lastNameTrimmed) {
      setMessage({ type: "error", text: "Last name is required" });
      return;
    }

    if (!emailTrimmed) {
      setMessage({ type: "error", text: "Student email is required" });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setMessage({ type: "error", text: "Please enter a valid email address" });
      return;
    }

    if (!newSectionId) {
      setMessage({ type: "error", text: "Please select a section" });
      return;
    }

    const duplicateEmail = students.some(
      (s) => s.email.toLowerCase() === emailTrimmed.toLowerCase(),
    );
    if (duplicateEmail) {
      setMessage({ type: "warning", text: "A student with this email already exists" });
      return;
    }

    const fullName = middleInitialTrimmed
      ? `${firstNameTrimmed} ${middleInitialTrimmed} ${lastNameTrimmed}`
      : `${firstNameTrimmed} ${lastNameTrimmed}`;

    setIsSubmitting(true);

    try {
      const { data, error } = await createFacultyStudent(fullName, emailTrimmed, newSectionId);

      if (error) {
        setMessage({ type: "error", text: error });
        return;
      }

      if (data?.warning) {
        setMessage({
          type: "warning",
          text: `${data.student.name} has been created. ${data.warning}`,
        });
      } else {
        setMessage({
          type: "success",
          text: `${data!.student.name} has been invited successfully!`,
        });
      }

      setCreatedPassword(data?.password ?? null);
      setFirstName("");
      setMiddleInitial("");
      setLastName("");
      setNewSectionId("");
      if (newEmailRef.current) newEmailRef.current.value = "";
      loadStudents();
      loadStudentUsers();
      const faculty = getCurrentFacultyUser();
      if (faculty) {
        logAuditAction({
          faculty_id: faculty.id,
          faculty_name: faculty.name,
          tab: "students",
          action: "register_student",
          details: `Registered new student ${fullName}`,
          target_type: "student",
          target_id: data?.student?.id ?? "",
          metadata: { student_name: fullName, email: emailTrimmed },
        });
      }
    } catch {
      setMessage({ type: "error", text: "An unexpected error occurred" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingStudent) return;

    const nameTrimmed = updateName.trim();
    const emailTrimmed = (updateEmailRef.current?.value ?? "").trim();

    if (!nameTrimmed) {
      setMessage({ type: "error", text: "Student name is required" });
      return;
    }

    if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setMessage({ type: "error", text: "Please enter a valid email address" });
      return;
    }

    setIsUpdating(true);

    try {
      const { data, error } = await updateStudentUser(
        updatingStudent.id,
        nameTrimmed,
        emailTrimmed,
        updateSectionId || undefined,
      );

      if (error) {
        setMessage({ type: "error", text: error });
        return;
      }

      setMessage({ type: "success", text: `${data!.name} has been updated successfully!` });
      setShowUpdateModal(false);
      setUpdatingStudent(null);
      loadStudentUsers();
      const faculty = getCurrentFacultyUser();
      if (faculty) {
        logAuditAction({
          faculty_id: faculty.id,
          faculty_name: faculty.name,
          tab: "students",
          action: "update_student",
          details: `Updated student ${data!.name}`,
          target_type: "student",
          target_id: updatingStudent.id,
          metadata: { student_name: data!.name, email: emailTrimmed },
        });
      }
    } catch {
      setMessage({ type: "error", text: "An unexpected error occurred" });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!deletingStudent) return;

    setIsDeleting(true);

    try {
      const { error } = await deleteStudentUser(deletingStudent.id);

      if (error) {
        setMessage({ type: "error", text: error });
        return;
      }

      setMessage({
        type: "success",
        text: `${deletingStudent.name} has been deleted successfully!`,
      });
      setShowDeleteModal(false);
      setDeletingStudent(null);
      loadStudentUsers();
      const faculty = getCurrentFacultyUser();
      if (faculty) {
        logAuditAction({
          faculty_id: faculty.id,
          faculty_name: faculty.name,
          tab: "students",
          action: "delete_student",
          details: `Deleted student ${deletingStudent.name}`,
          target_type: "student",
          target_id: deletingStudent.id,
          metadata: { student_name: deletingStudent.name },
        });
      }
    } catch {
      setMessage({ type: "error", text: "An unexpected error occurred" });
    } finally {
      setIsDeleting(false);
    }
  };

  const openCreateModal = () => {
    setShowCreateModal(true);
    setMessage(null);
    setCreatedPassword(null);
    setCopiedPassword(false);
    if (newEmailRef.current) newEmailRef.current.value = "";
    // Prefill with the section being viewed, when it is one of the faculty's own.
    setNewSectionId(sections.some((s) => s.id === selectedSectionKey) ? selectedSectionKey! : "");
  };

  const openUpdateModal = (student: StudentUser) => {
    setUpdatingStudent(student);
    setUpdateName(student.name);
    setUpdateSectionId(student.section_id ?? "");
    if (updateEmailRef.current) updateEmailRef.current.value = student.email;
    setShowUpdateModal(true);
    setMessage(null);
  };

  const openDeleteModal = (student: StudentUser) => {
    setDeletingStudent(student);
    setShowDeleteModal(true);
    setMessage(null);
  };
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "high":
        return "bg-red-100 text-red-700 border-red-200";
      case "medium":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "low":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-600";
    if (score >= 60) return "text-amber-600";
    return "text-red-600";
  };

  const filteredStudents = students.filter(
    (student) =>
      searchQuery === "" ||
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredStudentUsers = studentUsers.filter((user) => {
    const matchesSearch =
      searchQuery === "" ||
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (riskFilter === "all") return true;
    const prediction = predictions[user.id];
    if (riskFilter === "none") return !prediction;
    return prediction?.risk === riskFilter;
  });

  const sectionGroups = useMemo<SectionGroup[]>(() => {
    const matching = new Set(filteredStudentUsers.map((u) => u.id));
    const byKey = new Map<string, SectionGroup>();

    // Seed with the faculty's own sections so empty ones still get a card.
    for (const section of sections) {
      byKey.set(section.id, { key: section.id, name: section.name, students: [], total: 0 });
    }

    for (const user of studentUsers) {
      const key = user.section_id ?? UNASSIGNED_KEY;
      let group = byKey.get(key);
      if (!group) {
        group = { key, name: user.section ?? "Unassigned", students: [], total: 0 };
        byKey.set(key, group);
      }
      group.total++;
      if (matching.has(user.id)) group.students.push(user);
    }

    return [...byKey.values()].sort((a, b) => {
      if (a.key === UNASSIGNED_KEY) return 1;
      if (b.key === UNASSIGNED_KEY) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [sections, studentUsers, filteredStudentUsers]);

  const selectedGroup = sectionGroups.find((g) => g.key === selectedSectionKey) ?? null;
  const filtersActive = searchQuery !== "" || riskFilter !== "all";

  const riskCounts = (group: SectionGroup) => ({
    atRisk: group.students.filter((u) => predictions[u.id]?.risk === "at_risk").length,
    safe: group.students.filter((u) => predictions[u.id]?.risk === "safe").length,
    unscored: group.students.filter((u) => !predictions[u.id]).length,
  });

  const atRiskCount = studentUsers.filter((u) => predictions[u.id]?.risk === "at_risk").length;
  const safeCount = studentUsers.filter((u) => predictions[u.id]?.risk === "safe").length;
  const pendingCount = studentUsers.filter((u) => !predictions[u.id]).length;
  const pctOfRoster = (count: number) =>
    studentUsers.length > 0
      ? `${Math.round((count / studentUsers.length) * 100)}% of roster`
      : "No students yet";

  return (
    <div>
      <PageHeader
        badge={{
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z M12 14l9-5-9-5-9 5 9 5z M12 22v-6"
              />
            </svg>
          ),
          label: "Student Management",
        }}
        title="My Students"
        subtitle="Manage and monitor students under your supervision"
        action={{
          icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          ),
          onClick: openCreateModal,
          label: "Register Student",
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatTile
          icon={<FontAwesomeIcon icon={faUser} className="w-5 h-5" />}
          value={students.length}
          label="Total Students"
          caption="Enrolled under you"
          iconBg="bg-brand-600/10"
          iconColor="text-brand-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faTriangleExclamation} className="w-5 h-5" />}
          value={atRiskCount}
          label="At Risk (ML)"
          caption={pctOfRoster(atRiskCount)}
          iconBg="bg-red-50"
          iconColor="text-red-600"
          onClick={() => setRiskFilter("at_risk")}
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faCircleCheck} className="w-5 h-5" />}
          value={safeCount}
          label="Safe (ML)"
          caption={pctOfRoster(safeCount)}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          onClick={() => setRiskFilter("safe")}
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faHourglassHalf} className="w-5 h-5" />}
          value={pendingCount}
          label="No Prediction"
          caption="Awaiting ML assessment"
          iconBg="bg-gray-100"
          iconColor="text-gray-600"
          onClick={() => setRiskFilter("none")}
        />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <button
            onClick={openCreateModal}
            className="px-4 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-all flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
          >
            <FontAwesomeIcon icon={faPlus} className="w-5 h-5" />
            Register Student
          </button>
          <button
            onClick={() => {
              setShowBulkModal(true);
              setMessage(null);
            }}
            className="px-4 py-2.5 bg-surface border border-brand-600/30 text-brand-600 font-medium rounded-lg hover:bg-brand-600/5 transition-all flex items-center gap-2"
          >
            <FontAwesomeIcon icon={faFileCsv} className="w-5 h-5" />
            Import CSV
          </button>
          <div className="relative">
            <input
              type="text"
              placeholder="Search students..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all w-64"
            />
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="w-5 h-5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2"
            />
          </div>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="px-4 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all cursor-pointer"
          >
            <option value="all">All Risk Levels</option>
            <option value="at_risk">At Risk</option>
            <option value="safe">Safe</option>
            <option value="none">Not Scored</option>
          </select>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-lg border border-hairline overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-hairline bg-subtle flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-600/10 rounded-lg flex items-center justify-center">
                  <FontAwesomeIcon icon={faPlus} className="text-brand-600 w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Create New Student</h2>
                  <p className="text-sm text-gray-500">Register a student account</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setFirstName("");
                  setMiddleInitial("");
                  setLastName("");
                  setNewSectionId("");
                  if (newEmailRef.current) newEmailRef.current.value = "";
                  setMessage(null);
                  setCreatedPassword(null);
                  setCopiedPassword(false);
                }}
                className="p-2 hover:bg-gray-200 rounded-lg transition-all"
              >
                <FontAwesomeIcon icon={faXmark} className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form
              onSubmit={handleCreateStudent}
              className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0"
            >
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Student Name <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  <div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <FontAwesomeIcon icon={faUser} className="w-4 h-4 text-gray-500" />
                      </div>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        className="w-full pl-10 pr-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all shadow-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <FontAwesomeIcon icon={faUser} className="w-4 h-4 text-gray-500" />
                      </div>
                      <input
                        type="text"
                        value={middleInitial}
                        onChange={(e) => setMiddleInitial(e.target.value)}
                        placeholder="M.I."
                        maxLength={3}
                        className="w-full pl-10 pr-3 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all shadow-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <FontAwesomeIcon icon={faUser} className="w-4 h-4 text-gray-500" />
                      </div>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Last name"
                        className="w-full pl-10 pr-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-student-email"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Student Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <FontAwesomeIcon icon={faEnvelope} className="w-4 h-4 text-gray-500" />
                  </div>
                  <input
                    id="new-student-email"
                    type="text"
                    ref={newEmailRef}
                    placeholder="@batstate-u.edu.ph"
                    className="w-full pl-10 pr-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-student-section"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Section <span className="text-red-500">*</span>
                </label>
                <select
                  id="new-student-section"
                  value={newSectionId}
                  onChange={(e) => setNewSectionId(e.target.value)}
                  className="w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 transition-all shadow-sm"
                >
                  <option value="">Select section…</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {sections.length === 0 && (
                  <p className="mt-1.5 text-xs text-amber-600">
                    You have no assigned sections yet — ask an admin to assign you one first.
                  </p>
                )}
              </div>

              {message && showCreateModal && (
                <div
                  className={`p-3 rounded-lg text-sm border ${
                    message.type === "success"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : message.type === "warning"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-red-50 text-red-700 border-red-200"
                  }`}
                >
                  {message.text}
                </div>
              )}

              {createdPassword && (
                <div className="p-4 rounded-xl border border-brand-600/20 bg-brand-600/5">
                  <p className="text-sm font-medium text-brand-600 mb-2">
                    Temporary password for {firstName ? `${firstName} ` : ""}
                    {lastName}
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdPassword}
                      className="flex-1 px-3 py-2 bg-surface border border-brand-600/20 rounded-lg text-sm font-mono text-gray-800 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdPassword);
                        setCopiedPassword(true);
                        setTimeout(() => setCopiedPassword(false), 2000);
                      }}
                      className="px-3 py-2 text-sm font-medium text-brand-600 bg-surface border border-brand-600/20 rounded-lg hover:bg-brand-600/10 transition-all"
                    >
                      {copiedPassword ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-brand-600/70 mt-2">
                    This password has been emailed to the student. They will be asked to change it
                    on first login.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFirstName("");
                    setMiddleInitial("");
                    setLastName("");
                    setNewSectionId("");
                    if (newEmailRef.current) newEmailRef.current.value = "";
                    setMessage(null);
                    setCreatedPassword(null);
                    setCopiedPassword(false);
                  }}
                  className="px-5 py-2.5 bg-surface border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-all disabled:opacity-60 flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
                >
                  {isSubmitting ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />
                      Creating...
                    </>
                  ) : (
                    "Create Student"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="mt-8">
        {loadingStudentUsers ? (
          selectedGroup ? (
            <SkeletonTable rows={5} cols={4} />
          ) : (
            <SkeletonSectionGrid />
          )
        ) : !selectedGroup ? (
          sectionGroups.length === 0 ? (
            <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] py-12 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
                <FontAwesomeIcon icon={faLayerGroup} className="w-5 h-5 text-gray-400" />
              </div>
              <p className="font-medium text-gray-700">No sections yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Ask an admin to assign you a section, then register students into it.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sectionGroups.map((group) => {
                const counts = riskCounts(group);
                return (
                  <button
                    key={group.key}
                    onClick={() => setSelectedSectionKey(group.key)}
                    className="group text-left bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-brand-600/30 transition-all duration-200 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                            group.key === UNASSIGNED_KEY
                              ? "bg-gray-100 text-gray-500"
                              : "bg-brand-600/10 text-brand-600"
                          }`}
                        >
                          <FontAwesomeIcon icon={faLayerGroup} className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{group.name}</p>
                          <p className="text-xs text-gray-500">
                            {group.students.length} student{group.students.length === 1 ? "" : "s"}
                            {filtersActive && group.students.length !== group.total && (
                              <span className="text-gray-400"> of {group.total}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <FontAwesomeIcon
                        icon={faChevronRight}
                        className="w-3.5 h-3.5 mt-3.5 text-gray-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all shrink-0"
                      />
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-2">
                      {group.students.length === 0 ? (
                        <span className="text-xs text-gray-400">
                          {filtersActive ? "No matching students" : "No students yet"}
                        </span>
                      ) : (
                        <>
                          {counts.atRisk > 0 && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                              <FontAwesomeIcon
                                icon={faTriangleExclamation}
                                className="w-3 h-3"
                              />
                              {counts.atRisk} at risk
                            </span>
                          )}
                          {counts.safe > 0 && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                              <FontAwesomeIcon icon={faCircleCheck} className="w-3 h-3" />
                              {counts.safe} safe
                            </span>
                          )}
                          {counts.unscored > 0 && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                              <FontAwesomeIcon icon={faHourglassHalf} className="w-3 h-3" />
                              {counts.unscored} not scored
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setSelectedSectionKey(null)}
                className="px-3 py-2 bg-surface border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" />
                All sections
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 truncate">{selectedGroup.name}</h2>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-brand-600/10 text-brand-600 border border-brand-600/20 shrink-0">
                  {selectedGroup.students.length} student
                  {selectedGroup.students.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-subtle border-b border-gray-100">
                    <tr>
                      <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        Student
                      </th>
                      <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        Risk (ML)
                      </th>
                      <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {selectedGroup.students.map((user) => (
                      <tr
                        key={user.id}
                        onClick={() => router.push(`/faculty/students/${user.id}`)}
                        className="group hover:bg-subtle transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={user.name} src={user.picture_url} size="md" />
                            <p className="font-semibold text-gray-800">{user.name}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{user.email}</td>
                        <td className="py-3 px-4">
                          {predictions[user.id] ? (
                            <span
                              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${
                                predictions[user.id].risk === "at_risk"
                                  ? "bg-red-100 text-red-700 border-red-200"
                                  : "bg-emerald-100 text-emerald-700 border-emerald-200"
                              }`}
                              title={`Prediction from ${new Date(predictions[user.id].predicted_at).toLocaleString()}`}
                            >
                              {predictions[user.id].risk === "at_risk" ? "At Risk" : "Safe"}
                              {predictions[user.id].probability != null &&
                                ` · ${Math.round((predictions[user.id].probability as number) * 100)}%`}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">Not scored</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (openMenu?.user.id === user.id) {
                                setOpenMenu(null);
                                return;
                              }
                              const rect = e.currentTarget.getBoundingClientRect();
                              const openUp = rect.bottom + 150 > window.innerHeight;
                              setOpenMenu({
                                user,
                                x: rect.right,
                                y: openUp ? rect.top - 4 : rect.bottom + 4,
                                openUp,
                              });
                            }}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200/70 transition-all ${
                              openMenu?.user.id === user.id
                                ? "opacity-100 bg-gray-200/70"
                                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            }`}
                            aria-label={`Actions for ${user.name}`}
                          >
                            <FontAwesomeIcon icon={faEllipsisVertical} className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {selectedGroup.students.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-500">
                          No student accounts found in this section
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {openMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpenMenu(null)}
            onWheel={() => setOpenMenu(null)}
          />
          <div
            className="fixed z-50 w-40 bg-surface rounded-xl border border-hairline shadow-[0_8px_30px_rgba(0,0,0,0.12)] py-1"
            style={{
              left: openMenu.x,
              top: openMenu.y,
              transform: `translateX(-100%)${openMenu.openUp ? " translateY(-100%)" : ""}`,
            }}
          >
            <button
              onClick={() => {
                setOpenMenu(null);
                router.push(`/faculty/students/${openMenu.user.id}`);
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              View
            </button>
            <button
              onClick={() => {
                setOpenMenu(null);
                openUpdateModal(openMenu.user);
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Update
            </button>
            <button
              onClick={() => {
                setOpenMenu(null);
                openDeleteModal(openMenu.user);
              }}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          </div>
        </>
      )}

      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-2xl border border-hairline overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-hairline bg-subtle flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-600/10 rounded-lg flex items-center justify-center">
                  <FontAwesomeIcon icon={faFileCsv} className="text-brand-600 w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Bulk Add Students</h2>
                  <p className="text-sm text-gray-500">
                    Register multiple students from a CSV file
                  </p>
                </div>
              </div>
              <button
                onClick={closeBulkModal}
                disabled={isBulkImporting}
                className="p-2 hover:bg-gray-200 rounded-lg transition-all disabled:opacity-40"
              >
                <FontAwesomeIcon icon={faXmark} className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="p-4 rounded-xl border border-brand-600/20 bg-brand-600/5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-brand-600 mb-1">CSV format</p>
                    <p className="text-xs text-gray-600">
                      The first row must be a header. Column order doesn&apos;t matter and extra
                      columns are ignored.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={downloadCsvTemplate}
                    className="shrink-0 px-3 py-2 text-xs font-medium text-brand-600 bg-surface border border-brand-600/20 rounded-lg hover:bg-brand-600/10 transition-all flex items-center gap-2"
                  >
                    <FontAwesomeIcon icon={faDownload} className="w-3.5 h-3.5" />
                    Download template
                  </button>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-1.5 pr-4 font-semibold">Column</th>
                        <th className="py-1.5 pr-4 font-semibold">Required</th>
                        <th className="py-1.5 font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-600/10 text-gray-700">
                      <tr>
                        <td className="py-1.5 pr-4 font-mono">first_name</td>
                        <td className="py-1.5 pr-4">Yes</td>
                        <td className="py-1.5">Student&apos;s first name</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pr-4 font-mono">middle_name</td>
                        <td className="py-1.5 pr-4">No</td>
                        <td className="py-1.5">Middle name or initial (leave blank if none)</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pr-4 font-mono">last_name</td>
                        <td className="py-1.5 pr-4">Yes</td>
                        <td className="py-1.5">Student&apos;s last name</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pr-4 font-mono">email</td>
                        <td className="py-1.5 pr-4">Yes</td>
                        <td className="py-1.5">
                          Student&apos;s email — the invitation and temporary password are sent here
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pr-4 font-mono">section</td>
                        <td className="py-1.5 pr-4">No</td>
                        <td className="py-1.5">
                          Section name — must match one of your sections. Rows without one use the
                          default section selected below
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCsvFile(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => csvInputRef.current?.click()}
                  disabled={isBulkImporting}
                  className="w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-600 hover:border-brand-600/50 hover:bg-brand-600/5 transition-all disabled:opacity-50"
                >
                  {bulkFileName ? (
                    <span>
                      <span className="font-semibold text-gray-800">{bulkFileName}</span> — click to
                      choose a different file
                    </span>
                  ) : (
                    "Click to choose a CSV file"
                  )}
                </button>
              </div>

              <div>
                <label
                  htmlFor="bulk-default-section"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Default section
                </label>
                <select
                  id="bulk-default-section"
                  value={bulkDefaultSectionId}
                  onChange={(e) => setBulkDefaultSectionId(e.target.value)}
                  disabled={isBulkImporting}
                  className="w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 transition-all disabled:opacity-50"
                >
                  <option value="">No default — every row needs its own section</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-gray-500">
                  Applied to rows whose section column is blank.
                </p>
              </div>

              {bulkFileError && (
                <div className="p-3 rounded-lg text-sm border bg-red-50 text-red-700 border-red-200">
                  {bulkFileError}
                </div>
              )}

              {bulkRows.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-subtle border-b border-gray-100 text-xs text-gray-500">
                    {bulkRows.filter((r) => !r.invalidReason).length} of {bulkRows.length} row
                    {bulkRows.length === 1 ? "" : "s"} ready to import
                    {bulkRows.some((r) => r.invalidReason) && " — rows with problems are skipped"}
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-hairline">
                        {bulkRows.map((row) => (
                          <tr key={row.line} className={row.invalidReason ? "bg-red-50/40" : ""}>
                            <td className="py-2 px-4 text-xs text-gray-400 whitespace-nowrap">
                              Line {row.line}
                            </td>
                            <td className="py-2 px-2 text-gray-800 whitespace-nowrap">
                              {[row.firstName, row.middleName, row.lastName]
                                .filter(Boolean)
                                .join(" ") || "—"}
                            </td>
                            <td className="py-2 px-2 text-gray-500">{row.email || "—"}</td>
                            <td className="py-2 px-2 whitespace-nowrap">
                              {row.sectionId ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-600/10 text-brand-600 border border-brand-600/20">
                                  {row.sectionName}
                                </span>
                              ) : row.invalidReason ? (
                                <span className="text-xs text-gray-400">—</span>
                              ) : bulkDefaultSectionId ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                  {sections.find((s) => s.id === bulkDefaultSectionId)?.name}{" "}
                                  (default)
                                </span>
                              ) : (
                                <span className="text-xs text-amber-600">No section</span>
                              )}
                            </td>
                            <td className="py-2 px-4 text-right">
                              {row.invalidReason ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-red-600">
                                  <FontAwesomeIcon icon={faCircleXmark} className="w-3.5 h-3.5" />
                                  {row.invalidReason}
                                </span>
                              ) : row.status === "creating" ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-brand-600">
                                  <FontAwesomeIcon icon={faSpinner} spin className="w-3.5 h-3.5" />
                                  Creating…
                                </span>
                              ) : row.status === "created" ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
                                  <FontAwesomeIcon icon={faCircleCheck} className="w-3.5 h-3.5" />
                                  {row.resultText}
                                </span>
                              ) : row.status === "warning" ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-amber-600">
                                  <FontAwesomeIcon
                                    icon={faTriangleExclamation}
                                    className="w-3.5 h-3.5"
                                  />
                                  {row.resultText}
                                </span>
                              ) : row.status === "failed" ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-red-600">
                                  <FontAwesomeIcon icon={faCircleXmark} className="w-3.5 h-3.5" />
                                  {row.resultText}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">Ready</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {bulkFinished && (
                <div className="p-3 rounded-lg text-sm border bg-green-50 text-green-700 border-green-200">
                  Import finished:{" "}
                  {bulkRows.filter((r) => r.status === "created" || r.status === "warning").length}{" "}
                  created, {bulkRows.filter((r) => r.status === "failed").length} failed,{" "}
                  {bulkRows.filter((r) => r.invalidReason).length} skipped. Each new student
                  receives an email with a temporary password and must change it on first login.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-hairline bg-subtle flex-shrink-0">
              <button
                type="button"
                onClick={closeBulkModal}
                disabled={isBulkImporting}
                className="px-5 py-2.5 bg-surface border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all disabled:opacity-50"
              >
                {bulkFinished ? "Close" : "Cancel"}
              </button>
              {!bulkFinished && (
                <button
                  type="button"
                  onClick={handleBulkImport}
                  disabled={
                    isBulkImporting ||
                    bulkRows.every((r) => r.invalidReason) ||
                    bulkRows.length === 0 ||
                    (bulkRows.some((r) => !r.invalidReason && !r.sectionId) &&
                      !bulkDefaultSectionId)
                  }
                  className="px-6 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-all disabled:opacity-60 flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
                >
                  {isBulkImporting ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />
                      Importing…
                    </>
                  ) : (
                    `Import ${bulkRows.filter((r) => !r.invalidReason).length} Student${bulkRows.filter((r) => !r.invalidReason).length === 1 ? "" : "s"}`
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showUpdateModal && updatingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-lg border border-hairline overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-hairline bg-subtle">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-600/10 rounded-lg flex items-center justify-center">
                  <FontAwesomeIcon icon={faUser} className="text-brand-600 w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Update Student</h2>
                  <p className="text-sm text-gray-500">Edit student details</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowUpdateModal(false);
                  setUpdatingStudent(null);
                }}
                className="p-2 hover:bg-gray-200 rounded-lg transition-all"
              >
                <FontAwesomeIcon icon={faXmark} className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleUpdateStudent} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Student Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <FontAwesomeIcon icon={faUser} className="w-4 h-4 text-gray-500" />
                  </div>
                  <input
                    type="text"
                    value={updateName}
                    onChange={(e) => setUpdateName(e.target.value)}
                    placeholder="Full name"
                    className="w-full pl-10 pr-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all shadow-sm"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="update-student-email"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Student Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <FontAwesomeIcon icon={faEnvelope} className="w-4 h-4 text-gray-500" />
                  </div>
                  <input
                    id="update-student-email"
                    type="text"
                    ref={updateEmailRef}
                    placeholder="student@example.edu"
                    className="w-full pl-10 pr-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all shadow-sm"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="update-student-section"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Section
                </label>
                <select
                  id="update-student-section"
                  value={updateSectionId}
                  onChange={(e) => setUpdateSectionId(e.target.value)}
                  className="w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 transition-all shadow-sm"
                >
                  <option value="">
                    {updatingStudent.section
                      ? `Keep current (${updatingStudent.section})`
                      : "No section"}
                  </option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowUpdateModal(false);
                    setUpdatingStudent(null);
                  }}
                  className="px-5 py-2.5 bg-surface border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-6 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-all disabled:opacity-60 flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
                >
                  {isUpdating ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />
                      Updating...
                    </>
                  ) : (
                    "Update Student"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && deletingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-md border border-hairline overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-hairline bg-subtle">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <FontAwesomeIcon icon={faTrashCan} className="text-red-600 w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Delete Student</h2>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletingStudent(null);
                }}
                className="p-2 hover:bg-gray-200 rounded-lg transition-all"
              >
                <FontAwesomeIcon icon={faXmark} className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-gray-600 text-sm">
                Are you sure you want to delete{" "}
                <span className="font-semibold text-gray-900">{deletingStudent.name}</span>? This
                action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-hairline bg-subtle">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletingStudent(null);
                }}
                className="px-5 py-2.5 bg-surface border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteStudent}
                disabled={isDeleting}
                className="px-6 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />
                    Deleting...
                  </>
                ) : (
                  "Delete Student"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
