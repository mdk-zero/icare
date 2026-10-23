import type { User } from "./api";

type Role = User["role"];

/**
 * What the app calls each stored role, matching the web portal
 * (web/app/lib/role-labels.ts). The stored values stay as they are.
 */
const ROLE_LABEL: Record<Role, string> = {
  student: "Student",
  faculty: "Instructor",
  admin: "Dean",
  super_admin: "Admin",
};

/**
 * A Program Chair is stored as a Dean (role admin) with admin_title
 * 'program_chair' (web migration 080), with a Dean's access; only the name
 * differs.
 */
export function roleLabel(role: Role | null | undefined, adminTitle?: string | null): string {
  if (role === "admin" && adminTitle === "program_chair") return "Program Chair";
  return role ? ROLE_LABEL[role] ?? role : "Student";
}

/**
 * Where each role lands after signing in. Students get the student tabs and
 * instructors their own; Deans (Program Chairs too) and Admins work on the web portal, so the app
 * tells them so instead of showing screens they cannot use.
 */
export function homeFor(role: Role | null | undefined): "/" | "/courses" | "/web-portal" {
  if (role === "faculty") return "/courses";
  if (role === "admin" || role === "super_admin") return "/web-portal";
  return "/";
}
