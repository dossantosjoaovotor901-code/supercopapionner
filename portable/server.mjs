import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const dataDir = resolve(process.env.PORTABLE_DATA_DIR || resolve(ROOT, "data"));
const uploadsDir = resolve(
  process.env.PORTABLE_UPLOADS_DIR || resolve(ROOT, "uploads")
);
const databasePath = resolve(
  process.env.PORTABLE_DB || resolve(dataDir, "super-copa-pionner.sqlite")
);
const port = Number(process.env.PORT || 3010);
const adminKey = process.env.PORTABLE_ADMIN_KEY || "change-me";
mkdirSync(dataDir, { recursive: true });
mkdirSync(uploadsDir, { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS championship_state (
    id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS match_replays (
    match_id TEXT PRIMARY KEY, file_name TEXT NOT NULL, mime TEXT NOT NULL,
    storage_path TEXT NOT NULL, uploaded_at TEXT NOT NULL
  );
`);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > 40 * 1024 * 1024) reject(new Error("payload exceeds 40 MB"));
      else chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function getState() {
  const row = db
    .prepare("SELECT payload, revision FROM championship_state WHERE id = 1")
    .get();
  if (!row) return null;
  return { state: JSON.parse(row.payload), revision: row.revision };
}
function safeFileName(name) {
  const ext =
    extname(name)
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, "")
      .slice(0, 8) || ".mp4";
  return `${randomUUID()}${ext}`;
}

const server = createServer(async (req, res) => {
  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`
  );
  try {
    if (req.method === "GET" && url.pathname === "/api/health")
      return sendJson(res, 200, { status: "ok", database: "sqlite" });
    if (req.method === "GET" && url.pathname === "/api/tournament") {
      const snapshot = getState();
      return snapshot
        ? sendJson(res, 200, snapshot)
        : sendJson(res, 404, { error: "Run node portable/init.mjs first" });
    }
    const replayMatch = url.pathname.match(/^\/api\/replays\/([^/]+)$/);
    if (req.method === "GET" && replayMatch) {
      const row = db
        .prepare(
          "SELECT match_id, file_name, mime, storage_path, uploaded_at FROM match_replays WHERE match_id = ?"
        )
        .get(replayMatch[1]);
      return row
        ? sendJson(res, 200, row)
        : sendJson(res, 404, { error: "Replay not found" });
    }
    if (req.method === "POST" && replayMatch) {
      if (req.headers["x-admin-key"] !== adminKey)
        return sendJson(res, 401, { error: "admin key required" });
      const snapshot = getState();
      const match = snapshot?.state.matches.find(
        item => item.id === replayMatch[1]
      );
      if (!match) return sendJson(res, 404, { error: "Match not found" });
      if (match.status !== "finished")
        return sendJson(res, 400, {
          error: "Replay is allowed only for finished matches",
        });
      const input = JSON.parse(await readBody(req));
      if (!input.fileName || !input.base64)
        return sendJson(res, 400, {
          error: "fileName and base64 are required",
        });
      const bytes = Buffer.from(
        String(input.base64).replace(/^data:[^;]+;base64,/, ""),
        "base64"
      );
      if (!bytes.length || bytes.length > 30 * 1024 * 1024)
        return sendJson(res, 400, { error: "Replay must be at most 30 MB" });
      const storedName = safeFileName(basename(String(input.fileName)));
      const storagePath = resolve(uploadsDir, storedName);
      writeFileSync(storagePath, bytes, { flag: "wx" });
      db.prepare(
        "INSERT INTO match_replays (match_id, file_name, mime, storage_path, uploaded_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(match_id) DO UPDATE SET file_name=excluded.file_name, mime=excluded.mime, storage_path=excluded.storage_path, uploaded_at=excluded.uploaded_at"
      ).run(
        replayMatch[1],
        basename(String(input.fileName)),
        String(input.mime || "application/octet-stream"),
        storagePath,
        new Date().toISOString()
      );
      return sendJson(res, 201, {
        matchId: replayMatch[1],
        fileName: basename(String(input.fileName)),
        path: `/uploads/${storedName}`,
      });
    }
    if (req.method === "GET" && url.pathname.startsWith("/uploads/")) {
      const requested = basename(url.pathname.slice("/uploads/".length));
      const file = resolve(uploadsDir, requested);
      if (!existsSync(file))
        return sendJson(res, 404, { error: "File not found" });
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return createReadStream(file).pipe(res);
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Internal error",
    });
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Portable Node + SQLite server on http://127.0.0.1:${port}`)
);
