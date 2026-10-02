/**
 * The Taylor's skills catalog, served from the bundled JSON the server falls
 * back on. Loaded only when a page asks for skills: it is most of a megabyte.
 */

async function catalog() {
  return import("@/app/lib/taylor-skills");
}

export async function listSkillSummaries() {
  const { listSkills } = await catalog();
  // A client that always errors drops listSkills onto the bundled catalog.
  return listSkills(noDatabase);
}

export async function skillDetails(ids: string[]) {
  const { getSkills, skillVariants } = await catalog();
  const skills = await getSkills(noDatabase, ids.slice(0, 20));
  return skills.map((s) => ({ ...s, variants: skillVariants(s.id, s.steps) }));
}

/** A stand-in Supabase client whose every query fails, so the catalog code reads the bundled JSON. */
const failing: unknown = new Proxy(() => undefined, {
  get: (_target, prop) =>
    prop === "then"
      ? (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: "demo" } })
      : failing,
  apply: () => failing,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- duck-typed stand-in
const noDatabase = failing as any;
