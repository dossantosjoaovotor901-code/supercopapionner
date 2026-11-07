import { describe, expect, it } from "vitest";
import type { Championship, Match } from "../shared/championship";
import { buildDemoChampionship } from "./seed";
import {
  affectedRowsFromUpdateResult,
  reconcileBracketLinks,
  validateAndPropagateState,
} from "./championship";

describe("championship editor regressions", () => {
  it("accepts calendar dates emitted by date inputs and no current phase", () => {
    const state: Championship = buildDemoChampionship();
    state.config.startDate = "2026-11-01";
    state.config.endDate = "2026-11-15";
    state.config.currentPhaseId = "";
    state.announcements[0].date = "2026-11-05";
    const result: Championship = validateAndPropagateState(state);
    expect(result.config.currentPhaseId).toBe("");
    expect(result.announcements[0].date).toBe("2026-11-05");
  });
  it("removes the derived participant when a source link is removed", () => {
    const previous: Championship = validateAndPropagateState(
      buildDemoChampionship()
    );
    const state: Championship = structuredClone(previous);
    const source = state.matches.find((m: Match) => m.id === "quarter-2")!;
    source.nextMatchId = null;
    source.nextSlot = null;
    const result: Championship = validateAndPropagateState(
      reconcileBracketLinks(state, previous)
    );
    expect(
      result.matches.find((m: Match) => m.id === "semi-1")?.awayId
    ).toBeNull();
  });
  it("removes the derived participant when the source game is deleted", () => {
    const previous: Championship = validateAndPropagateState(
      buildDemoChampionship()
    );
    const state: Championship = structuredClone(previous);
    state.matches = state.matches.filter((m: Match) => m.id !== "quarter-2");
    const result: Championship = validateAndPropagateState(
      reconcileBracketLinks(state, previous)
    );
    expect(
      result.matches.find((m: Match) => m.id === "semi-1")?.awayId
    ).toBeNull();
  });
  it("requires an explicit reset before unlinking an already started destination", () => {
    const previous: Championship = validateAndPropagateState(
      buildDemoChampionship()
    );
    const oldTarget = previous.matches.find((m: Match) => m.id === "semi-1")!;
    oldTarget.status = "live";
    oldTarget.homeId = previous.teams[0].id;
    const state: Championship = structuredClone(previous);
    const source = state.matches.find((m: Match) => m.id === "quarter-2")!;
    source.nextMatchId = null;
    source.nextSlot = null;
    expect(() => reconcileBracketLinks(state, previous)).toThrow(
      /já foi iniciada/
    );
  });
  it("reads actual mysql2 update tuples and rejects zero affected rows", () => {
    expect(affectedRowsFromUpdateResult([{ affectedRows: 1 }, []])).toBe(1);
    expect(affectedRowsFromUpdateResult({ affectedRows: 1 })).toBe(1);
    expect(affectedRowsFromUpdateResult([{ affectedRows: 0 }, []])).toBe(0);
  });
  it("allows an empty tournament after explicit entity deletions", () => {
    const state: Championship = buildDemoChampionship();
    state.teams = [];
    state.players = [];
    state.matches = [];
    state.phases = [];
    state.config.currentPhaseId = "";
    expect(validateAndPropagateState(state).teams).toHaveLength(0);
  });
});
