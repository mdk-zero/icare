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

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "";
  return ROLE_LABEL[role] ?? role.replace("_", " ");
}
