import { afterEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

let testDirectory = "";
let closeDatabase: (() => void) | undefined;

async function loadLocalAuth() {
  testDirectory = resolve(tmpdir(), `copapulse-auth-${crypto.randomUUID()}`);
  vi.stubEnv("LOCAL_DB_PATH", resolve(testDirectory, "accounts.sqlite"));
  vi.stubEnv("LOCAL_ADMIN_EMAIL", "admin@example.com");
  vi.stubEnv("LOCAL_ADMIN_PASSWORD", "strong-admin-password");
  vi.stubEnv("LOCAL_SESSION_SECRET", "test-session-secret");
  vi.resetModules();
  const auth = await import("./local");
  closeDatabase = auth.closeLocalDatabase;
  return auth;
}

afterEach(() => {
  closeDatabase?.();
  closeDatabase = undefined;
  vi.unstubAllEnvs();
  vi.resetModules();
  if (testDirectory) rmSync(testDirectory, { recursive: true, force: true });
  testDirectory = "";
});

describe("local email authentication", () => {
  it("creates regular accounts, verifies passwords, and authenticates sessions", async () => {
    const auth = await loadLocalAuth();
    const account = auth.createLocalAccount({
      name: "Jogador Um",
      email: "Player@Example.com",
      password: "my-secure-password",
    });

    expect(account.user).toMatchObject({
      email: "player@example.com",
      name: "Jogador Um",
      role: "user",
      loginMethod: "email",
    });
    expect(auth.getLocalUser(account.session)).toMatchObject({
      email: "player@example.com",
      role: "user",
    });
    expect(
      auth.authenticateLocalAccount("PLAYER@example.com", "my-secure-password")
    ).not.toBeNull();
    expect(
      auth.authenticateLocalAccount("player@example.com", "wrong-password")
    ).toBeNull();
  });

  it("prevents duplicate accounts and reserves the configured admin email", async () => {
    const auth = await loadLocalAuth();
    const input = {
      name: "Jogador Um",
      email: "player@example.com",
      password: "my-secure-password",
    };
    auth.createLocalAccount(input);

    expect(() => auth.createLocalAccount(input)).toThrow(
      "Já existe uma conta com este e-mail."
    );
    expect(() =>
      auth.createLocalAccount({
        ...input,
        email: "ADMIN@example.com",
      })
    ).toThrow("Este e-mail está reservado para o administrador.");
    expect(
      auth.authenticateLocalAccount("admin@example.com", "strong-admin-password")
    ).toMatchObject({ session: expect.any(String) });
    expect(auth.getLocalUser(auth.createLocalSession())).toMatchObject({
      email: "admin@example.com",
      role: "admin",
    });
  });
});
