/**
 * Applies db/migrations/*.sql in order, once each, inside a transaction per
 * file. Safe to run repeatedly.
 *
 *   DATABASE_URL=postgres://... npm run db:migrate
 */
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = new Set((await client.query("SELECT version FROM schema_migrations")).rows.map((row) => row.version));
  const files = (await readdir(new URL("../db/migrations/", import.meta.url))).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) { console.log(`  skip   ${file}`); continue; }
    const sql = await readFile(new URL(`../db/migrations/${file}`, import.meta.url), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`  apply  ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`  failed ${file}: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await client.end();
}
