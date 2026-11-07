import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { SignJWT } from "jose";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];

    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }

    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });

    const redirectUri =
      process.env.DISCORD_CALLBACK_URL ||
      `${req.protocol}://${req.get("host")}/api/discord/callback`;
    const clientId = process.env.DISCORD_CLIENT_ID || "";
    const clientSecret = process.env.DISCORD_CLIENT_SECRET || "";

    if (!clientId || !clientSecret) {
      res.status(500).json({ error: "Discord OAuth is not configured" });
      return;
    }

    try {
      const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error("Discord token exchange failed");
      }

      const token = (await tokenResponse.json()) as { access_token?: string };
      if (!token.access_token) {
        throw new Error("Discord access token missing");
      }

      const userResponse = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });

      if (!userResponse.ok) {
        throw new Error("Discord user lookup failed");
      }

      const userInfo = (await userResponse.json()) as {
        id?: string;
        username?: string;
        global_name?: string;
        email?: string;
      };

      if (!userInfo.id) {
        res.status(400).json({ error: "discord user id missing" });
        return;
      }

      const openId = `discord:${userInfo.id}`;
      await db.upsertUser({
        openId,
        name: userInfo.global_name || userInfo.username || `Discord:${userInfo.id}`,
        email: userInfo.email ?? null,
        loginMethod: "discord",
        lastSignedIn: new Date(),
      });

      const sessionToken = await new SignJWT({
        openId,
        appId: process.env.DISCORD_CLIENT_ID || "super-copa-pionner",
        name: userInfo.global_name || userInfo.username || "Discord user",
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
        .sign(new TextEncoder().encode(process.env.SESSION_SECRET || "development-session-secret"));

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error instanceof Error ? error.message : "unknown error");
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
