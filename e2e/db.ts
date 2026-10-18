import postgres from "postgres";

/**
 * Arrange-only helpers for e2e tests. They move a fresh user's plan into the past so the
 * weekly job has closed weeks to look at — the app itself is exercised only through the UI/API.
 */
export function testDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  return postgres(url, { max: 1, onnotice: () => {} });
}

/** Shifts all of a user's planned sessions `days` earlier (multiples of 7 keep weekdays). */
export async function backdatePlan(sql: postgres.Sql, email: string, days: number): Promise<void> {
  await sql`
    update planned_session set date = date - ${days}::int
    where user_id = (select id from "user" where email = ${email})`;
}

export async function firstSessions(sql: postgres.Sql, email: string, limit: number) {
  return sql<{ id: string; date: string; target_km: number; type: string }[]>`
    select s.id, to_char(s.date, 'YYYY-MM-DD') as date, s.target_km, s.type
    from planned_session s join "user" u on u.id = s.user_id
    where u.email = ${email} and s.type <> 'rest'
    order by s.date limit ${limit}`;
}
