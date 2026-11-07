import { describe, expect, it } from "vitest";
import type { Championship } from "../shared/championship";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { validateAndPropagateState } from "./championship";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function baseState(): Championship {
  return {
    config: {
      name: "Super Copa Pionner",
      edition: "2026",
      subtitle: "Edição oficial",
      logoUrl: "https://example.com/logo.png",
      currentPhaseId: "phase-group",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      venue: "Arena Central",
      demo: false,
      rules: "Regulamento oficial da competição.",
    },
    teams: [
      {
        id: "team-blue",
        name: "Azul FC",
        shortName: "AZU",
        color: "#2563eb",
        group: "A",
        city: "São Paulo",
        logoUrl: "https://example.com/azul.png",
      },
      {
        id: "team-gold",
        name: "Ouro FC",
        shortName: "OUR",
        color: "#f59e0b",
        group: "A",
        city: "Santos",
        logoUrl: "",
      },
    ],
    players: [
      {
        id: "player-blue-10",
        teamId: "team-blue",
        name: "Ana Azul",
        nickname: "Aninha",
        number: 10,
        position: "Atacante",
        goals: 2,
        assists: 1,
      },
    ],
    phases: [
      { id: "phase-group", name: "Fase de grupos", kind: "group", order: 1 },
    ],
    matches: [
      {
        id: "match-1",
        phaseId: "phase-group",
        homeId: "team-blue",
        awayId: "team-gold",
        scheduledAt: "2026-11-10T19:00:00Z",
        venue: "Arena Central",
        status: "scheduled",
        homeScore: 0,
        awayScore: 0,
        homePenalties: null,
        awayPenalties: null,
        minute: 0,
        nextMatchId: null,
        nextSlot: null,
        winnerId: null,
        notes: "Partida de abertura",
        streamUrl: "https://example.com/stream",
        replayUrl: "",
        replayName: "",
      },
    ],
    announcements: [
      {
        id: "announcement-1",
        title: "Abertura da competição",
        text: "A primeira rodada começa nesta semana.",
        date: "2026-11-05",
      },
    ],
  };
}

function contextWithUser(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function regularUser(): AuthenticatedUser {
  return {
    id: 7,
    openId: "regular-user",
    email: "user@example.com",
    name: "Usuário comum",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

describe("admin championship management", () => {
  it("validates cadastro, edição, exclusão e campos oficiais no agregado", () => {
    const created = validateAndPropagateState(baseState());
    expect(created.config).toMatchObject({
      name: "Super Copa Pionner",
      logoUrl: "https://example.com/logo.png",
      rules: "Regulamento oficial da competição.",
    });
    expect(created.teams).toHaveLength(2);
    expect(created.players[0]).toMatchObject({ goals: 2, assists: 1 });
    expect(created.matches[0]).toMatchObject({
      streamUrl: "https://example.com/stream",
      notes: "Partida de abertura",
    });

    const edited = clone(created);
    edited.config.subtitle = "Edição atualizada";
    edited.config.rules = "Regulamento revisado pela organização.";
    edited.config.logoUrl = "https://example.com/logo-atualizado.png";
    edited.teams[0]!.name = "Azul Pionner FC";
    edited.players[0]!.goals = 5;
    edited.players[0]!.assists = 3;
    edited.phases[0]!.name = "Rodada inicial";
    edited.matches[0]!.homeScore = 2;
    edited.matches[0]!.awayScore = 1;
    edited.matches[0]!.status = "finished";
    edited.announcements[0]!.text = "A rodada foi atualizada.";

    const normalizedEdit = validateAndPropagateState(edited);
    expect(normalizedEdit.config).toMatchObject({
      subtitle: "Edição atualizada",
      logoUrl: "https://example.com/logo-atualizado.png",
    });
    expect(normalizedEdit.teams[0]?.name).toBe("Azul Pionner FC");
    expect(normalizedEdit.players[0]).toMatchObject({ goals: 5, assists: 3 });
    expect(normalizedEdit.matches[0]).toMatchObject({
      homeScore: 2,
      awayScore: 1,
      status: "finished",
      winnerId: "team-blue",
    });
    expect(normalizedEdit.announcements[0]?.text).toBe(
      "A rodada foi atualizada."
    );

    const deleted = clone(normalizedEdit);
    deleted.config.currentPhaseId = "";
    deleted.teams = [];
    deleted.players = [];
    deleted.phases = [];
    deleted.matches = [];
    deleted.announcements = [];
    const normalizedDelete = validateAndPropagateState(deleted);
    expect(normalizedDelete.teams).toHaveLength(0);
    expect(normalizedDelete.players).toHaveLength(0);
    expect(normalizedDelete.phases).toHaveLength(0);
    expect(normalizedDelete.matches).toHaveLength(0);
    expect(normalizedDelete.announcements).toHaveLength(0);
  });

  it.each([
    ["sessão ausente", null],
    ["usuário sem papel admin", regularUser()],
  ] as const)("rejeita %s antes de acessar o banco", async (_label, user) => {
    const caller = appRouter.createCaller(contextWithUser(user));

    await expect(
      caller.tournament.save({ state: baseState(), revision: 0 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
