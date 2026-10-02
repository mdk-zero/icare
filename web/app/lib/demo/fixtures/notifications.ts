import { ADMIN_ID, DEAN_ID, INSTRUCTOR_ID, KIND, ago, demoId } from "./people";

export interface DemoNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

let n = 0;
function note(
  userId: string,
  type: string,
  title: string,
  body: string,
  createdDaysAgo: number,
  read: boolean,
  data: Record<string, unknown> = {},
): DemoNotification {
  n += 1;
  const created_at = ago(createdDaysAgo);
  return { id: demoId(KIND.notification, n), user_id: userId, type, title, body, data, read_at: read ? created_at : null, created_at };
}

export function seedNotifications(): DemoNotification[] {
  n = 0;
  return [
    note(INSTRUCTOR_ID, "system", "Welcome to the iCARE++ demo", "Everything here is sample data. Explore freely — it resets when you log out.", 0.01, false),
    note(DEAN_ID, "system", "Welcome to the iCARE++ demo", "Everything here is sample data. Explore freely — it resets when you log out.", 0.01, false),
    note(ADMIN_ID, "system", "Welcome to the iCARE++ demo", "Everything here is sample data. Explore freely — it resets when you log out.", 0.01, false),
  ];
}
