import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2];

if (mode !== "development" && mode !== "production") {
  console.error("Uso: node scripts/start-all.mjs <development|production>");
  process.exit(1);
}

loadEnv({ path: path.join(projectRoot, ".env"), override: true });

const isDevelopment = mode === "development";
const siteEntry = isDevelopment
  ? path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs")
  : path.join(projectRoot, "dist", "index.js");

if (!existsSync(siteEntry)) {
  console.error(
    isDevelopment
      ? "tsx não encontrado. Execute pnpm install antes de iniciar."
      : "Build não encontrado. Execute pnpm build antes de iniciar."
  );
  process.exit(1);
}

const port = process.env.PORT || "3000";
const baseEnv = {
  ...process.env,
  NODE_ENV: isDevelopment ? "development" : "production",
};
if (!isDevelopment) baseEnv.LOCAL_MODE = "true";

const children = [];
let stopping = false;
let exitCode = 0;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

function start(label, script, args, env = baseEnv) {
  console.log(`[${label}] iniciando...`);
  const child = spawn(process.execPath, [script, ...args], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  child.on("error", error => {
    console.error(`[${label}] falha ao iniciar: ${error.message}`);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(
        `[${label}] encerrou inesperadamente (${signal || `código ${code}`}); finalizando os outros processos.`
      );
      stop(code ?? 1);
    }
    if (
      stopping &&
      children.every(
        process => process.exitCode !== null || process.signalCode !== null
      )
    ) {
      process.exitCode = exitCode;
    }
  });
  return child;
}

async function waitForSite(port, siteProcess) {
  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  const deadline = Date.now() + 60_000;
  let lastError = "sem resposta";
  console.log(`[site] aguardando resposta em http://localhost:${port}...`);

  while (!stopping && Date.now() < deadline) {
    if (siteProcess.exitCode !== null || siteProcess.signalCode !== null) {
      return false;
    }
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return true;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (!stopping) {
    console.error(`[site] não respondeu em 60 segundos (${lastError}).`);
    stop(1);
  }
  return false;
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

let siteProcess;
if (isDevelopment) {
  siteProcess = start("site", siteEntry, ["watch", "server/_core/index.ts"]);
} else {
  siteProcess = start("site", siteEntry, []);
}

if (await waitForSite(port, siteProcess)) {
  let apiUrl;
  try {
    apiUrl = new URL(
      process.env.BOT_API_URL ||
        `http://localhost:${port}/api/bot/snapshot`
    );
    if (apiUrl.hostname === "localhost" || apiUrl.hostname === "::1") {
      apiUrl.hostname = "127.0.0.1";
    }
  } catch (error) {
    console.error(`[bot] BOT_API_URL inválida: ${error.message}`);
    stop(1);
  }

  if (!stopping && apiUrl) {
    const botEnv = {
      ...baseEnv,
      SITE_URL: process.env.SITE_URL || `http://localhost:${port}`,
      BOT_API_URL: apiUrl.toString(),
    };
    start("bot", path.join(projectRoot, "bot", "discord-bot.mjs"), [], botEnv);
  }
}
