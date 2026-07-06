import postgres from "postgres";
import type { Env } from "./env.js";

export type Sql = ReturnType<typeof postgres>;

/**
 * One connection per request/cron invocation. Workers can't share sockets
 * across invocations; Hyperdrive does the real pooling in front of Railway.
 * Callers must `await closeDb(sql)` (or let `finally` blocks do it).
 */
export function openDb(env: Env): Sql {
  return postgres(env.HYPERDRIVE.connectionString, {
    max: 2,
    fetch_types: false, // avoid an extra round-trip; we only use core types
    prepare: false, // Hyperdrive works best without named prepared statements
  });
}

export async function closeDb(sql: Sql): Promise<void> {
  try {
    await sql.end({ timeout: 2 });
  } catch {
    // closing is best-effort
  }
}
