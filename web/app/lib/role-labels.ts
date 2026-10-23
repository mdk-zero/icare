/**
 * What each role is called on screen. The stored values stay as they are
 * (super_admin, admin, faculty); only the names people read changed.
 */
export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Admin",
  admin: "Dean",
  faculty: "Instructor",
  student: "Student",
};

/**
 * A Dean-level account's title (users.admin_title, migration 080). A Program
 * Chair is stored as a Dean (role admin) and has exactly a Dean's access;
 * only the name differs. Null is a Dean.
 */
export type AdminTitle = "program_chair";

export const ADMIN_TITLE_LABEL: Record<AdminTitle, string> = {
  program_chair: "Program Chair",
};

export function parseAdminTitle(value: unknown): AdminTitle | null {
  return value === "program_chair" ? value : null;
}

/** "Dean" or "Program Chair" for a Dean-level account; the other roles as ROLE_LABEL names them. */
export function roleLabel(role: string | null | undefined, adminTitle?: string | null): string {
  if (!role) return "";
  const title = role === "admin" ? parseAdminTitle(adminTitle) : null;
  if (title) return ADMIN_TITLE_LABEL[title];
  return ROLE_LABEL[role] ?? role.replace("_", " ");
}
