import { describe, expect, it } from "vitest";
import type { Championship } from "@shared/championship";
import { buildDemoChampionship } from "./seed";
import {
  ChampionshipConflictError,
  ChampionshipValidationError,
  generateAutomaticTournament,
  nextChampionshipRevision,
  validateAndPropagateState,
} from "./championship";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("championship aggregate", () => {
  it("accepts the demo shape and propagates the finished quarterfinal", () => {
    const normalized = validateAndPropagateState(buildDemoChampionship());
    const quarter2 = normalized.matches.find(match => match.id === "quarter-2");
    const semi1 = normalized.matches.find(match => match.id === "semi-1");
    const semi2 = normalized.matches.find(match => match.id === "semi-2");

    expect(normalized.teams).toHaveLength(16);
    expect(
      normalized.matches.filter(match => match.phaseId === "phase-grupos")
    ).toHaveLength(24);
    expect(normalized.matches[0]?.deadline).toBe("");
    expect(quarter2?.winnerId).toBe(quarter2?.homeId);
    expect(semi1?.awayId).toBe(quarter2?.winnerId);
    expect(semi2?.homeId).toBeNull();
    expect(semi2?.awayId).toBeNull();
  });

  it("accepts and persists a custom match deadline", () => {
    const state = buildDemoChampionship();
    state.matches[0]!.deadline = "2026-11-30";
    const normalized = validateAndPropagateState(state);
    expect(normalized.matches[0]?.deadline).toBe("2026-11-30");

    state.matches[0]!.deadline = "30/11/2026";
    expect(() => validateAndPropagateState(state)).toThrow(
      ChampionshipValidationError
    );
  });

  it("requires decisive penalties for a tied knockout match", () => {
    const state = buildDemoChampionship();
    const quarter2 = state.matches.find(match => match.id === "quarter-2")!;
    quarter2.homeScore = 1;
    quarter2.awayScore = 1;
    quarter2.winnerId = null;

    expect(() => validateAndPropagateState(state)).toThrow(
      ChampionshipValidationError
    );
    quarter2.homePenalties = 4;
    quarter2.awayPenalties = 3;
    const normalized = validateAndPropagateState(state);
    expect(
      normalized.matches.find(match => match.id === "quarter-2")?.winnerId
    ).toBe(quarter2.homeId);
  });

  it("generates group fixtures and advances qualifiers and winners from scores", () => {
    const initial = buildDemoChampionship();
    initial.teams = initial.teams.slice(0, 8);
    initial.players = [];
    initial.phases = [];
    initial.matches = [];
    initial.config.currentPhaseId = "";

    const generated = generateAutomaticTournament(initial);
    const groupFixtures = generated.matches.filter(
      match => match.phaseId === "auto-group"
    );
    expect(groupFixtures).toHaveLength(12);
    const seededOpeningMatches = generated.matches.filter(
      match => match.phaseId === "auto-knockout-1"
    );
    expect(seededOpeningMatches.map(match => [match.homeSeed, match.awaySeed]))
      .toEqual([
        ["A-1", "B-2"],
        ["B-1", "A-2"],
      ]);

    for (const match of groupFixtures) {
      match.status = "finished";
      match.homeScore = 1;
      match.awayScore = 0;
    }

    const afterGroups = validateAndPropagateState(generated);
    const semifinals = afterGroups.matches.filter(
      match => match.phaseId === "auto-knockout-1"
    );
    expect(semifinals).toHaveLength(2);
    expect(semifinals.every(match => match.homeId && match.awayId)).toBe(true);
    expect(afterGroups.config.currentPhaseId).toBe("auto-knockout-1");

    for (const match of semifinals) {
      match.status = "finished";
      match.homeScore = 2;
      match.awayScore = 0;
    }
    const afterSemifinals = validateAndPropagateState(afterGroups);
    const final = afterSemifinals.matches.find(
      match => match.phaseId === "auto-knockout-2"
    );
    expect(final?.homeId).toBe(semifinals[0]?.homeId);
    expect(final?.awayId).toBe(semifinals[1]?.homeId);
    expect(afterSemifinals.config.currentPhaseId).toBe("auto-knockout-2");
  });

  it("keeps automatic group fixtures within their group and pairs knockout qualifiers across groups", () => {
    const initial = buildDemoChampionship();
    initial.teams = initial.teams.slice(0, 8);
    initial.players = [];
    initial.phases = [];
    initial.matches = [];
    initial.config.currentPhaseId = "";

    const generated = generateAutomaticTournament(initial);
    const groupByTeam = new Map(
      generated.teams.map(team => [team.id, team.group])
    );
    const groupFixtures = generated.matches.filter(
      match => match.phaseId === "auto-group"
    );
    expect(groupFixtures.length).toBeGreaterThan(0);
    expect(
      groupFixtures.every(
        match => groupByTeam.get(match.homeId!) === groupByTeam.get(match.awayId!)
      )
    ).toBe(true);

    const openingRound = generated.matches.filter(
      match => match.phaseId === "auto-knockout-1"
    );
    expect(
      openingRound.map(match => [match.homeSeed, match.awaySeed])
    ).toEqual([
      ["A-1", "B-2"],
      ["B-1", "A-2"],
    ]);
  });

  it("rejects group matches that use teams from different groups", () => {
    const state = buildDemoChampionship();
    const firstGroupMatch = state.matches.find(
      match => match.phaseId === "phase-grupos"
    )!;
    const home = state.teams.find(team => team.id === firstGroupMatch.homeId)!;
    firstGroupMatch.awayId = state.teams.find(
      team => team.group !== home.group
    )!.id;

    expect(() => validateAndPropagateState(state)).toThrow(
      /não pode misturar equipes de grupos diferentes/
    );
  });

  it("does not silently reset a started downstream match", () => {
    const state = buildDemoChampionship();
    const quarter1 = state.matches.find(match => match.id === "quarter-1")!;
    const semi1 = state.matches.find(match => match.id === "semi-1")!;
    quarter1.status = "finished";
    quarter1.homeScore = 1;
    quarter1.awayScore = 2;
    semi1.status = "live";
    semi1.homeId = quarter1.homeId;

    expect(() => validateAndPropagateState(state)).toThrow(
      ChampionshipConflictError
    );
    expect(() => validateAndPropagateState(clone(state))).toThrow(
      /reset downstream/
    );
  });

  it("rejects duplicate IDs and bracket cycles", () => {
    const duplicate = buildDemoChampionship();
    duplicate.teams[1]!.id = duplicate.teams[0]!.id;
    expect(() => validateAndPropagateState(duplicate)).toThrow(
      ChampionshipValidationError
    );

    const cycle = buildDemoChampionship();
    cycle.matches.find(match => match.id === "final-1")!.nextMatchId =
      "quarter-1";
    cycle.matches.find(match => match.id === "final-1")!.nextSlot = "home";
    expect(() => validateAndPropagateState(cycle)).toThrow(
      /fase de ordem maior|ciclo/
    );
  });

  it("implements compare-and-swap revision semantics", () => {
    expect(nextChampionshipRevision(null, 0)).toBe(1);
    expect(nextChampionshipRevision(4, 4)).toBe(5);
    expect(() => nextChampionshipRevision(4, 3)).toThrow(
      ChampionshipConflictError
    );
    expect(() => nextChampionshipRevision(null, 1)).toThrow(
      ChampionshipConflictError
    );
  });

  it("keeps the shared contract type-compatible", () => {
    const state: Championship = buildDemoChampionship();
    expect(state.config.currentPhaseId).toBe("phase-quartas");
  });
});
