import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeAll, beforeEach } from "vitest";

// Minimal stand-in for the parts of Supabase the migrations rely on:
// roles anon/authenticated, auth.users and auth.uid() read from the JWT claim.
const SUPABASE_MOCK = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
`;

export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_MOCK);
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;

/**
 * One database per test file (PGlite boots in ~30s on slow machines);
 * every test runs inside a transaction that is rolled back, so tests stay isolated.
 */
export function useDb() {
  const ref = {} as { db: Db };
  beforeAll(async () => {
    ref.db = await createDb();
  }, 300_000);
  beforeEach(async () => {
    await ref.db.exec("begin");
  });
  afterEach(async () => {
    await ref.db.exec("rollback");
  });
  return ref;
}

let n = 0;
/** Creates an auth user (profile is created by trigger) and returns its id. */
export async function createUser(db: Db, opts: { admin?: boolean; phone?: string } = {}) {
  const id = crypto.randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `u${++n}@test.uz`]);
  if (opts.admin || opts.phone) {
    await db.query("update public.profiles set is_admin = $2, phone = $3 where id = $1", [
      id,
      !!opts.admin,
      opts.phone ?? null,
    ]);
  }
  return id;
}

/** Runs queries as the given user (or anon), exactly like a request through the Supabase API. */
export async function as<T>(
  db: Db,
  userId: string | null,
  fn: () => Promise<T>,
  aal: "aal1" | "aal2" = "aal2",
): Promise<T> {
  // savepoint: an expected error rolls back only this call, not the whole test transaction
  await db.exec("savepoint as_call");
  const claims = userId ? JSON.stringify({ sub: userId, aal }) : "";
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
  await db.exec(`set role ${userId ? "authenticated" : "anon"}`);
  try {
    const result = await fn();
    await db.exec("release savepoint as_call");
    return result;
  } catch (e) {
    await db.exec("rollback to savepoint as_call");
    throw e;
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

/** Superuser helper: a verified, open station owned by `owner`. */
export async function createStation(
  db: Db,
  owner: string,
  overrides: Partial<{ status: string; work_status: string; methane: string; max_queue: number }> = {},
) {
  const r = await db.query<{ id: string }>(
    `insert into public.stations (name, address, phone, lat, lng, status, work_status, methane, max_queue)
     values ('Метан №12', 'ул. Буюк Ипак Йули, 283', '+998901234567', 41.33, 69.33, $1, $2, $3, $4) returning id`,
    [
      overrides.status ?? "verified",
      overrides.work_status ?? "open",
      overrides.methane ?? "available",
      overrides.max_queue ?? 60,
    ],
  );
  const id = r.rows[0].id;
  await db.query("insert into public.station_members (station_id, user_id, role) values ($1, $2, 'owner')", [id, owner]);
  return id;
}

export async function addVehicle(db: Db, user: string, plate: string) {
  const r = await db.query<{ id: string }>(
    "insert into public.vehicles (user_id, plate) values ($1, $2) returning id",
    [user, plate],
  );
  return r.rows[0].id;
}
