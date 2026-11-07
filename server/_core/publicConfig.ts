// Only these public values may reach the browser. Never serialize process.env.
export function publicPlatformConfig(env: NodeJS.ProcessEnv = process.env) {
  const localMode = env.LOCAL_MODE === "true" || env.LOCAL_MODE === "1";

  return {
    appName: "Super Copa Pionner",
    projectId: env.DISCORD_CLIENT_ID ?? env.MANUS_PROJECT_ID ?? "",
    oauthPortalUrl: env.DISCORD_REDIRECT_URI ?? env.MANUS_OAUTH_PORTAL_URL ?? "",
    apiUrl: env.MANUS_API_URL ?? "",
    apiBrowserKey: env.GOOGLE_MAPS_API_KEY ?? env.MANUS_API_BROWSER_KEY ?? "",
    localMode,
    discordConfigured: Boolean(
      env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET
    ),
    discordLoginPath: "/api/discord/login",
    localLoginPath: "/api/local/login",
  };
}

export function publicPlatformScript(
  env: NodeJS.ProcessEnv = process.env
): string {
  const json = JSON.stringify(publicPlatformConfig(env)).replaceAll(
    "<",
    "\u003c"
  );
  return `window.__APP_CONFIG__=${json};`;
}
