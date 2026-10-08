/** PostgREST caps a response at 1000 rows; ask for pages of that size. */
const PAGE = 1000;

/**
 * Every row a query matches, a page at a time, so nothing is silently cut off
 * at the row cap. Give the query a stable order (e.g. `.order('id')`) so pages
 * don't overlap. The row shape is asserted here rather than inferred: the
 * client types a many-to-one embed (`scenarios(title)`) as an array, though
 * PostgREST returns it as a single object.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}
