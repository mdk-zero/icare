/** Request telemetry helpers (migration 054). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `/api/faculty/students/9f…/tasks` → `/api/faculty/students/:id/tasks`. */
export function normalizeRoute(path: string): string | null {
  const bare = path.split('?')[0].split('#')[0];
  if (!bare.startsWith('/api/') || bare.length > 300) return null;
  return bare
    .split('/')
    .map((segment) => (UUID.test(segment) || /^\d+$/.test(segment) || segment.length > 40 ? ':id' : segment))
    .join('/');
}
