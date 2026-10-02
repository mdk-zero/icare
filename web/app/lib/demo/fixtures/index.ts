import { DEMO_VIEWERS, seedPeople } from "./people";
import { seedNotifications, type DemoNotification } from "./notifications";
import { seedAudit, type DemoAudit } from "./audit";
import { seedSchool } from "./school";
import { seedWard } from "./ward";
import { seedTeaching } from "./teaching";
import { seedSystem } from "./system";

/** A fresh copy of every demo table, as it stands before the visitor changes anything. */
export function seed() {
  const people = seedPeople();
  const base = {
    viewers: { ...DEMO_VIEWERS } as Record<string, string>,
    ...people,
  };
  const school = seedSchool(people.users, people.teams);
  const system = seedSystem();
  return {
    ...base,
    ...school,
    ...seedWard(school.rooms, school.patients, people.users),
    ...seedTeaching(people.users),
    testRuns: system.testRuns,
    notifications: [
      ...seedNotifications(people.users, school.assignments, school.scenarios),
      system.accessRequest,
    ] as DemoNotification[],
    audit: seedAudit() as DemoAudit[],
  };
}
