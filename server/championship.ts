import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  standings as calculateStandings,
  type Championship,
  type CompetitionEdition,
  type Match,
  type Phase,
} from "@shared/championship";
import { championshipState } from "../drizzle/schema";
import { getDb } from "./db";
import { getLocalSnapshot, isLocalMode, saveLocalSnapshot } from "./local";

const MAX_ID_LENGTH = 80;
const MAX_NAME_LENGTH = 160;
const MAX_SHORT_NAME_LENGTH = 48;
const MAX_TEXT_LENGTH = 10_000;
const MAX_URL_LENGTH = 2_048;
const MAX_TEAMS = 128;
const MAX_PLAYERS = 4_096;
const MAX_PHASES = 32;
const MAX_MATCHES = 4_096;
const MAX_ANNOUNCEMENTS = 256;
const MAX_REGISTRATIONS = 2_000;
const MAX_PAYMENTS = 2_000;
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_TEXT_RE = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value) || Number.isNaN(Date.parse(value))) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day >= 1 && day <= daysInMonth[month - 1]!;
}

const boundedText = (max: number, allowEmpty = false) =>
  z
    .string()
    .min(allowEmpty ? 0 : 1)
    .max(max)
    .refine(
      value => SAFE_TEXT_RE.test(value),
      "não pode conter caracteres de controle"
    );

const idSchema = boundedText(MAX_ID_LENGTH).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  "deve começar com letra/número e conter apenas letras, números, ponto, hífen, sublinhado ou dois-pontos"
);

const isoDateSchema = boundedText(64).refine(
  isValidIsoDate,
  "deve ser uma data ISO 8601 válida com horário e fuso"
);

const deadlineDateSchema = boundedText(64, true).refine(
  value =>
    value === "" ||
    (CALENDAR_DATE_RE.test(value) && isValidIsoDate(`${value}T00:00:00Z`)) ||
    isValidIsoDate(value),
  "deve ser uma data limite YYYY-MM-DD válida"
);

const calendarDateSchema = boundedText(64).refine(
  value =>
    (CALENDAR_DATE_RE.test(value) && isValidIsoDate(`${value}T00:00:00Z`)) ||
    isValidIsoDate(value),
  "deve ser uma data de calendário YYYY-MM-DD ou uma data ISO 8601 válida"
);

function isAllowedUrl(value: string, allowHttp: boolean): boolean {
  if (value === "") return true;
  if (value.startsWith("/manus-storage/")) {
    return (
      /^\/manus-storage\/[A-Za-z0-9._~/-]+$/.test(value) &&
      !value.includes("..")
    );
  }
  if (value.startsWith("/")) {
    return /^\/[A-Za-z0-9._~/-]+$/.test(value) && !value.includes("..");
  }
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    return url.protocol === "https:" || (allowHttp && url.protocol === "http:");
  } catch {
    return false;
  }
}

const logoUrlSchema = boundedText(MAX_URL_LENGTH, true).refine(
  value => isAllowedUrl(value, false),
  "deve ser vazio, um caminho /manus-storage seguro ou uma URL https"
);
const replayUrlSchema = boundedText(MAX_URL_LENGTH, true).refine(
  value => isAllowedUrl(value, false),
  "deve ser vazio, um caminho /manus-storage seguro ou uma URL https"
);
const streamUrlSchema = boundedText(MAX_URL_LENGTH, true).refine(
  value => isAllowedUrl(value, true),
  "deve ser vazio, um caminho /manus-storage seguro ou uma URL http/https"
);
const currentPhaseIdSchema = boundedText(MAX_ID_LENGTH, true).refine(
  value => value === "" || /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value),
  "deve ser vazio ou um ID de fase válido"
);

const optionalIdSchema = idSchema.nullable();
const qualifierSeedSchema = boundedText(16)
  .regex(/^[A-Z]-[1-9]\d*$/, "deve ser uma classificação válida de grupo")
  .nullable()
  .optional();
const nonNegativeInt = (max: number) => z.number().int().min(0).max(max);

export const teamSchema = z
  .object({
    id: idSchema,
    name: boundedText(MAX_NAME_LENGTH),
    shortName: boundedText(MAX_SHORT_NAME_LENGTH),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, "deve ser uma cor hexadecimal #RRGGBB"),
    group: boundedText(32, true),
    city: boundedText(MAX_NAME_LENGTH, true),
    logoUrl: logoUrlSchema,
    pot: nonNegativeInt(32).min(1).optional().default(1),
  })
  .strict();

export const playerSchema = z
  .object({
    id: idSchema,
    teamId: idSchema,
    name: boundedText(MAX_NAME_LENGTH),
    nickname: boundedText(MAX_SHORT_NAME_LENGTH, true),
    number: nonNegativeInt(99),
    position: boundedText(48, true),
    goals: nonNegativeInt(10_000),
    assists: nonNegativeInt(10_000),
  })
  .strict();

export const phaseSchema = z
  .object({
    id: idSchema,
    name: boundedText(MAX_NAME_LENGTH),
    kind: z.enum(["group", "knockout"]),
    order: z.number().int().min(1).max(1_000),
  })
  .strict();

export const matchSchema = z
  .object({
    id: idSchema,
    phaseId: idSchema,
    homeId: optionalIdSchema,
    awayId: optionalIdSchema,
    homeSeed: qualifierSeedSchema,
    awaySeed: qualifierSeedSchema,
    scheduledAt: isoDateSchema,
    deadline: deadlineDateSchema.default(""),
    venue: boundedText(MAX_NAME_LENGTH, true),
    status: z.enum(["scheduled", "live", "finished"]),
    homeScore: nonNegativeInt(99),
    awayScore: nonNegativeInt(99),
    homePenalties: nonNegativeInt(99).nullable(),
    awayPenalties: nonNegativeInt(99).nullable(),
    minute: nonNegativeInt(200),
    nextMatchId: optionalIdSchema,
    nextSlot: z.enum(["home", "away"]).nullable(),
    winnerId: optionalIdSchema,
    notes: boundedText(MAX_TEXT_LENGTH, true),
    streamUrl: streamUrlSchema,
    replayUrl: replayUrlSchema.default(""),
    replayName: boundedText(255, true).default(""),
  })
  .strict();

export const announcementSchema = z
  .object({
    id: idSchema,
    title: boundedText(MAX_NAME_LENGTH),
    text: boundedText(MAX_TEXT_LENGTH),
    date: calendarDateSchema,
  })
  .strict();

const registrationPlayerSchema = z
  .object({
    id: idSchema,
    name: boundedText(MAX_NAME_LENGTH),
    discord: boundedText(128, true),
    nickname: boundedText(MAX_SHORT_NAME_LENGTH, true),
    isCaptain: z.boolean(),
    isReserve: z.boolean(),
  })
  .strict();

const registrationHistorySchema = z
  .object({
    id: idSchema,
    status: z.enum([
      "received",
      "awaiting_payment",
      "proof_submitted",
      "under_review",
      "confirmed",
      "rejected",
      "expired",
      "cancelled",
    ]),
    note: boundedText(2_000, true),
    createdAt: isoDateSchema,
    actorName: boundedText(MAX_NAME_LENGTH, true),
  })
  .strict();

export const registrationSchema = z
  .object({
    id: idSchema,
    code: boundedText(32).regex(/^SCP-\d{5,}$/),
    teamName: boundedText(MAX_NAME_LENGTH),
    shortName: boundedText(MAX_SHORT_NAME_LENGTH),
    logoUrl: logoUrlSchema,
    teamDiscord: boundedText(128, true),
    captainName: boundedText(MAX_NAME_LENGTH),
    captainDiscord: boundedText(128, true),
    captainUserId: boundedText(128),
    players: z.array(registrationPlayerSchema).min(1).max(32),
    acceptedRules: z.literal(true),
    acceptedFinancial: z.literal(true),
    responsible: z.literal(true),
    status: z.enum([
      "received",
      "awaiting_payment",
      "proof_submitted",
      "under_review",
      "confirmed",
      "rejected",
      "expired",
      "cancelled",
    ]),
    paymentDeadline: deadlineDateSchema,
    notes: boundedText(2_000, true),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
    history: z.array(registrationHistorySchema).max(64),
  })
  .strict();

export const paymentSchema = z
  .object({
    id: idSchema,
    registrationId: idSchema,
    status: z.enum(["pending", "submitted", "under_review", "approved", "rejected"]),
    proofUrl: replayUrlSchema,
    proofName: boundedText(255, true),
    submittedAt: isoDateSchema,
    reviewedAt: boundedText(64, true).refine(
      value => value === "" || isValidIsoDate(value),
      "deve ser vazio ou uma data ISO 8601 válida"
    ),
    reviewedBy: boundedText(MAX_NAME_LENGTH, true),
    note: boundedText(2_000, true),
  })
  .strict();

const competitionConfigSchema = z
  .object({
    name: boundedText(MAX_NAME_LENGTH),
    edition: boundedText(64, true),
    subtitle: boundedText(MAX_NAME_LENGTH, true),
    logoUrl: logoUrlSchema,
    currentPhaseId: currentPhaseIdSchema,
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    venue: boundedText(MAX_NAME_LENGTH, true),
    demo: z.boolean(),
    rules: boundedText(MAX_TEXT_LENGTH, true),
    competitionType: z.enum(["cup", "league", "weekly"]).default("cup"),
    modality: boundedText(32, true).default("X5"),
    entryFee: z.number().min(0).max(1_000_000).default(0),
    prize: boundedText(MAX_NAME_LENGTH, true).default("A definir"),
    maxTeams: nonNegativeInt(MAX_TEAMS).default(MAX_TEAMS),
    registrationDeadline: calendarDateSchema.default("2099-12-31"),
    paymentDeadline: deadlineDateSchema.default("2099-12-31"),
    pixKey: boundedText(128, true).default(""),
    pixReceiver: boundedText(MAX_NAME_LENGTH, true).default(""),
  })
  .strict();

const competitionDataSchema = z
  .object({
    config: competitionConfigSchema,
    teams: z.array(teamSchema).max(MAX_TEAMS),
    players: z.array(playerSchema).max(MAX_PLAYERS),
    phases: z.array(phaseSchema).max(MAX_PHASES),
    matches: z.array(matchSchema).max(MAX_MATCHES),
    announcements: z.array(announcementSchema).max(MAX_ANNOUNCEMENTS),
    registrations: z.array(registrationSchema).max(MAX_REGISTRATIONS).default([]),
    payments: z.array(paymentSchema).max(MAX_PAYMENTS).default([]),
  })
  .strict();

const competitionEditionSchema = z
  .object({
    id: idSchema,
    type: z.enum(["cup", "league", "weekly"]),
    eventDate: calendarDateSchema,
    archivedAt: deadlineDateSchema,
    status: z.enum(["registration", "running", "completed"]),
    state: competitionDataSchema,
  })
  .strict();

export const championshipSchema = z
  .object({
    ...competitionDataSchema.shape,
    competitions: z.array(competitionEditionSchema).max(500).default([]),
  })
  .strict();

export class ChampionshipValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChampionshipValidationError";
  }
}

export class ChampionshipConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChampionshipConflictError";
  }
}

function needsAutomaticGroupScheduleRepair(state: Championship): boolean {
  const groupPhaseIds = new Set(
    state.phases.filter(phase => phase.kind === "group").map(phase => phase.id)
  );
  const hasCrossGroupFixture = state.matches.some(match => {
    if (!groupPhaseIds.has(match.phaseId) || !match.homeId || !match.awayId)
      return false;
    const home = state.teams.find(team => team.id === match.homeId);
    const away = state.teams.find(team => team.id === match.awayId);
    return home && away && home.group !== away.group;
  });
  return (
    hasCrossGroupFixture &&
    state.matches.length > 0 &&
    state.matches.every(
      match =>
        match.id.startsWith("auto-") &&
        match.status === "scheduled" &&
        match.homeScore === 0 &&
        match.awayScore === 0 &&
        match.homePenalties === null &&
        match.awayPenalties === null
    )
  );
}

function validation(message: string): never {
  throw new ChampionshipValidationError(
    `Dados do campeonato inválidos: ${message}`
  );
}

function conflict(message: string): never {
  throw new ChampionshipConflictError(`Conflito no chaveamento: ${message}`);
}

function automaticMatchId(prefix: string, index: number) {
  return `auto-${prefix}-${index + 1}`;
}

export function generateAutomaticTournament(input: Championship): Championship {
  if (input.teams.length < 2 || input.matches.length > 0)
    return cloneState(input);
  const groupCount =
    input.teams.length >= 16 ? 4 : input.teams.length >= 8 ? 2 : 1;
  const groups = Array.from({ length: groupCount }, (_, index) =>
    String.fromCharCode(65 + index)
  );
  const sortedTeams = [...input.teams].sort((left, right) =>
    left.name.localeCompare(right.name, "pt-BR")
  );
  const teams = sortedTeams.map((team, index) => {
    const pot = Math.floor(index / groupCount) + 1;
    const position = index % groupCount;
    const groupIndex =
      Math.floor(index / groupCount) % 2 === 0
        ? position
        : groupCount - position - 1;
    return { ...team, group: groups[groupIndex]!, pot };
  });
  const baseTime = new Date(input.config.startDate).getTime();
  const scheduledAt = (index: number) =>
    new Date(
      (Number.isNaN(baseTime) ? Date.now() : baseTime) + index * 86_400_000
    ).toISOString();
  const phases: Phase[] = [
    { id: "auto-group", name: "Fase de grupos", kind: "group", order: 1 },
  ];
  const matches: Match[] = [];
  let groupIndex = 0;
  for (const group of groups) {
    const members = teams.filter(team => team.group === group);
    for (let home = 0; home < members.length; home += 1) {
      for (let away = home + 1; away < members.length; away += 1) {
        matches.push({
          id: automaticMatchId("group", groupIndex++),
          phaseId: "auto-group",
          homeId: members[home]!.id,
          awayId: members[away]!.id,
          scheduledAt: scheduledAt(matches.length + 1),
          deadline: scheduledAt(matches.length + 1).slice(0, 10),
          venue: input.config.venue,
          status: "scheduled",
          homeScore: 0,
          awayScore: 0,
          homePenalties: null,
          awayPenalties: null,
          minute: 0,
          nextMatchId: null,
          nextSlot: null,
          winnerId: null,
          notes: `Grupo ${group} · rodada automática`,
          streamUrl: "",
          replayUrl: "",
          replayName: "",
        });
      }
    }
  }
  const bracketSlots = groups.flatMap((group, index) => [
    `${group}-1`,
    `${groups[groups.length - index - 1]}-2`,
  ]);
  const firstRoundSize = Math.max(
    1,
    2 ** Math.ceil(Math.log2(Math.max(2, bracketSlots.length))) / 2
  );
  const roundCount = Math.ceil(Math.log2(Math.max(2, bracketSlots.length)));
  for (let round = 0; round < roundCount; round += 1) {
    phases.push({
      id: `auto-knockout-${round + 1}`,
      name:
        round === roundCount - 1
          ? "Final"
          : round === roundCount - 2
            ? "Semifinais"
            : "Quartas de final",
      kind: "knockout",
      order: round + 2,
    });
  }
  let previousRound: Match[] = [];
  for (let index = 0; index < firstRoundSize; index += 1) {
    const home = bracketSlots[index * 2] || "A definir";
    const away = bracketSlots[index * 2 + 1] || "A definir";
    const match: Match = {
      id: automaticMatchId("knockout", matches.length),
      phaseId: "auto-knockout-1",
      homeId: null,
      awayId: null,
      homeSeed: bracketSlots[index * 2] || null,
      awaySeed: bracketSlots[index * 2 + 1] || null,
      scheduledAt: scheduledAt(matches.length + 1),
      deadline: scheduledAt(matches.length + 1).slice(0, 10),
      venue: input.config.venue,
      status: "scheduled",
      homeScore: 0,
      awayScore: 0,
      homePenalties: null,
      awayPenalties: null,
      minute: 0,
      nextMatchId: null,
      nextSlot: null,
      winnerId: null,
      notes: `Classificação automática: ${home} × ${away}`,
      streamUrl: "",
      replayUrl: "",
      replayName: "",
    };
    matches.push(match);
    previousRound.push(match);
  }
  let round = 1;
  while (previousRound.length > 1) {
    const nextRound: Match[] = [];
    for (let index = 0; index < previousRound.length; index += 2) {
      const next: Match = {
        id: automaticMatchId("knockout", matches.length),
        phaseId: `auto-knockout-${round + 1}`,
        homeId: null,
        awayId: null,
        scheduledAt: scheduledAt(matches.length + 1),
        deadline: scheduledAt(matches.length + 1).slice(0, 10),
        venue: input.config.venue,
        status: "scheduled",
        homeScore: 0,
        awayScore: 0,
        homePenalties: null,
        awayPenalties: null,
        minute: 0,
        nextMatchId: null,
        nextSlot: null,
        winnerId: null,
        notes: previousRound[index + 1]
          ? "Vencedores da rodada anterior"
          : "Final automática",
        streamUrl: "",
        replayUrl: "",
        replayName: "",
      };
      previousRound[index]!.nextMatchId = next.id;
      previousRound[index]!.nextSlot = "home";
      if (previousRound[index + 1]) {
        previousRound[index + 1]!.nextMatchId = next.id;
        previousRound[index + 1]!.nextSlot = "away";
      }
      matches.push(next);
      nextRound.push(next);
    }
    previousRound = nextRound;
    round += 1;
  }
  return {
    ...cloneState(input),
    teams,
    phases,
    matches,
    config: { ...input.config, currentPhaseId: "auto-group", demo: false },
  };
}

function formatZodIssues(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "formato inválido";
  const path = issue.path.length > 0 ? ` (${issue.path.join(".")})` : "";
  return `${issue.message}${path}`;
}

function cloneState(state: Championship): Championship {
  return JSON.parse(JSON.stringify(state)) as Championship;
}

function ensureUniqueIds(state: Championship): void {
  const all = [
    ...state.teams.map(item => ["time", item.id] as const),
    ...state.players.map(item => ["jogador", item.id] as const),
    ...state.phases.map(item => ["fase", item.id] as const),
    ...state.matches.map(item => ["partida", item.id] as const),
    ...state.announcements.map(item => ["anúncio", item.id] as const),
    ...(state.registrations ?? []).map(item => ["inscrição", item.id] as const),
    ...(state.payments ?? []).map(item => ["pagamento", item.id] as const),
  ];
  const seen = new Map<string, string>();
  for (const [kind, id] of all) {
    const previous = seen.get(id);
    if (previous) validation(`ID ${id} repetido entre ${previous} e ${kind}`);
    seen.set(id, kind);
  }
}

function ensureNoCycles(matches: Match[]): void {
  const byId = new Map(matches.map(match => [match.id, match]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visiting.has(id))
      validation(`ciclo detectado no encadeamento a partir de ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    const next = byId.get(id)?.nextMatchId;
    if (next) visit(next);
    visiting.delete(id);
    visited.add(id);
  };

  for (const match of matches) visit(match.id);
}

function calculateWinner(match: Match, phase: Phase): string | null {
  if (match.status !== "finished") return null;
  if (!match.homeId || !match.awayId) {
    validation(
      `partida ${match.id} encerrada precisa ter mandante e visitante`
    );
  }

  if (phase.kind === "knockout" && match.homeScore === match.awayScore) {
    if (match.homePenalties === null || match.awayPenalties === null) {
      validation(
        `partida eliminatória ${match.id} empatada precisa informar os pênaltis`
      );
    }
    if (match.homePenalties === match.awayPenalties) {
      validation(
        `partida eliminatória ${match.id} não pode terminar empatada nos pênaltis`
      );
    }
    return match.homePenalties! > match.awayPenalties!
      ? match.homeId
      : match.awayId;
  }

  if (match.homeScore === match.awayScore) return null;
  return match.homeScore > match.awayScore ? match.homeId : match.awayId;
}

function applyExpectedParticipant(
  target: Match,
  slot: "home" | "away",
  expected: string | null,
  source: Match
): void {
  const current = slot === "home" ? target.homeId : target.awayId;
  if (target.status !== "scheduled" && current !== expected) {
    conflict(
      `a partida ${target.id} já foi iniciada ou reportada, mas o vencedor de ${source.id} mudou sua vaga ${slot}; solicite reset downstream antes de salvar`
    );
  }
  if (slot === "home") target.homeId = expected;
  else target.awayId = expected;
}

function qualificationSeeds(match: Match): {
  home: string | null;
  away: string | null;
} {
  if (match.homeSeed !== undefined || match.awaySeed !== undefined) {
    return {
      home: match.homeSeed ?? null,
      away: match.awaySeed ?? null,
    };
  }
  const legacyNotes =
    /^Classificação automática: ([A-Z]-[1-9]\d*) × ([A-Z]-[1-9]\d*)$/.exec(
      match.notes
    );
  return {
    home: legacyNotes?.[1] ?? null,
    away: legacyNotes?.[2] ?? null,
  };
}

function resolveQualificationSeed(
  state: Championship,
  seed: string,
  target: Match,
  slot: "home" | "away"
): void {
  const [, group, positionText] = /^([A-Z])-([1-9]\d*)$/.exec(seed) ?? [];
  if (!group || !positionText) validation(`classificação automática inválida: ${seed}`);

  const groupTeamIds = new Set(
    state.teams.filter(team => team.group === group).map(team => team.id)
  );
  if (groupTeamIds.size === 0)
    validation(`classificação automática referencia grupo inexistente ${group}`);

  const groupPhaseIds = new Set(
    state.phases.filter(phase => phase.kind === "group").map(phase => phase.id)
  );
  const groupMatches = state.matches.filter(
    match =>
      groupPhaseIds.has(match.phaseId) &&
      ((match.homeId !== null && groupTeamIds.has(match.homeId)) ||
        (match.awayId !== null && groupTeamIds.has(match.awayId)))
  );
  if (
    groupMatches.length === 0 ||
    groupMatches.some(match => match.status !== "finished")
  )
    return;

  const qualifier = calculateStandings(state, group)[
    Number(positionText) - 1
  ]?.team.id ?? null;
  const current = slot === "home" ? target.homeId : target.awayId;
  if (target.status !== "scheduled" && current !== qualifier) {
    conflict(
      `a partida ${target.id} já foi iniciada ou reportada, mas a classificação do grupo ${group} mudou sua vaga ${slot}`
    );
  }
  if (slot === "home") target.homeId = qualifier;
  else target.awayId = qualifier;
}

/**
 * Validates a complete aggregate and returns a normalized clone. Finished
 * matches receive their computed winner and winners are propagated to the
 * downstream bracket. Started/reported downstream games are never reset.
 */
export function validateAndPropagateState(input: Championship): Championship {
  const parsed = championshipSchema.safeParse(input);
  if (!parsed.success) validation(formatZodIssues(parsed.error));
  const state = cloneState(parsed.data);
  state.competitions = (state.competitions ?? []).map(edition => {
    const validated = validateAndPropagateState(edition.state);
    const { competitions: _nested, ...editionState } = validated;
    return { ...edition, state: editionState };
  });
  ensureUniqueIds(state);

  const teams = new Map(state.teams.map(team => [team.id, team]));
  const phases = new Map(state.phases.map(phase => [phase.id, phase]));
  const matches = new Map(state.matches.map(match => [match.id, match]));

  for (const match of state.matches) {
    const seeds = qualificationSeeds(match);
    if (seeds.home) resolveQualificationSeed(state, seeds.home, match, "home");
    if (seeds.away) resolveQualificationSeed(state, seeds.away, match, "away");
  }

  if (state.config.currentPhaseId && !phases.has(state.config.currentPhaseId)) {
    validation(
      `config.currentPhaseId ${state.config.currentPhaseId} não referencia uma fase existente`
    );
  }
  if (Date.parse(state.config.endDate) < Date.parse(state.config.startDate)) {
    validation("config.endDate não pode ser anterior a config.startDate");
  }

  const orders = state.phases.map(phase => phase.order).sort((a, b) => a - b);
  if (new Set(orders).size !== orders.length) {
    validation("as ordens das fases devem ser únicas e crescentes");
  }
  for (let index = 1; index < orders.length; index += 1) {
    if (orders[index]! <= orders[index - 1]!) {
      validation("as ordens das fases devem ser crescentes");
    }
  }

  for (const player of state.players) {
    if (!teams.has(player.teamId))
      validation(
        `jogador ${player.id} referencia time inexistente ${player.teamId}`
      );
  }

  const registrations = new Map(
    (state.registrations ?? []).map(registration => [registration.id, registration])
  );
  const registrationCodes = new Set<string>();
  for (const registration of state.registrations ?? []) {
    if (registrationCodes.has(registration.code)) {
      validation(`código de inscrição repetido ${registration.code}`);
    }
    registrationCodes.add(registration.code);
  }
  for (const payment of state.payments ?? []) {
    if (!registrations.has(payment.registrationId)) {
      validation(
        `pagamento ${payment.id} referencia inscrição inexistente ${payment.registrationId}`
      );
    }
  }

  const incoming = new Map<string, Partial<Record<"home" | "away", Match>>>();
  for (const match of state.matches) {
    const phase = phases.get(match.phaseId);
    if (!phase)
      validation(
        `partida ${match.id} referencia fase inexistente ${match.phaseId}`
      );
    if (match.homeId && !teams.has(match.homeId))
      validation(`partida ${match.id} referencia mandante inexistente`);
    if (match.awayId && !teams.has(match.awayId))
      validation(`partida ${match.id} referencia visitante inexistente`);
    if (
      phase.kind === "group" &&
      match.homeId &&
      match.awayId &&
      teams.get(match.homeId)!.group !== teams.get(match.awayId)!.group
    ) {
      validation(
        `partida ${match.id} da fase de grupos não pode misturar equipes de grupos diferentes`
      );
    }
    if (match.homeId && match.awayId && match.homeId === match.awayId) {
      validation(
        `partida ${match.id} não pode ter o mesmo time nos dois lados`
      );
    }
    if (match.status !== "scheduled" && (!match.homeId || !match.awayId)) {
      validation(
        `partida ${match.id} ao vivo/encerrada precisa ter os dois participantes`
      );
    }
    if (
      match.status !== "finished" &&
      (match.homePenalties !== null || match.awayPenalties !== null)
    ) {
      validation(
        `partida ${match.id} só pode informar pênaltis quando estiver encerrada`
      );
    }
    if (match.nextMatchId === null && match.nextSlot !== null) {
      validation(
        `partida ${match.id} informa vaga downstream sem próxima partida`
      );
    }
    if (match.nextMatchId !== null && match.nextSlot === null) {
      validation(
        `partida ${match.id} precisa informar nextSlot junto com nextMatchId`
      );
    }
    if (match.nextMatchId) {
      const target = matches.get(match.nextMatchId);
      if (!target)
        validation(
          `partida ${match.id} referencia próxima partida inexistente`
        );
      if (target.id === match.id)
        validation(`partida ${match.id} não pode apontar para si mesma`);
      const targetPhase = phases.get(target.phaseId)!;
      if (targetPhase.order <= phase.order) {
        validation(
          `partida ${match.id} só pode avançar para uma fase de ordem maior`
        );
      }
      const slots = incoming.get(target.id) ?? {};
      if (slots[match.nextSlot!]) {
        validation(
          `a vaga ${match.nextSlot} da partida ${target.id} possui mais de uma origem`
        );
      }
      slots[match.nextSlot!] = match;
      incoming.set(target.id, slots);
    }
  }
  ensureNoCycles(state.matches);

  const orderedMatches = [...state.matches].sort(
    (left, right) =>
      phases.get(left.phaseId)!.order - phases.get(right.phaseId)!.order
  );
  const winners = new Map<string, string | null>();

  for (const match of orderedMatches) {
    const slots = incoming.get(match.id);
    if (slots?.home) {
      applyExpectedParticipant(
        match,
        "home",
        winners.get(slots.home.id) ?? null,
        slots.home
      );
    }
    if (slots?.away) {
      applyExpectedParticipant(
        match,
        "away",
        winners.get(slots.away.id) ?? null,
        slots.away
      );
    }

    const phase = phases.get(match.phaseId)!;
    const computedWinner = calculateWinner(match, phase);
    if (match.status === "finished") {
      match.winnerId = computedWinner;
    } else {
      if (match.winnerId !== null) {
        validation(`partida ${match.id} não encerrada não pode ter vencedor`);
      }
      match.winnerId = null;
    }
    winners.set(match.id, match.winnerId);

    if (match.nextMatchId && match.nextSlot) {
      const target = matches.get(match.nextMatchId)!;
      applyExpectedParticipant(target, match.nextSlot, match.winnerId, match);
    }
  }

  for (const match of state.matches) {
    if (match.homeId && match.awayId && match.homeId === match.awayId) {
      validation(
        `a propagação deixou a partida ${match.id} com o mesmo time nos dois lados`
      );
    }
  }

  const currentPhase = phases.get(state.config.currentPhaseId);
  const currentPhaseMatches = currentPhase
    ? state.matches.filter(match => match.phaseId === currentPhase.id)
    : [];
  const nextPhase = currentPhase
    ? state.phases
        .filter(phase => phase.order > currentPhase.order)
        .sort((left, right) => left.order - right.order)[0]
    : undefined;
  if (
    currentPhaseMatches.length > 0 &&
    currentPhaseMatches.every(match => match.status === "finished") &&
    nextPhase
  ) {
    state.config.currentPhaseId = nextPhase.id;
  }

  return state;
}

function decodePayload(payload: unknown): Championship {
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload) as Championship;
    } catch {
      throw new Error("Payload persistido do campeonato não é JSON válido");
    }
  }
  return payload as Championship;
}

function normalizePersistedState(payload: unknown): Championship {
  const state = decodePayload(payload);
  const fallbackDate = state.config.endDate.slice(0, 10) || "2099-12-31";
  return {
    ...state,
    config: {
      competitionType: "cup",
      modality: "X5",
      entryFee: 0,
      prize: "A definir",
      maxTeams: MAX_TEAMS,
      registrationDeadline: fallbackDate,
      paymentDeadline: fallbackDate,
      pixKey: "",
      pixReceiver: "",
      ...state.config,
    },
    registrations: state.registrations ?? [],
    payments: state.payments ?? [],
    competitions: state.competitions ?? [],
  };
}

export async function getChampionshipSnapshot(): Promise<{
  state: Championship;
  revision: number;
}> {
  if (isLocalMode) {
    const current = getLocalSnapshot();
    current.state = normalizePersistedState(current.state);
    if (!needsAutomaticGroupScheduleRepair(current.state)) return current;
    const generated = generateAutomaticTournament({
      ...current.state,
      matches: [],
    });
    const repaired = validateAndPropagateState(
      reconcileBracketLinks(generated, current.state)
    );
    return saveLocalSnapshot(repaired, current.revision);
  }
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const rows = await db
    .select({
      payload: championshipState.payload,
      revision: championshipState.revision,
    })
    .from(championshipState)
    .where(eq(championshipState.id, 1))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Campeonato ainda não foi inicializado");
  return { state: normalizePersistedState(row.payload), revision: row.revision };
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "ER_DUP_ENTRY"
  );
}

export function nextChampionshipRevision(
  currentRevision: number | null,
  expectedRevision: number
): number {
  if (currentRevision !== null && currentRevision !== expectedRevision) {
    conflict(
      `revisão esperada ${expectedRevision} diverge da revisão atual ${currentRevision}; recarregue o campeonato e tente novamente`
    );
  }
  if (currentRevision === null && expectedRevision !== 0) {
    conflict(
      `o campeonato ainda não possui snapshot, mas a revisão informada foi ${expectedRevision}; recarregue antes de salvar`
    );
  }
  return expectedRevision + 1;
}

export function affectedRowsFromUpdateResult(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  if (!header || typeof header !== "object" || !("affectedRows" in header)) {
    return 0;
  }
  return Number((header as { affectedRows?: unknown }).affectedRows ?? 0);
}

/** Removes previously derived participants when their source link disappears. */
export function reconcileBracketLinks(
  input: Championship,
  previous: Championship
): Championship {
  const next = cloneState(input);
  const matches = new Map(next.matches.map(match => [match.id, match]));
  const previousMatches = new Map(
    previous.matches.map(match => [match.id, match])
  );
  for (const oldSource of previous.matches) {
    if (!oldSource.nextMatchId || !oldSource.nextSlot) continue;
    const source = matches.get(oldSource.id);
    if (
      source?.nextMatchId === oldSource.nextMatchId &&
      source.nextSlot === oldSource.nextSlot
    )
      continue;
    const target = matches.get(oldSource.nextMatchId);
    const oldTarget = previousMatches.get(oldSource.nextMatchId);
    if (!target || !oldTarget) continue;
    const slot = oldSource.nextSlot;
    const hasReplacement = next.matches.some(
      match => match.nextMatchId === target.id && match.nextSlot === slot
    );
    if (hasReplacement) continue;
    const explicitlyReset =
      target.status === "scheduled" &&
      target.homeScore === 0 &&
      target.awayScore === 0 &&
      target.homePenalties === null &&
      target.awayPenalties === null;
    if (oldTarget.status !== "scheduled" && !explicitlyReset) {
      conflict(
        `a partida ${target.id} já foi iniciada. Antes de remover a origem da vaga, volte o jogo para Agendado e limpe seu placar e pênaltis.`
      );
    }
    const field = slot === "home" ? "homeId" : "awayId";
    if (target[field] === oldTarget[field]) target[field] = null;
  }
  return next;
}

export async function saveChampionshipSnapshot(
  input: Championship,
  expectedRevision: number
): Promise<{ state: Championship; revision: number }> {
  if (isLocalMode) {
    const current = getLocalSnapshot();
    const repairAutomaticSchedule = needsAutomaticGroupScheduleRepair(
      current.state
    );
    const generated =
      current.state.matches.length === 0 || repairAutomaticSchedule
        ? generateAutomaticTournament({ ...input, matches: [] })
        : input;
    const reconciled = reconcileBracketLinks(generated, current.state);
    const normalized = validateAndPropagateState(reconciled);
    if (current.revision !== expectedRevision) {
      conflict(
        "a revisão mudou durante o salvamento; recarregue o campeonato e tente novamente"
      );
    }
    return saveLocalSnapshot(normalized, expectedRevision);
  }
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  return db.transaction(async tx => {
    const currentRows = await tx
      .select({
        payload: championshipState.payload,
        revision: championshipState.revision,
      })
      .from(championshipState)
      .where(eq(championshipState.id, 1))
      .limit(1);
    const current = currentRows[0];

    const nextRevision = nextChampionshipRevision(
      current?.revision ?? null,
      expectedRevision
    );
    const currentState = current ? decodePayload(current.payload) : null;
    const repairAutomaticSchedule =
      currentState !== null &&
      needsAutomaticGroupScheduleRepair(currentState);
    const generated =
      !currentState ||
      currentState.matches.length === 0 ||
      repairAutomaticSchedule
        ? generateAutomaticTournament({ ...input, matches: [] })
        : input;
    const reconciled = currentState
      ? reconcileBracketLinks(generated, currentState)
      : generated;
    const normalized = validateAndPropagateState(reconciled);
    if (current) {
      const result = await tx
        .update(championshipState)
        .set({ payload: normalized, revision: nextRevision })
        .where(
          and(
            eq(championshipState.id, 1),
            eq(championshipState.revision, expectedRevision)
          )
        );
      const affectedRows = affectedRowsFromUpdateResult(result);
      if (affectedRows !== 1) {
        conflict(
          "a revisão mudou durante o salvamento; recarregue o campeonato e tente novamente"
        );
      }
    } else {
      try {
        await tx.insert(championshipState).values({
          id: 1,
          payload: normalized,
          revision: nextRevision,
        });
      } catch (error) {
        if (isDuplicateKey(error)) {
          conflict(
            "outro administrador criou o snapshot durante este salvamento; recarregue o campeonato"
          );
        }
        throw error;
      }
    }

    const savedRows = await tx
      .select({
        payload: championshipState.payload,
        revision: championshipState.revision,
      })
      .from(championshipState)
      .where(eq(championshipState.id, 1))
      .limit(1);
    const saved = savedRows[0];
    if (!saved) throw new Error("Snapshot não encontrado após o salvamento");
    return { state: decodePayload(saved.payload), revision: saved.revision };
  });
}

export function isChampionshipValidationError(
  error: unknown
): error is ChampionshipValidationError {
  return error instanceof ChampionshipValidationError;
}

export function isChampionshipConflictError(
  error: unknown
): error is ChampionshipConflictError {
  return error instanceof ChampionshipConflictError;
}
