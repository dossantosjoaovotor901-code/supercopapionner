import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildDemoChampionship } from "./seed";

let testDirectory = "";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  if (testDirectory) rmSync(testDirectory, { recursive: true, force: true });
  testDirectory = "";
});

describe("local image storage", () => {
  it("serves uploaded logos locally and preserves existing uploaded image paths", async () => {
    testDirectory = resolve(
      tmpdir(),
      `copapulse-local-storage-${crypto.randomUUID()}`
    );
    const uploadsDirectory = resolve(testDirectory, "uploads");
    const legacyLogoPath = "championship/legacy-logo.png";
    mkdirSync(resolve(uploadsDirectory, "championship"), { recursive: true });
    writeFileSync(resolve(uploadsDirectory, legacyLogoPath), "legacy image");

    vi.stubEnv("LOCAL_MODE", "true");
    vi.stubEnv("LOCAL_UPLOADS_DIR", uploadsDirectory);
    vi.stubEnv("LOCAL_DB_PATH", resolve(testDirectory, "state.sqlite"));
    vi.stubEnv("LOCAL_SNAPSHOT", resolve(testDirectory, "snapshot.json"));
    vi.stubEnv("LOCAL_START_EMPTY", "false");

    const state = buildDemoChampionship();
    state.config.logoUrl = `/manus-storage/${legacyLogoPath}`;
    state.teams[0]!.logoUrl = `/manus-storage/${legacyLogoPath}`;
    state.teams[1]!.logoUrl = "/manus-storage/championship/missing-logo.png";
    writeFileSync(
      resolve(testDirectory, "snapshot.json"),
      JSON.stringify({ state, revision: 1 })
    );

    vi.resetModules();
    const storage = await import("./storage");
    const uploaded = await storage.storagePut(
      "championship/logo.png",
      Buffer.from("new image"),
      "image/png"
    );
    expect(uploaded.url).toMatch(/^\/local-storage\/championship\/logo_[a-f0-9]{8}\.png$/);
    expect(existsSync(resolve(uploadsDirectory, uploaded.key))).toBe(true);

    const local = await import("./local");
    const localized = local.localizeAssets(state);
    expect(localized.config.logoUrl).toBe(
      `/local-storage/${legacyLogoPath}`
    );
    expect(localized.teams[0]!.logoUrl).toBe(
      `/local-storage/${legacyLogoPath}`
    );
    expect(localized.teams[1]!.logoUrl).toBe("/favicon-pionner.png");
  });
});
