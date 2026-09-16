-- 033_developer_console.sql
--
-- Catalog introspection for the developer console (/developer), which browses
-- and edits arbitrary tables. The console discovers the schema at runtime
-- instead of carrying a hardcoded table list, so a table added by a later
-- migration shows up with no code change.
--
-- Everything here reads pg_catalog, which is world-readable, so the functions
-- are SECURITY INVOKER: they grant no access the caller does not already have.
-- Execute is granted to service_role only — the console reaches Postgres
-- through the service-role key and nothing else should call these.

-- Every table and view the console can offer, excluding Postgres internals and
-- the schemas Supabase manages itself.
create or replace function public.dev_list_tables()
returns table (
  schema_name text,
  table_name text,
  kind text,
  row_estimate bigint,
  total_bytes bigint,
  has_primary_key boolean
)
language sql
stable
set search_path = pg_catalog, public
as $$
  select
    n.nspname::text,
    c.relname::text,
    case c.relkind
      when 'r' then 'table'
      when 'p' then 'table'
      when 'v' then 'view'
      when 'm' then 'materialized view'
    end,
    -- reltuples is -1 on a relation that has never been analyzed, and any
    -- estimate is stale by definition; the console labels it approximate.
    greatest(c.reltuples, 0)::bigint,
    pg_total_relation_size(c.oid)::bigint,
    exists (
      select 1 from pg_constraint pk
      where pk.conrelid = c.oid and pk.contype = 'p'
    )
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm')
    and n.nspname not in (
      'pg_catalog', 'information_schema', 'auth', 'storage', 'realtime',
      '_realtime', 'vault', 'extensions', 'graphql', 'graphql_public', 'net',
      'cron', 'pgsodium', 'pgsodium_masks', 'supabase_functions',
      'supabase_migrations', 'pgbouncer'
    )
    and n.nspname not like 'pg\_%'
  order by 1, 2;
$$;

-- Per-column metadata: enough for the console to render a typed editor —
-- which control to draw, which values are legal, and which columns identify
-- the row. `check_clause` carries the raw constraint text so a
-- `check (role in ('student','faculty','admin'))` can become a dropdown.
create or replace function public.dev_table_columns(p_schema text, p_table text)
returns table (
  column_name text,
  ordinal integer,
  data_type text,
  udt_name text,
  is_nullable boolean,
  default_expr text,
  is_identity boolean,
  is_generated boolean,
  is_primary_key boolean,
  enum_values text[],
  check_clause text,
  references_table text,
  references_column text
)
language sql
stable
set search_path = pg_catalog, public
as $$
  with rel as (
    select c.oid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = p_schema and c.relname = p_table
    limit 1
  ),
  pk as (
    select unnest(con.conkey) as attnum
    from pg_constraint con, rel
    where con.conrelid = rel.oid and con.contype = 'p'
  ),
  -- Single-column foreign keys only; a composite key has no sensible
  -- per-column "this points at that" to show beside one input.
  fk as (
    select
      con.conkey[1] as attnum,
      n2.nspname || '.' || c2.relname as ref_table,
      a2.attname::text as ref_column
    from pg_constraint con
    cross join rel
    join pg_class c2 on c2.oid = con.confrelid
    join pg_namespace n2 on n2.oid = c2.relnamespace
    join pg_attribute a2
      on a2.attrelid = con.confrelid and a2.attnum = con.confkey[1]
    where con.conrelid = rel.oid
      and con.contype = 'f'
      and array_length(con.conkey, 1) = 1
  ),
  ck as (
    select
      con.conkey[1] as attnum,
      string_agg(pg_get_constraintdef(con.oid), ' AND ') as clause
    from pg_constraint con, rel
    where con.conrelid = rel.oid
      and con.contype = 'c'
      and array_length(con.conkey, 1) = 1
    group by con.conkey[1]
  )
  select
    a.attname::text,
    a.attnum::integer,
    format_type(a.atttypid, a.atttypmod)::text,
    t.typname::text,
    not a.attnotnull,
    pg_get_expr(ad.adbin, ad.adrelid)::text,
    a.attidentity <> '',
    a.attgenerated <> '',
    exists (select 1 from pk where pk.attnum = a.attnum),
    case
      when t.typtype = 'e' then (
        select array_agg(e.enumlabel::text order by e.enumsortorder)
        from pg_enum e where e.enumtypid = t.oid
      )
    end,
    (select ck.clause from ck where ck.attnum = a.attnum),
    (select fk.ref_table from fk where fk.attnum = a.attnum),
    (select fk.ref_column from fk where fk.attnum = a.attnum)
  from pg_attribute a
  cross join rel
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  where a.attrelid = rel.oid
    and a.attnum > 0
    and not a.attisdropped
  order by a.attnum;
$$;

-- Rows elsewhere that point AT this table, with the delete rule Postgres will
-- actually apply. The console shows this before a delete so a cascade cannot
-- take rows by surprise — the deployed audit_logs FK already diverges from the
-- migration that supposedly defined it.
create or replace function public.dev_table_relations(p_schema text, p_table text)
returns table (
  constraint_name text,
  child_schema text,
  child_table text,
  child_column text,
  parent_column text,
  delete_rule text
)
language sql
stable
set search_path = pg_catalog, public
as $$
  with rel as (
    select c.oid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = p_schema and c.relname = p_table
    limit 1
  )
  select
    con.conname::text,
    n1.nspname::text,
    c1.relname::text,
    a1.attname::text,
    a2.attname::text,
    case con.confdeltype
      when 'a' then 'no action'
      when 'r' then 'restrict'
      when 'c' then 'cascade'
      when 'n' then 'set null'
      when 'd' then 'set default'
    end
  from pg_constraint con
  cross join rel
  join pg_class c1 on c1.oid = con.conrelid
  join pg_namespace n1 on n1.oid = c1.relnamespace
  join pg_attribute a1
    on a1.attrelid = con.conrelid and a1.attnum = con.conkey[1]
  join pg_attribute a2
    on a2.attrelid = con.confrelid and a2.attnum = con.confkey[1]
  where con.confrelid = rel.oid
    and con.contype = 'f'
  order by 2, 3, 4;
$$;

-- Read path for schemas PostgREST does not expose (dw, chiefly). Identifiers
-- are validated against the catalog and quoted, and the statement shape is
-- fixed at `select ... from <relation>` — this reads relations, it does not
-- run caller-supplied SQL.
create or replace function public.dev_select_rows(
  p_schema text,
  p_table text,
  p_limit integer default 50,
  p_offset integer default 0,
  p_order_by text default null,
  p_descending boolean default false
)
returns table (rows jsonb, total bigint)
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_oid oid;
  v_order text := '';
  v_rows jsonb;
  v_total bigint;
begin
  select c.oid into v_oid
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = p_schema
    and c.relname = p_table
    and c.relkind in ('r', 'p', 'v', 'm')
  limit 1;

  if v_oid is null then
    raise exception 'relation %.% does not exist', p_schema, p_table;
  end if;

  if p_order_by is not null then
    perform 1
    from pg_attribute a
    where a.attrelid = v_oid
      and a.attnum > 0
      and not a.attisdropped
      and a.attname = p_order_by;
    if not found then
      raise exception 'column % does not exist on %.%', p_order_by, p_schema, p_table;
    end if;
    v_order := format(
      ' order by %I %s', p_order_by,
      case when p_descending then 'desc' else 'asc' end
    );
  end if;

  execute format('select count(*) from %I.%I', p_schema, p_table) into v_total;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from '
    || '(select * from %I.%I%s limit %s offset %s) t',
    p_schema, p_table, v_order,
    greatest(coalesce(p_limit, 50), 0), greatest(coalesce(p_offset, 0), 0)
  ) into v_rows;

  return query select v_rows, v_total;
end;
$$;

revoke all on function public.dev_list_tables() from public, anon, authenticated;
revoke all on function public.dev_table_columns(text, text) from public, anon, authenticated;
revoke all on function public.dev_table_relations(text, text) from public, anon, authenticated;
revoke all on function public.dev_select_rows(text, text, integer, integer, text, boolean)
  from public, anon, authenticated;

grant execute on function public.dev_list_tables() to service_role;
grant execute on function public.dev_table_columns(text, text) to service_role;
grant execute on function public.dev_table_relations(text, text) to service_role;
grant execute on function public.dev_select_rows(text, text, integer, integer, text, boolean)
  to service_role;
