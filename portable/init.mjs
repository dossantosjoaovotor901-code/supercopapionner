import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const dataDir = resolve(process.env.PORTABLE_DATA_DIR || resolve(ROOT, "data"));
const databasePath = resolve(
  process.env.PORTABLE_DB || resolve(dataDir, "super-copa-pionner.sqlite")
);
const snapshotPath = resolve(
  process.env.PORTABLE_SNAPSHOT || resolve(dataDir, "championship.json")
);

mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS championship_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS match_replays (
    match_id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    uploaded_at TEXT NOT NULL
  );
`);

const existing = db
  .prepare("SELECT id, revision FROM championship_state WHERE id = 1")
  .get();
if (!existing) {
  const payload = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const state = payload.state || payload;
  const revision = Number(payload.revision || 1);
  db.prepare(
    "INSERT INTO championship_state (id, payload, revision, updated_at) VALUES (1, ?, ?, ?)"
  ).run(JSON.stringify(state), revision, new Date().toISOString());
  console.log(`Snapshot inserido em ${databasePath} (revisão ${revision}).`);
} else {
  console.log(
    `SQLite já inicializado em ${databasePath} (revisão ${existing.revision}); nada foi sobrescrito.`
  );
}
db.close();
