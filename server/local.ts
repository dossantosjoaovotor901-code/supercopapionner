import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { User } from "../drizzle/schema";
import type { Championship } from "../shared/championship";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string) => any;
};

export const isLocalMode =
  process.env.LOCAL_MODE === "true" || process.env.LOCAL_MODE === "1";
const dataDir = resolve(process.env.LOCAL_DATA_DIR || "./data");
const dbPath = resolve(
  process.env.LOCAL_DB_PATH || resolve(dataDir, "super-copa-pionner.sqlite")
);
const seedPath = resolve(
  process.env.LOCAL_SNAPSHOT || "./portable/data/championship.json"
);
const sessionSecret =
  process.env.LOCAL_SESSION_SECRET || "change-this-local-secret";
const adminEmail = (process.env.LOCAL_ADMIN_EMAIL || "joao28031991@gmail.com")
  .trim()
  .toLowerCase();
const adminPassword = process.env.LOCAL_ADMIN_PASSWORD || "troque-esta-senha";

let db: any = null;
function getLocalDb() {
  if (db) return db;
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec(
    `PRAGMA journal_mode=WAL;
     CREATE TABLE IF NOT EXISTS championship_state (
       id INTEGER PRIMARY KEY CHECK(id=1),
       payload TEXT NOT NULL,
       revision INTEGER NOT NULL,
       updated_at TEXT NOT NULL
     );
     CREATE TABLE IF NOT EXISTS local_accounts (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       email TEXT NOT NULL UNIQUE COLLATE NOCASE,
       name TEXT NOT NULL,
       password_salt TEXT NOT NULL,
       password_hash TEXT NOT NULL,
       created_at TEXT NOT NULL
     );`
  );
  return db;
}

export function closeLocalDatabase() {
  db?.close();
  db = null;
}

type LocalAccount = {
  id: number;
  email: string;
  name: string;
  password_salt: string;
  password_hash: string;
  created_at: string;
};

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function accountUser(account: LocalAccount): User {
  const createdAt = new Date(account.created_at);
  return {
    id: account.id + 1,
    openId: `local-account:${account.id}`,
    email: account.email,
    name: account.name,
    loginMethod: "email",
    role: "user",
    createdAt,
    updatedAt: createdAt,
    lastSignedIn: createdAt,
  };
}

export function createLocalAccount(input: {
  email: string;
  name: string;
  password: string;
}) {
  const email = input.email.trim().toLowerCase();
  if (email === adminEmail) {
    throw new Error("Este e-mail está reservado para o administrador.");
  }
  const database = getLocalDb();
  if (database.prepare("SELECT id FROM local_accounts WHERE email=?").get(email)) {
    throw new Error("Já existe uma conta com este e-mail.");
  }
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(input.password, salt, 64).toString("hex");
  const createdAt = new Date().toISOString();
  const result = database
    .prepare(
      "INSERT INTO local_accounts (email,name,password_salt,password_hash,created_at) VALUES (?,?,?,?,?) ON CONFLICT(email) DO NOTHING"
    )
    .run(email, input.name.trim(), salt, passwordHash, createdAt);
  if (Number(result.changes) !== 1) {
    throw new Error("Já existe uma conta com este e-mail.");
  }
  const accountId = Number(result.lastInsertRowid);
  return {
    user: accountUser({
      id: accountId,
      email,
      name: input.name.trim(),
      password_salt: salt,
      password_hash: passwordHash,
      created_at: createdAt,
    }),
    session: createAccountSession(accountId),
  };
}

export function authenticateLocalAccount(emailInput: string, password: string) {
  const email = emailInput.trim().toLowerCase();
  if (email === adminEmail) {
    return safeEqual(password, adminPassword)
      ? { session: createLocalSession() }
      : null;
  }
  const account = getLocalDb()
    .prepare("SELECT * FROM local_accounts WHERE email=?")
    .get(email) as LocalAccount | undefined;
  if (!account) {
    scryptSync(password, "copapulse-unknown-account", 64);
    return null;
  }
  const passwordHash = scryptSync(password, account.password_salt, 64).toString(
    "hex"
  );
  return safeEqual(passwordHash, account.password_hash)
    ? { session: createAccountSession(account.id) }
    : null;
}

export function localizeAssets(state: Championship): Championship {
  const next = JSON.parse(JSON.stringify(state)) as Championship;
  const uploadsDir = resolve(process.env.LOCAL_UPLOADS_DIR || "./data/uploads");
  const localizeAsset = (url: string) => {
    const prefix = "/manus-storage/";
    if (!url.startsWith(prefix)) return url;
    const key = url.slice(prefix.length);
    const filePath = resolve(uploadsDir, key);
    const pathFromRoot = relative(uploadsDir, filePath);
    if (
      !key ||
      pathFromRoot === ".." ||
      pathFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(pathFromRoot) ||
      !existsSync(filePath)
    ) {
      return "/favicon-pionner.png";
    }
    return `/local-storage/${key.replace(/\\/g, "/")}`;
  };
  next.config.logoUrl = localizeAsset(next.config.logoUrl);
  next.teams = next.teams.map(team =>
    ({ ...team, logoUrl: localizeAsset(team.logoUrl) })
  );
  return next;
}

function ensureSnapshot() {
  const database = getLocalDb();
  if (database.prepare("SELECT id FROM championship_state WHERE id=1").get())
    return;
  let source: { state: Championship; revision?: number };
  try {
    source = JSON.parse(readFileSync(seedPath, "utf8")) as {
      state: Championship;
      revision?: number;
    };
  } catch {
    throw new Error(
      `Snapshot local não encontrado em ${seedPath}. Execute a partir da raiz do projeto.`
    );
  }
  const state = localizeAssets(source.state);
  if (process.env.LOCAL_START_EMPTY !== "false") {
    state.teams = [];
    state.players = [];
    state.phases = [];
    state.matches = [];
    state.announcements = [];
    state.config.currentPhaseId = "";
    state.config.demo = false;
  }
  database
    .prepare(
      "INSERT INTO championship_state (id,payload,revision,updated_at) VALUES (1,?,?,?)"
    )
    .run(JSON.stringify(state), source.revision || 1, new Date().toISOString());
}

export function getLocalSnapshot(): { state: Championship; revision: number } {
  ensureSnapshot();
  const row = getLocalDb()
    .prepare("SELECT payload, revision FROM championship_state WHERE id=1")
    .get() as { payload: string; revision: number };
  return {
    state: localizeAssets(JSON.parse(row.payload) as Championship),
    revision: row.revision,
  };
}

export function saveLocalSnapshot(
  state: Championship,
  expectedRevision: number
) {
  ensureSnapshot();
  const nextRevision = expectedRevision + 1;
  const result = getLocalDb()
    .prepare(
      "UPDATE championship_state SET payload=?, revision=?, updated_at=? WHERE id=1 AND revision=?"
    )
    .run(
      JSON.stringify(state),
      nextRevision,
      new Date().toISOString(),
      expectedRevision
    );
  if (Number(result.changes) !== 1)
    throw new Error(
      "Conflito de revisão: recarregue a página e tente novamente."
    );
  return { state, revision: nextRevision };
}

export function verifyLocalCredentials(email: string, password: string) {
  return (
    email.trim().toLowerCase() === adminEmail && password === adminPassword
  );
}
function sign(value: string) {
  return createHmac("sha256", sessionSecret).update(value).digest("hex");
}
export function createLocalSession() {
  return `admin.${sign(adminEmail)}`;
}
export function createDiscordSession(user: {
  id: string;
  email: string;
  name: string;
}) {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  return `discord.${payload}.${sign(payload)}`;
}
export function isDiscordAdmin(
  userId: string,
  email: string | null | undefined
) {
  const configuredId = (process.env.DISCORD_ADMIN_ID || "").trim();
  return Boolean(
    (configuredId && userId === configuredId) ||
      (email && email.trim().toLowerCase() === adminEmail)
  );
}
function createAccountSession(accountId: number) {
  const value = String(accountId);
  return `account.${value}.${sign(`account:${value}`)}`;
}
export function getLocalUser(token: string | undefined): User | null {
  if (!token) return null;
  const [kind, value, signature] = token.split(".");
  if (kind === "admin" && value === sign(adminEmail))
    return {
      id: 1,
      openId: `local:${adminEmail}`,
      email: adminEmail,
      name: "Administrador",
      loginMethod: "local",
      role: "admin",
      createdAt: new Date(0),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
  if (kind === "discord" && value && signature) {
    if (!safeEqual(signature, sign(value))) return null;
    try {
      const user = JSON.parse(
        Buffer.from(value, "base64url").toString("utf8")
      ) as { id: string; email: string; name: string };
      if (!isDiscordAdmin(user.id, user.email)) return null;
      return {
        id: 1,
        openId: `discord:${user.id}`,
        email: user.email,
        name: user.name || "Administrador Discord",
        loginMethod: "discord",
        role: "admin",
        createdAt: new Date(0),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };
    } catch {
      return null;
    }
  }
  if (kind !== "account" || !value || !signature || !/^\d+$/.test(value))
    return null;
  if (!safeEqual(signature, sign(`account:${value}`))) return null;
  const account = getLocalDb()
    .prepare("SELECT * FROM local_accounts WHERE id=?")
    .get(Number(value)) as LocalAccount | undefined;
  return account ? accountUser(account) : null;
}
export const discordConfigured = Boolean(
  process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
);
export { adminEmail };
