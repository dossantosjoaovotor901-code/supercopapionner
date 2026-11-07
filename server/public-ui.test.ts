import { describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import Home from "../client/src/pages/Home";
import Matches from "../client/src/pages/Matches";
import Standings from "../client/src/pages/Standings";
import Rules from "../client/src/pages/Rules";
import { dateLabel, timeLabel } from "../client/src/components/copa/ui";
import { buildDemoChampionship } from "./seed";
import { standings } from "../shared/championship";

const render = (element: ReactElement) =>
  renderToStaticMarkup(
    createElement(Router, { ssrPath: "/", children: element })
  );
describe("public championship interface", () => {
  it("preserves date-only calendar dates in Brasília", () => {
    expect(dateLabel("2026-11-15")).toContain("15");
    expect(timeLabel("2026-11-05T20:00:00-03:00")).toBe("20:00");
  });
  it("renders the overview from the persistent snapshot contract", () => {
    const state = buildDemoChampionship();
    const html = render(createElement(Home, { state, onOpen: () => {} }));
    expect(html).toContain("A copa acontece aqui.");
    expect(html).toContain(state.config.name);
    expect(html).toContain("Ao vivo");
    expect(html).toContain("Rumo à taça");
  });
  it("renders the complete fixture calendar and regulatory information", () => {
    const state = buildDemoChampionship();
    const html = render(createElement(Matches, { state, onOpen: () => {} }));
    expect(html).toContain("31");
    expect(html).toContain("Horários de Brasília");
    const rules = render(createElement(Rules, { state }));
    expect(rules).toContain("Regulamento oficial");
    expect(rules).toContain(state.config.name);
  });
  it("calculates standings from completed group games only", () => {
    const state = buildDemoChampionship();
    const table = standings(state, "A");
    expect(table).toHaveLength(4);
    expect(table.every(row => row.played === 3)).toBe(true);
    expect(table.every(row => row.points === row.won * 3 + row.drawn)).toBe(
      true
    );
    expect(table.every(row => row.gd === row.gf - row.ga)).toBe(true);
    const html = render(createElement(Standings, { state }));
    for (const group of ["A", "B", "C", "D"])
      expect(html).toContain(`Grupo ${group}`);
  });
});
