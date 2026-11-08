import { describe, expect, it } from "vitest";
import type {
  CompetitionEdition,
  Registration,
} from "@shared/championship";
import { buildDemoChampionship } from "./seed";
import {
  applyCompetitionResult,
  buildCompetitionSchedule,
  removeCompetitionEdition,
} from "./routers";

function registration(index: number): Registration {
  const now = "2026-11-06T12:00:00.000Z";
  return {
    id: `registration-${index}`,
    code: `SCP-${String(index).padStart(5, "0")}`,
    teamName: `Equipe ${index}`,
    shortName: `EQ${index}`,
    logoUrl: "",
    teamDiscord: "",
    captainName: `Capitão ${index}`,
    captainDiscord: "",
    captainUserId: `user-${index}`,
    players: [{
      id: `player-${index}`,
      name: `Jogador ${index}`,
      discord: "",
      nickname: "",
      isCaptain: true,
      isReserve: false,
    }],
    acceptedRules: true,
    acceptedFinancial: true,
    responsible: true,
    status: "confirmed",
    paymentDeadline: "",
    notes: "",
    createdAt: now,
    updatedAt: now,
    history: [{
      id: `history-${index}`,
      status: "confirmed",
      note: "Confirmada",
      createdAt: now,
      actorName: "Sistema",
    }],
  };
}

function edition(
  type: CompetitionEdition["type"],
  registrations: Registration[]
): CompetitionEdition {
  const base = buildDemoChampionship();
  const state = {
    ...base,
    config: {
      ...base.config,
      name: "Mini campeonato",
      competitionType: type,
      startDate: "2026-11-06",
      endDate: "2026-11-06",
      registrationDeadline: "2026-11-06",
      paymentDeadline: "",
      maxTeams: 16,
    },
    teams: [],
    players: [],
    phases: [],
    matches: [],
    registrations,
    payments: [],
  };
  return {
    id: `competition-${type}`,
    type,
    eventDate: "2026-11-06",
    archivedAt: "",
    status: "registration",
    state,
  };
}

describe("competition editions", () => {
  it("generates a same-day weekly knockout with a bye and archives the winner", () => {
    const scheduled = buildCompetitionSchedule(
      edition("weekly", [registration(1), registration(2), registration(3)])
    );
    expect(scheduled.status).toBe("running");
    expect(scheduled.state.matches).toHaveLength(2);
    expect(scheduled.state.matches[0]?.scheduledAt).toBe(
      "2026-11-06T12:00:00.000Z"
    );
    const semifinal = scheduled.state.matches[0]!;
    const final = scheduled.state.matches[1]!;
    expect(final.homeId).toBeNull();
    expect(final.awayId).toBe("event-team-registration-3");

    const afterSemifinal = applyCompetitionResult(scheduled, {
      competitionId: scheduled.id,
      matchId: semifinal.id,
      homeScore: 2,
      awayScore: 1,
      homePenalties: null,
      awayPenalties: null,
    });
    expect(afterSemifinal.state.matches[1]?.homeId).toBe(semifinal.homeId);

    const champion = applyCompetitionResult(afterSemifinal, {
      competitionId: scheduled.id,
      matchId: final.id,
      homeScore: 3,
      awayScore: 0,
      homePenalties: null,
      awayPenalties: null,
    });
    expect(champion.status).toBe("completed");
    expect(champion.archivedAt).toBeTruthy();
  });

  it("creates a round-robin schedule for league editions", () => {
    const scheduled = buildCompetitionSchedule(
      edition("league", [registration(1), registration(2), registration(3)])
    );
    expect(scheduled.state.matches).toHaveLength(3);
    expect(scheduled.state.matches.every(match => match.scheduledAt.startsWith(scheduled.eventDate))).toBe(true);
  });

  it("removes a competition without changing other editions", () => {
    const first = edition("weekly", []);
    const second = { ...edition("cup", []), id: "keep-this-one" };
    const state = {
      ...buildDemoChampionship(),
      competitions: [first, second],
    };

    const result = removeCompetitionEdition(state, first.id);

    expect(result.competitions).toEqual([second]);
    expect(state.competitions).toEqual([first, second]);
  });

  it("returns not found when deleting an unknown competition", () => {
    const state = { ...buildDemoChampionship(), competitions: [] };
    expect(() => removeCompetitionEdition(state, "missing")).toThrow(
      "Competição não encontrada."
    );
  });
});
