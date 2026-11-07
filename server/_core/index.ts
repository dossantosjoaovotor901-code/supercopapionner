import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { getChampionshipSnapshot } from "../championship";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import {
  createDiscordSession,
  createLocalSession,
  discordConfigured,
  isDiscordAdmin,
  isLocalMode,
  verifyLocalCredentials,
} from "../local";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/bot/snapshot", async (req, res) => {
    const expected = process.env.BOT_API_TOKEN || "";
    const received = req.header("x-bot-token") || "";
    if (!expected || received !== expected) {
      res.status(401).json({ error: "bot não autorizado" });
      return;
    }
    try {
      const snapshot = await getChampionshipSnapshot();
      res.json({ ...snapshot, serverTime: new Date().toISOString() });
    } catch (error) {
      console.error("Bot snapshot failed:", error);
      res.status(503).json({ error: "campeonato indisponível" });
    }
  });
  if (isLocalMode) {
    app.get("/api/discord/login", (req, res) => {
      if (!discordConfigured) {
          res
            .status(503)
            .type("html")
            .send(
              "<!doctype html><meta charset=\"utf-8\"><title>Discord não configurado</title><h1>Login Discord indisponível</h1><p>O responsável pelo servidor precisa configurar DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET e DISCORD_ADMIN_ID no arquivo .env e reiniciar o servidor.</p><a href=\"/admin\">Voltar</a>"
            );
          return;
        }
      const state = randomUUID();
      const redirectUri =
        process.env.DISCORD_REDIRECT_URI ||
        `${req.protocol}://${req.get("host")}/api/discord/callback`;
      res.cookie("discord_oauth_state", state, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 600000,
        path: "/",
      });
      const params = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID || "",
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "identify email",
        state,
      });
      res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
    });
    app.get("/api/discord/callback", async (req, res) => {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      if (
        !discordConfigured ||
        !code ||
        state !==
          parseCookieHeader(req.headers.cookie || "").discord_oauth_state
      ) {
        res.status(400).send("OAuth Discord inválido ou expirado.");
        return;
      }
      try {
        const redirectUri =
          process.env.DISCORD_REDIRECT_URI ||
          `${req.protocol}://${req.get("host")}/api/discord/callback`;
        const tokenResponse = await fetch(
          "https://discord.com/api/oauth2/token",
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: process.env.DISCORD_CLIENT_ID || "",
              client_secret: process.env.DISCORD_CLIENT_SECRET || "",
              grant_type: "authorization_code",
              code,
              redirect_uri: redirectUri,
            }),
          }
        );
        if (!tokenResponse.ok) throw new Error("Discord token exchange failed");
        const token = (await tokenResponse.json()) as { access_token?: string };
        const profileResponse = await fetch(
          "https://discord.com/api/users/@me",
          { headers: { Authorization: `Bearer ${token.access_token}` } }
        );
        const profile = (await profileResponse.json()) as {
          id: string;
          email?: string;
          username?: string;
          global_name?: string;
        };
        if (!profile.id || !isDiscordAdmin(profile.id, profile.email)) {
          res
            .status(403)
            .send(
              "Esta conta Discord não está autorizada como administradora."
            );
          return;
        }
        res.clearCookie("discord_oauth_state", { path: "/" });
        res.cookie(
          "local_session",
          createDiscordSession({
            id: profile.id,
            email: profile.email || "",
            name:
              profile.global_name ||
              profile.username ||
              "Administrador Discord",
          }),
          {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            maxAge: 31536000000,
            path: "/",
          }
        );
        res.redirect("/");
      } catch {
        res.status(502).send("Não foi possível concluir o login Discord.");
      }
    });
    app.get("/api/local/login", (_req, res) => {
      res
        .type("html")
        .send(
          `<!doctype html><meta charset="utf-8"><title>Login — Super Copa Pionner</title><style>body{font:16px system-ui;max-width:420px;margin:12vh auto;padding:24px;background:#f4f8ff;color:#102a56}form{display:grid;gap:12px;background:#fff;padding:24px;border-radius:16px;box-shadow:0 8px 30px #102a5620}input,button{padding:12px;border:1px solid #d6e1f2;border-radius:8px;font:inherit}button{background:#2563eb;color:#fff;border:0;cursor:pointer}</style><h1>Super Copa Pionner</h1><p>Login do administrador local</p><form method="post" action="/api/local/login"><input name="email" type="email" placeholder="E-mail" required><input name="password" type="password" placeholder="Senha" required><button>Entrar no painel</button></form>`
        );
    });
    app.post("/api/local/login", (req, res) => {
      const { email, password } = req.body as {
        email?: string;
        password?: string;
      };
      if (!verifyLocalCredentials(email || "", password || "")) {
        res
          .status(401)
          .type("html")
          .send("Login inválido. <a href='/api/local/login'>Voltar</a>");
        return;
      }
      res.cookie("local_session", createLocalSession(), {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 31536000000,
        path: "/",
      });
      res.redirect("/");
    });
    app.post("/api/local/logout", (_req, res) => {
      res.clearCookie("local_session", { path: "/" });
      res.json({ success: true });
    });
    app.use(
      "/local-storage",
      express.static(
        path.resolve(process.env.LOCAL_UPLOADS_DIR || "./data/uploads")
      )
    );
  }
  app.get("/api/platform/config.js", (_req, res) => {
    res
      .set("Cache-Control", "no-store")
      .type("application/javascript")
      .send(publicPlatformScript());
  });
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  server.on("error", error => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });
  server.listen(port, "0.0.0.0", () =>
    console.log(`Server listening on port ${port}`)
  );
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
