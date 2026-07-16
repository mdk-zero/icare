"use client";

import { useState, useEffect, useRef } from "react";
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
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchFacultyStudents,
  createFacultyStudent,
  fetchAllStudentUsers,
  fetchAllPredictions,
  updateStudentUser,
  deleteStudentUser,
  logAuditAction,
  getCurrentFacultyUser,
  FacultyStudent,
  StudentUser,
  RiskPrediction,
} from "../../lib/api";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";
import Card from "../../components/Card";

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

const STUDENT_CSV_TEMPLATE = `first_name,middle_name,last_name,email
Juan,Santos,Dela Cruz,juan.delacruz@batstate-u.edu.ph
Maria,,Reyes,maria.reyes@batstate-u.edu.ph
`;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface BulkRow {
  line: number;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
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

  useEffect(() => {
    loadStudents();
    loadStudentUsers();
  }, [riskFilter, searchQuery]);

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
  const updateEmailRef = useRef<HTMLInputElement>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState<StudentUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkFileName, setBulkFileName] = useState<string | null>(null);
  const [bulkFileError, setBulkFileError] = useState<string | null>(null);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [bulkFinished, setBulkFinished] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const closeBulkModal = () => {
    if (isBulkImporting) return;
    setShowBulkModal(false);
    setBulkRows([]);
    setBulkFileName(null);
    setBulkFileError(null);
    setBulkFinished(false);
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
    const parsed: BulkRow[] = rows.slice(1).map((cells, i) => {
      const row: BulkRow = {
        line: i + 2,
        firstName: (cells[firstIdx] ?? "").trim(),
        middleName: middleIdx === -1 ? "" : (cells[middleIdx] ?? "").trim(),
        lastName: (cells[lastIdx] ?? "").trim(),
        email: (cells[emailIdx] ?? "").trim().toLowerCase(),
        status: "ready",
      };
      if (!row.firstName) row.invalidReason = "Missing first name";
      else if (!row.lastName) row.invalidReason = "Missing last name";
      else if (!row.email) row.invalidReason = "Missing email";
      else if (!EMAIL_REGEX.test(row.email)) row.invalidReason = "Invalid email address";
      else if (seenEmails.has(row.email)) row.invalidReason = "Duplicate email in this file";
      else if (existingEmails.has(row.email)) row.invalidReason = "A student with this email already exists";
      seenEmails.add(row.email);
      return row;
    });

    setBulkRows(parsed);
  };

  const handleBulkImport = async () => {
    const importable = bulkRows.filter((r) => !r.invalidReason);
    if (importable.length === 0 || isBulkImporting) return;

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

      try {
        const { data, error } = await createFacultyStudent(fullName, email);
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
      const { data, error } = await createFacultyStudent(fullName, emailTrimmed);

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
      if (newEmailRef.current) newEmailRef.current.value = "";
      loadStudents();
      loadStudentUsers();
      const faculty = getCurrentFacultyUser();
      if (faculty) {
        logAuditAction({
          faculty_id: faculty.id,
          faculty_name: faculty.name,
          tab: 'students',
          action: 'register_student',
          details: `Registered new student ${fullName}`,
          target_type: 'student',
          target_id: data?.student?.id ?? '',
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
          tab: 'students',
          action: 'update_student',
          details: `Updated student ${data!.name}`,
          target_type: 'student',
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
          tab: 'students',
          action: 'delete_student',
          details: `Deleted student ${deletingStudent.name}`,
          target_type: 'student',
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

  const openUpdateModal = (student: StudentUser) => {
    setUpdatingStudent(student);
    setUpdateName(student.name);
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

  const atRiskCount = studentUsers.filter((u) => predictions[u.id]?.risk === "at_risk").length;
  const safeCount = studentUsers.filter((u) => predictions[u.id]?.risk === "safe").length;

  return (
    <div>
      <PageHeader
        badge={{
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z M12 14l9-5-9-5-9 5 9 5z M12 22v-6" />
            </svg>
          ),
          label: "Student Management",
        }}
        title="My Students"
        subtitle="Manage and monitor students under your supervision"
        action={{
          icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          ),
          onClick: () => {
            setShowCreateModal(true);
            setMessage(null);
            setCreatedPassword(null);
            setCopiedPassword(false);
            if (newEmailRef.current) newEmailRef.current.value = "";
          },
          label: "Register Student",
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <StatTile
          icon={<FontAwesomeIcon icon={faUser} className="w-5 h-5" />}
          value={students.length}
          label="Total Students"
          iconBg="bg-[#1B6B7B]/10"
          iconColor="text-[#1B6B7B]"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faTriangleExclamation} className="w-5 h-5" />}
          value={atRiskCount}
          label="At Risk (ML)"
          iconBg="bg-red-50"
          iconColor="text-red-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faUser} className="w-5 h-5" />}
          value={safeCount}
          label="Safe (ML)"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setShowCreateModal(true);
              setMessage(null);
              setCreatedPassword(null);
              setCopiedPassword(false);
              if (newEmailRef.current) newEmailRef.current.value = "";
            }}
            className="px-4 py-2.5 bg-[#1B6B7B] text-white font-medium rounded-lg hover:bg-[#145A63] transition-all flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
          >
            <FontAwesomeIcon icon={faPlus} className="w-5 h-5" />
            Register Student
          </button>
          <button
            onClick={() => {
              setShowBulkModal(true);
              setMessage(null);
            }}
            className="px-4 py-2.5 bg-white border border-[#1B6B7B]/30 text-[#1B6B7B] font-medium rounded-lg hover:bg-[#1B6B7B]/5 transition-all flex items-center gap-2"
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
              className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/50 focus:border-[#1B6B7B] transition-all w-64"
            />
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="w-5 h-5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2"
            />
          </div>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/50 focus:border-[#1B6B7B] transition-all cursor-pointer"
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
          <div className="bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-lg border border-gray-200/80 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100/80 bg-gray-50/50 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-lg flex items-center justify-center">
                  <FontAwesomeIcon icon={faPlus} className="text-[#1B6B7B] w-5 h-5" />
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
                        className="w-full pl-10 pr-4 py-3 bg-white border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] focus:bg-white transition-all shadow-sm"
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
                        className="w-full pl-10 pr-3 py-3 bg-white border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] focus:bg-white transition-all shadow-sm"
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
                        className="w-full pl-10 pr-4 py-3 bg-white border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] focus:bg-white transition-all shadow-sm"
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
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] focus:bg-white transition-all shadow-sm"
                  />
                </div>
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
                <div className="p-4 rounded-xl border border-[#1B6B7B]/20 bg-[#1B6B7B]/5">
                  <p className="text-sm font-medium text-[#1B6B7B] mb-2">
                    Temporary password for {firstName ? `${firstName} ` : ""}
                    {lastName}
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdPassword}
                      className="flex-1 px-3 py-2 bg-white border border-[#1B6B7B]/20 rounded-lg text-sm font-mono text-gray-800 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdPassword);
                        setCopiedPassword(true);
                        setTimeout(() => setCopiedPassword(false), 2000);
                      }}
                      className="px-3 py-2 text-sm font-medium text-[#1B6B7B] bg-white border border-[#1B6B7B]/20 rounded-lg hover:bg-[#1B6B7B]/10 transition-all"
                    >
                      {copiedPassword ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-[#1B6B7B]/70 mt-2">
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
                    if (newEmailRef.current) newEmailRef.current.value = "";
                    setMessage(null);
                    setCreatedPassword(null);
                    setCopiedPassword(false);
                  }}
                  className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-[#1B6B7B] text-white font-medium rounded-lg hover:bg-[#145A63] transition-all disabled:opacity-60 flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
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
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200 overflow-hidden">
          {loadingStudentUsers ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/50 border-b border-gray-100">
                  <tr>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Risk (ML)</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/80">
                  {[1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
                          <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
                      </td>
                      <td className="py-3 px-4">
                        <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
                      </td>
                      <td className="py-3 px-4">
                        <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-16 bg-gray-200 rounded-lg animate-pulse" />
                          <div className="h-8 w-16 bg-gray-200 rounded-lg animate-pulse" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/50 border-b border-gray-100">
                  <tr>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Risk (ML)</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/80">
                  {filteredStudentUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-full flex items-center justify-center text-[#1B6B7B] font-semibold">
                            {user.name?.charAt(0) || "?"}
                          </div>
                          <p className="font-semibold text-gray-800">{user.name}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{user.email}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[#1B6B7B]/10 text-[#1B6B7B] border border-[#1B6B7B]/20">
                          {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                        </span>
                      </td>
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
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openUpdateModal(user)}
                            className="px-3 py-1.5 text-xs font-medium text-[#1B6B7B] bg-[#1B6B7B]/10 hover:bg-[#1B6B7B]/20 rounded-lg transition-all"
                          >
                            Update
                          </button>
                          <button
                            onClick={() => openDeleteModal(user)}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-all"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredStudentUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500">
                        No student accounts found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-2xl border border-gray-200/80 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100/80 bg-gray-50/50 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-lg flex items-center justify-center">
                  <FontAwesomeIcon icon={faFileCsv} className="text-[#1B6B7B] w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Bulk Add Students</h2>
                  <p className="text-sm text-gray-500">Register multiple students from a CSV file</p>
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
              <div className="p-4 rounded-xl border border-[#1B6B7B]/20 bg-[#1B6B7B]/5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#1B6B7B] mb-1">CSV format</p>
                    <p className="text-xs text-gray-600">
                      The first row must be a header. Column order doesn&apos;t matter and extra
                      columns are ignored.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={downloadCsvTemplate}
                    className="shrink-0 px-3 py-2 text-xs font-medium text-[#1B6B7B] bg-white border border-[#1B6B7B]/20 rounded-lg hover:bg-[#1B6B7B]/10 transition-all flex items-center gap-2"
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
                    <tbody className="divide-y divide-[#1B6B7B]/10 text-gray-700">
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
                  className="w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-600 hover:border-[#1B6B7B]/50 hover:bg-[#1B6B7B]/5 transition-all disabled:opacity-50"
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

              {bulkFileError && (
                <div className="p-3 rounded-lg text-sm border bg-red-50 text-red-700 border-red-200">
                  {bulkFileError}
                </div>
              )}

              {bulkRows.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50/50 border-b border-gray-100 text-xs text-gray-500">
                    {bulkRows.filter((r) => !r.invalidReason).length} of {bulkRows.length} row
                    {bulkRows.length === 1 ? "" : "s"} ready to import
                    {bulkRows.some((r) => r.invalidReason) && " — rows with problems are skipped"}
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-gray-100/80">
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
                            <td className="py-2 px-4 text-right">
                              {row.invalidReason ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-red-600">
                                  <FontAwesomeIcon icon={faCircleXmark} className="w-3.5 h-3.5" />
                                  {row.invalidReason}
                                </span>
                              ) : row.status === "creating" ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-[#1B6B7B]">
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
                                  <FontAwesomeIcon icon={faTriangleExclamation} className="w-3.5 h-3.5" />
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

            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-100/80 bg-gray-50/50 flex-shrink-0">
              <button
                type="button"
                onClick={closeBulkModal}
                disabled={isBulkImporting}
                className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all disabled:opacity-50"
              >
                {bulkFinished ? "Close" : "Cancel"}
              </button>
              {!bulkFinished && (
                <button
                  type="button"
                  onClick={handleBulkImport}
                  disabled={isBulkImporting || bulkRows.every((r) => r.invalidReason) || bulkRows.length === 0}
                  className="px-6 py-2.5 bg-[#1B6B7B] text-white font-medium rounded-lg hover:bg-[#145A63] transition-all disabled:opacity-60 flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
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
          <div className="bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-lg border border-gray-200/80 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100/80 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-lg flex items-center justify-center">
                  <FontAwesomeIcon icon={faUser} className="text-[#1B6B7B] w-5 h-5" />
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
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] focus:bg-white transition-all shadow-sm"
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
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] focus:bg-white transition-all shadow-sm"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowUpdateModal(false);
                    setUpdatingStudent(null);
                  }}
                  className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-6 py-2.5 bg-[#1B6B7B] text-white font-medium rounded-lg hover:bg-[#145A63] transition-all disabled:opacity-60 flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
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
          <div className="bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-md border border-gray-200/80 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100/80 bg-gray-50/50">
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
            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-100/80 bg-gray-50/50">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletingStudent(null);
                }}
                className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
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

