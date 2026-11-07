export {};
declare global {
  interface Window {
    __APP_CONFIG__?: {
      appName?: string;
      projectId?: string;
      oauthPortalUrl?: string;
      apiUrl?: string;
      apiBrowserKey?: string;
      localMode?: boolean;
      discordConfigured?: boolean;
      discordLoginPath?: string;
      localLoginPath?: string;
    };
  }
}
