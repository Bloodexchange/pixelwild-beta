import { getMigrations } from "better-auth/db/migration";
import { auth, db, configured } from "../server/auth";
if (!configured())
  throw new Error(
    "Set DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL in .env.local first",
  );
try {
  const migrations = await getMigrations(auth().options);
  await migrations.runMigrations();
  await db().query(
    'CREATE TABLE IF NOT EXISTS worlds (user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, state JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  console.log("Auth tables and worlds table are ready.");
} finally {
  await db().end();
}
