import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getRelations, WRITABLE_SCHEMA } from '@/app/lib/dev/catalog';
import { devErrorResponse, devNotFound, requireDeveloper } from '@/app/lib/dev/guard';

type Params = { params: Promise<{ id: string }> };

/**
 * What a delete would actually take with it.
 *
 * Counts live rows per incoming foreign key and pairs each with the delete
 * rule Postgres will apply. The rule is read from the database, not from the
 * migration that declared it — audit_logs already cascades in the deployed
 * schema though migration 011 says set null.
 */
export async function GET(_request: Request, { params }: Params) {
  const session = await requireDeveloper();
  if (!session) return devNotFound();

  try {
    const { id } = await params;
    const relations = await getRelations(WRITABLE_SCHEMA, 'users');
    const supabase = getSupabaseAdmin();

    const counted = await Promise.all(
      relations.map(async (relation) => {
        if (relation.child_schema !== WRITABLE_SCHEMA) {
          return { ...relation, count: null, error: 'schema not exposed' };
        }
        const { count, error } = await supabase
          .from(relation.child_table)
          .select('*', { count: 'exact', head: true })
          .eq(relation.child_column, id);
        return {
          ...relation,
          count: error ? null : (count ?? 0),
          error: error?.message,
        };
      }),
    );

    return NextResponse.json({
      // A zero-row FK tells the developer nothing; only what is actually
      // attached is worth reading before confirming a delete.
      references: counted.filter((entry) => entry.count === null || entry.count > 0),
    });
  } catch (err) {
    return devErrorResponse(err);
  }
}
