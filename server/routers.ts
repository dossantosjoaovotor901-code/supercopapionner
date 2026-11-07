import { COOKIE_NAME } from "@shared/const";
import type {
  Championship,
  CompetitionEdition,
  CompetitionType,
  Match,
  Registration,
  RegistrationStatus,
  Team,
} from "@shared/championship";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  championshipSchema,
  getChampionshipSnapshot,
  isChampionshipConflictError,
  isChampionshipValidationError,
  saveChampionshipSnapshot,
} from "./championship";
import { storagePut } from "./storage";
import {
  authenticateLocalAccount,
  createLocalAccount,
  isLocalMode,
} from "./local";

const saveInputSchema = z.object({
  state: z.custom<Championship>(
    value => championshipSchema.safeParse(value).success,
    { message: "estado do campeonato inválido" }
  ),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

const uploadLogoInputSchema = z.object({
  base64: z.string().min(1, "base64 da logo é obrigatório").max(1_500_000),
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

const uploadReplayInputSchema = z.object({
  matchId: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "ID de partida inválido"),
  base64: z.string().min(1, "base64 do replay é obrigatório").max(42_000_000),
  mime: z.enum([
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
    "application/octet-stream",
  ]),
  fileName: z.string().min(1).max(255),
});

const registrationPlayerInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  discord: z.string().trim().max(128).default(""),
  nickname: z.string().trim().max(48).default(""),
  isCaptain: z.boolean().default(false),
  isReserve: z.boolean().default(false),
});

const submitRegistrationInputSchema = z.object({
  teamName: z.string().trim().min(2).max(160),
  shortName: z.string().trim().min(2).max(48),
  teamDiscord: z.string().trim().max(128).default(""),
  captainName: z.string().trim().min(2).max(160),
  captainDiscord: z.string().trim().max(128).default(""),
  players: z.array(registrationPlayerInputSchema).min(1).max(32),
  acceptedRules: z.literal(true),
  acceptedFinancial: z.literal(true),
  responsible: z.literal(true),
});

const proofInputSchema = z.object({
  registrationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  base64: z.string().min(1).max(7_500_000),
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
  fileName: z.string().trim().min(1).max(255),
});

const reviewRegistrationInputSchema = z.object({
  registrationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  action: z.enum(["review", "approve", "reject", "request_proof"]),
  note: z.string().trim().max(2_000).default(""),
});

const createCompetitionInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.enum(["cup", "league", "weekly"]),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  registrationDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entryFee: z.number().min(0).max(1_000_000).default(0),
  maxTeams: z.number().int().min(2).max(128).default(16),
  prize: z.string().trim().max(160).default("A definir"),
  venue: z.string().trim().max(160).default(""),
});

const competitionRegistrationInputSchema = submitRegistrationInputSchema.extend({
  competitionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
});

const competitionProofInputSchema = proofInputSchema.extend({
  competitionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
});

const competitionResultInputSchema = z.object({
  competitionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  matchId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  homeScore: z.number().int().min(0).max(99),
  awayScore: z.number().int().min(0).max(99),
  homePenalties: z.number().int().min(0).max(99).nullable(),
  awayPenalties: z.number().int().min(0).max(99).nullable(),
});

function trpcChampionshipError(error: unknown): never {
  if (isChampionshipConflictError(error)) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  if (isChampionshipValidationError(error)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

function decodeLogo(base64: string, mime: string): Buffer {
  const dataUrlMatch = /^data:([^;,]+);base64,(.*)$/s.exec(base64);
  const declaredMime = dataUrlMatch?.[1];
  const encoded = dataUrlMatch?.[2] ?? base64;
  if (declaredMime && declaredMime.toLowerCase() !== mime.toLowerCase()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O MIME da data URL não corresponde ao campo mime",
    });
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Base64 da logo inválido",
    });
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > 1024 * 1024) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A logo deve ter no máximo 1 MB",
    });
  }

  const isPng =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const isWebp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
  const matchesMime =
    (mime === "image/png" && isPng) ||
    (mime === "image/jpeg" && isJpeg) ||
    (mime === "image/webp" && isWebp);
  if (!matchesMime) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Os bytes da logo não correspondem a PNG, JPG ou WebP declarado",
    });
  }
  return bytes;
}

function decodeReplay(base64: string): Buffer {
  const dataUrlMatch = /^data:([^;,]+);base64,(.*)$/s.exec(base64);
  const encoded = dataUrlMatch?.[2] ?? base64;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Base64 do replay inválido",
    });
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > 30 * 1024 * 1024) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O replay deve ter no máximo 30 MB",
    });
  }
  return bytes;
}

function decodeProof(base64: string, mime: string): Buffer {
  const dataUrlMatch = /^data:([^;,]+);base64,(.*)$/s.exec(base64);
  const declaredMime = dataUrlMatch?.[1];
  const encoded = dataUrlMatch?.[2] ?? base64;
  if (declaredMime && declaredMime.toLowerCase() !== mime.toLowerCase()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O MIME do comprovante não corresponde ao arquivo enviado" });
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Base64 do comprovante inválido" });
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O comprovante deve ter no máximo 5 MB" });
  }
  const isPdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  const valid = (mime === "application/pdf" && isPdf) || (mime === "image/png" && isPng) || (mime === "image/jpeg" && isJpeg) || (mime === "image/webp" && isWebp);
  if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "O conteúdo não corresponde a PDF ou imagem válida" });
  return bytes;
}

const registrationId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function registrationStatusForFee(entryFee: number): RegistrationStatus {
  return entryFee <= 0 ? "confirmed" : "awaiting_payment";
}

export function confirmUnpaidRegistrationsForFreeCompetition(
  state: Championship,
  actorName = "Sistema"
): Championship {
  if ((state.config.entryFee ?? 0) > 0) return state;
  const unpaidStatuses = new Set<RegistrationStatus>([
    "received",
    "awaiting_payment",
    "proof_submitted",
    "under_review",
  ]);
  let changed = false;
  const registrations = (state.registrations ?? []).map(registration => {
    if (!unpaidStatuses.has(registration.status)) return registration;
    changed = true;
    const confirmedAt = new Date().toISOString();
    return {
      ...registration,
      status: "confirmed" as const,
      paymentDeadline: "",
      updatedAt: confirmedAt,
      history: [
        ...registration.history,
        historyEntry(
          "confirmed",
          "A competição passou a ser gratuita; inscrição confirmada automaticamente.",
          actorName
        ),
      ].slice(-64),
    };
  });
  return changed ? { ...state, registrations } : state;
}

function updateCompetition(
  state: Championship,
  competitionId: string,
  update: (edition: CompetitionEdition) => CompetitionEdition
) {
  const index = (state.competitions ?? []).findIndex(
    edition => edition.id === competitionId
  );
  if (index < 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Competição não encontrada.",
    });
  }
  const editions = [...(state.competitions ?? [])];
  editions[index] = update(editions[index]!);
  return { ...state, competitions: editions };
}

function isCompetitionArchived(edition: CompetitionEdition) {
  return (
    edition.status === "completed" ||
    (edition.state.matches.length > 0 &&
      edition.state.matches.every(match => match.status === "finished"))
  );
}

function publicCompetitionEdition(edition: CompetitionEdition) {
  return {
    ...edition,
    registrationCount: (edition.state.registrations ?? []).filter(
      item => !["cancelled", "expired", "rejected"].includes(item.status)
    ).length,
    state: {
      ...edition.state,
      registrations: [],
      payments: [],
    },
  };
}

export function buildCompetitionSchedule(
  edition: CompetitionEdition
): CompetitionEdition {
  if (edition.status !== "registration") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Esta competição já foi iniciada.",
    });
  }
  const registrations = (edition.state.registrations ?? []).filter(
    item => item.status === "confirmed"
  );
  if (registrations.length < 2) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "São necessárias pelo menos duas inscrições confirmadas.",
    });
  }

  const teams: Team[] = registrations.map((registration, index) => ({
    id: `event-team-${registration.id}`,
    name: registration.teamName,
    shortName: registration.shortName,
    color: ["#1459E6", "#D84054", "#16A36A", "#7B52B8"][index % 4]!,
    group: "",
    city: "",
    logoUrl: registration.logoUrl,
    pot: 1,
  }));
  const phase: CompetitionEdition["state"]["phases"][number] = {
    id: `event-phase-${edition.id}`,
    name: edition.type === "league" ? "Liga" : "Eliminatórias",
    kind: edition.type === "league" ? "group" : "knockout",
    order: 1,
  };
  const baseDate = `${edition.eventDate}T12:00:00.000Z`;
  const matches: Match[] = [];
  const createMatch = (homeId: string | null, awayId: string | null) => {
    const match: Match = {
      id: registrationId("event-match"),
      phaseId: phase.id,
      homeId,
      awayId,
      homeSeed: null,
      awaySeed: null,
      scheduledAt: baseDate,
      deadline: "",
      venue: edition.state.config.venue,
      status: "scheduled",
      homeScore: 0,
      awayScore: 0,
      homePenalties: null,
      awayPenalties: null,
      minute: 0,
      nextMatchId: null,
      nextSlot: null,
      winnerId: null,
      notes: "",
      streamUrl: "",
      replayUrl: "",
      replayName: "",
    };
    matches.push(match);
    return match;
  };

  if (edition.type === "league") {
    for (let home = 0; home < teams.length; home += 1) {
      for (let away = home + 1; away < teams.length; away += 1) {
        createMatch(teams[home]!.id, teams[away]!.id);
      }
    }
  } else {
    type BracketNode = { teamId: string } | { matchId: string };
    let nodes: Array<BracketNode | null> = teams.map(team => ({
      teamId: team.id,
    }));
    const capacity = 2 ** Math.ceil(Math.log2(nodes.length));
    nodes = nodes.concat(Array.from({ length: capacity - nodes.length }, () => null));

    while (nodes.length > 1) {
      const next: Array<BracketNode | null> = [];
      for (let index = 0; index < nodes.length; index += 2) {
        const home = nodes[index] ?? null;
        const away = nodes[index + 1] ?? null;
        if (!home && !away) {
          next.push(null);
          continue;
        }
        if (home && !away && "teamId" in home) {
          next.push(home);
          continue;
        }
        if (!home && away && "teamId" in away) {
          next.push(away);
          continue;
        }

        const homeId = home && "teamId" in home ? home.teamId : null;
        const awayId = away && "teamId" in away ? away.teamId : null;
        const match = createMatch(homeId, awayId);
        for (const [node, slot] of [
          [home, "home"],
          [away, "away"],
        ] as const) {
          if (node && "matchId" in node) {
            const source = matches.find(item => item.id === node.matchId)!;
            source.nextMatchId = match.id;
            source.nextSlot = slot;
          }
        }
        next.push({ matchId: match.id });
      }
      nodes = next;
    }
  }

  if (edition.type === "weekly" && matches.length !== teams.length - 1) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Não foi possível gerar o chaveamento semanal.",
    });
  }
  return {
    ...edition,
    status: "running",
    state: {
      ...edition.state,
      teams,
      phases: [phase],
      matches,
    },
  };
}

export function applyCompetitionResult(
  edition: CompetitionEdition,
  input: z.infer<typeof competitionResultInputSchema>
): CompetitionEdition {
  if (edition.status !== "running") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A competição ainda não foi iniciada.",
    });
  }
  const matches = edition.state.matches.map(match => ({ ...match }));
  const match = matches.find(item => item.id === input.matchId);
  if (!match) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Partida não encontrada.",
    });
  }
  if (!match.homeId || !match.awayId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A partida ainda aguarda o vencedor da rodada anterior.",
    });
  }
  if (match.status === "finished") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "O resultado desta partida já foi encerrado.",
    });
  }
  if (
    edition.type !== "league" &&
    input.homeScore === input.awayScore &&
    (input.homePenalties === null ||
      input.awayPenalties === null ||
      input.homePenalties === input.awayPenalties)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Empates no mata-mata precisam de pênaltis com vencedor.",
    });
  }
  Object.assign(match, {
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    homePenalties: input.homePenalties,
    awayPenalties: input.awayPenalties,
    status: "finished" as const,
  });
  if (input.homeScore === input.awayScore && edition.type === "league") {
    match.winnerId = null;
  } else if (input.homeScore === input.awayScore) {
    match.winnerId =
      input.homePenalties! > input.awayPenalties!
        ? match.homeId
        : match.awayId;
  } else {
    match.winnerId =
      input.homeScore > input.awayScore ? match.homeId : match.awayId;
  }
  if (match.nextMatchId && match.nextSlot && match.winnerId) {
    const nextMatch = matches.find(item => item.id === match.nextMatchId);
    if (nextMatch && nextMatch.status === "scheduled") {
      if (match.nextSlot === "home") nextMatch.homeId = match.winnerId;
      else nextMatch.awayId = match.winnerId;
    }
  }
  const complete =
    matches.length > 0 && matches.every(item => item.status === "finished");
  return {
    ...edition,
    ...(complete
      ? { status: "completed" as const, archivedAt: new Date().toISOString() }
      : {}),
    state: { ...edition.state, matches },
  };
}

function historyEntry(
  status: "received" | "awaiting_payment" | "proof_submitted" | "under_review" | "confirmed" | "rejected" | "expired" | "cancelled",
  note: string,
  actorName: string
) {
  return {
    id: registrationId("history"),
    status,
    note,
    actorName,
    createdAt: new Date().toISOString(),
  } as const;
}

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    login: publicProcedure
      .input(
        z.object({
          email: z.string().trim().email().max(320),
          password: z.string().min(1).max(128),
        })
      )
      .mutation(({ ctx, input }) => {
        if (!isLocalMode) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Login por e-mail não está habilitado neste servidor.",
          });
        }
        const authenticated = authenticateLocalAccount(
          input.email,
          input.password
        );
        if (!authenticated) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "E-mail ou senha inválidos.",
          });
        }
        ctx.res.cookie("local_session", authenticated.session, {
          httpOnly: true,
          sameSite: "lax",
          secure: false,
          maxAge: 1000 * 60 * 60 * 24 * 365,
          path: "/",
        });
        return { success: true } as const;
      }),
    register: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(120),
          email: z.string().trim().email().max(320),
          password: z.string().min(8).max(128),
        })
      )
      .mutation(({ ctx, input }) => {
        if (!isLocalMode) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cadastro por e-mail não está habilitado neste servidor.",
          });
        }
        try {
          const account = createLocalAccount(input);
          ctx.res.cookie("local_session", account.session, {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            maxAge: 1000 * 60 * 60 * 24 * 365,
            path: "/",
          });
          return { success: true } as const;
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (
            message === "Já existe uma conta com este e-mail." ||
            message === "Este e-mail está reservado para o administrador."
          ) {
            throw new TRPCError({
              code: message.startsWith("Já existe") ? "CONFLICT" : "BAD_REQUEST",
              message,
            });
          }
          console.error("Local account registration failed:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Não foi possível concluir o cadastro.",
          });
        }
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      if (isLocalMode) {
        ctx.res.clearCookie("local_session", {
          httpOnly: true,
          sameSite: "lax",
          secure: false,
          path: "/",
          maxAge: -1,
        });
      } else {
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      }
      return {
        success: true,
      } as const;
    }),
  }),

  tournament: router({
    get: publicProcedure.query(async () => getChampionshipSnapshot()),
    save: adminProcedure
      .input(saveInputSchema)
      .mutation(async ({ input, ctx }) => {
      try {
        const state = confirmUnpaidRegistrationsForFreeCompetition(
          input.state,
          ctx.user.name || "Organização"
        );
        return await saveChampionshipSnapshot(state, input.revision);
      } catch (error) {
        return trpcChampionshipError(error);
      }
    }),
    uploadLogo: adminProcedure
      .input(uploadLogoInputSchema)
      .mutation(async ({ input }) => {
        const bytes = decodeLogo(input.base64, input.mime);
        const extension =
          input.mime === "image/jpeg"
            ? "jpg"
            : input.mime.slice("image/".length);
        const uploaded = await storagePut(
          `championship/logo.${extension}`,
          bytes,
          input.mime
        );
        return { url: uploaded.url };
      }),
    uploadReplay: adminProcedure
      .input(uploadReplayInputSchema)
      .mutation(async ({ input }) => {
        const snapshot = await getChampionshipSnapshot();
        const match = snapshot.state.matches.find(
          item => item.id === input.matchId
        );
        if (!match) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Partida não encontrada",
          });
        }
        if (match.status !== "finished") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O replay só pode ser anexado a partidas encerradas",
          });
        }
        const bytes = decodeReplay(input.base64);
        const extension =
          input.fileName.split(".").pop()?.toLowerCase() || "mp4";
        const safeExtension = /^[a-z0-9]{1,8}$/.test(extension)
          ? extension
          : "mp4";
        const uploaded = await storagePut(
          `championship/replays/${input.matchId}.${safeExtension}`,
          bytes,
          input.mime
        );
        return { url: uploaded.url, name: input.fileName };
      }),
    myRegistrations: protectedProcedure.query(async ({ ctx }) => {
      const snapshot = await getChampionshipSnapshot();
      const registrations = (snapshot.state.registrations ?? []).filter(
        registration => registration.captainUserId === ctx.user.openId
      );
      const registrationIds = new Set(registrations.map(item => item.id));
      return {
        ...snapshot,
        state: {
          ...snapshot.state,
          registrations,
          payments: (snapshot.state.payments ?? []).filter(payment =>
            registrationIds.has(payment.registrationId)
          ),
        },
      };
    }),
    submitRegistration: protectedProcedure
      .input(submitRegistrationInputSchema)
      .mutation(async ({ ctx, input }) => {
        const snapshot = await getChampionshipSnapshot();
        const config = snapshot.state.config;
        const now = new Date();
        const deadline = new Date(
          `${config.registrationDeadline || "2099-12-31"}T23:59:59`
        );
        if (now > deadline) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "As inscrições estão encerradas",
          });
        }
        const registrations = snapshot.state.registrations ?? [];
        const active = registrations.filter(
          item => !["cancelled", "expired", "rejected"].includes(item.status)
        );
        if (
          (config.maxTeams ?? 128) > 0 &&
          active.length >= (config.maxTeams ?? 128)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O limite de equipes desta competição já foi atingido",
          });
        }
        if (
          active.some(
            item =>
              item.teamName.trim().toLowerCase() ===
              input.teamName.trim().toLowerCase()
          )
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta equipe já possui uma inscrição ativa",
          });
        }
        const nextNumber =
          registrations.reduce(
            (highest, item) =>
              Math.max(highest, Number(item.code.replace("SCP-", "")) || 0),
            0
          ) + 1;
        const code = `SCP-${String(nextNumber).padStart(5, "0")}`;
        const isFree = (config.entryFee ?? 0) <= 0;
        const registrationStatus = registrationStatusForFee(config.entryFee ?? 0);
        const registration = {
          id: registrationId("registration"),
          code,
          teamName: input.teamName,
          shortName: input.shortName,
          logoUrl: "",
          teamDiscord: input.teamDiscord,
          captainName: input.captainName,
          captainDiscord: input.captainDiscord,
          captainUserId: ctx.user.openId,
          players: input.players.map((player, index) => ({
            ...player,
            id: registrationId(`player-${index + 1}`),
          })),
          acceptedRules: true,
          acceptedFinancial: true,
          responsible: true,
          status: registrationStatus,
          paymentDeadline: isFree ? "" : config.paymentDeadline || "",
          notes: "",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          history: [
            historyEntry(
              "received",
              "Formulário de inscrição recebido.",
              ctx.user.name || input.captainName
            ),
            historyEntry(
              registrationStatus,
              isFree
                ? "Inscrição gratuita confirmada automaticamente."
                : "Inscrição recebida; pagamento pendente.",
              "Sistema"
            ),
          ],
        };
        const result = await saveChampionshipSnapshot(
          {
            ...snapshot.state,
            registrations: [...registrations, registration],
          },
          snapshot.revision
        );
        return { code, registrationId: registration.id, snapshot: result };
      }),
    submitPaymentProof: protectedProcedure
      .input(proofInputSchema)
      .mutation(async ({ ctx, input }) => {
        const snapshot = await getChampionshipSnapshot();
        const registrations = snapshot.state.registrations ?? [];
        const registration = registrations.find(
          item => item.id === input.registrationId
        );
        if (!registration || registration.captainUserId !== ctx.user.openId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inscrição não encontrada",
          });
        }
        if ((snapshot.state.config.entryFee ?? 0) <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Esta competição não cobra taxa de inscrição.",
          });
        }
        if (["confirmed", "expired", "cancelled"].includes(registration.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Esta inscrição não aceita novos comprovantes",
          });
        }
        const bytes = decodeProof(input.base64, input.mime);
        const extension =
          input.fileName.split(".").pop()?.toLowerCase() ||
          (input.mime === "application/pdf" ? "pdf" : "jpg");
        const safeExtension = /^[a-z0-9]{1,8}$/.test(extension)
          ? extension
          : "bin";
        const uploaded = await storagePut(
          `championship/payments/${registration.code}.${safeExtension}`,
          bytes,
          input.mime
        );
        const now = new Date().toISOString();
        const payments = snapshot.state.payments ?? [];
        const currentPayment = payments.find(
          payment => payment.registrationId === registration.id
        );
        const payment = {
          id: currentPayment?.id ?? registrationId("payment"),
          registrationId: registration.id,
          status: "submitted" as const,
          proofUrl: uploaded.url,
          proofName: input.fileName,
          submittedAt: now,
          reviewedAt: currentPayment?.reviewedAt ?? "",
          reviewedBy: "",
          note: "",
        };
        const nextRegistration = {
          ...registration,
          status: "proof_submitted" as const,
          updatedAt: now,
          history: [
            ...registration.history,
            historyEntry(
              "proof_submitted",
              "Comprovante enviado para conferência.",
              ctx.user.name || registration.captainName
            ),
          ],
        };
        const result = await saveChampionshipSnapshot(
          {
            ...snapshot.state,
            registrations: registrations.map(item =>
              item.id === registration.id ? nextRegistration : item
            ),
            payments: [
              ...payments.filter(item => item.registrationId !== registration.id),
              payment,
            ],
          },
          snapshot.revision
        );
        return { snapshot: result, payment };
      }),
    reviewRegistration: adminProcedure
      .input(reviewRegistrationInputSchema)
      .mutation(async ({ ctx, input }) => {
        const snapshot = await getChampionshipSnapshot();
        const registrations = snapshot.state.registrations ?? [];
        const registration = registrations.find(
          item => item.id === input.registrationId
        );
        if (!registration) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inscrição não encontrada",
          });
        }
        const status =
          input.action === "approve"
            ? "confirmed"
            : input.action === "reject"
              ? "rejected"
              : input.action === "request_proof"
                ? "awaiting_payment"
                : "under_review";
        const paymentStatus =
          input.action === "approve"
            ? "approved"
            : input.action === "reject"
              ? "rejected"
              : input.action === "request_proof"
                ? "pending"
                : "under_review";
        const now = new Date().toISOString();
        const nextRegistration = {
          ...registration,
          status: status as typeof registration.status,
          notes: input.note,
          updatedAt: now,
          history: [
            ...registration.history,
            historyEntry(
              status,
              input.note || "Atualização administrativa.",
              ctx.user.name || "Organização"
            ),
          ],
        };
        const payments = snapshot.state.payments ?? [];
        const nextPayments = payments.map(payment =>
          payment.registrationId === registration.id
            ? {
                ...payment,
                status: paymentStatus as typeof payment.status,
                reviewedAt: now,
                reviewedBy: ctx.user.name || "Organização",
                note: input.note,
              }
            : payment
        );
        return saveChampionshipSnapshot(
          {
            ...snapshot.state,
            registrations: registrations.map(item =>
              item.id === registration.id ? nextRegistration : item
            ),
            payments: nextPayments,
          },
          snapshot.revision
        );
      }),
  }),

  competitions: router({
    list: publicProcedure.query(async () => {
      const snapshot = await getChampionshipSnapshot();
      return (snapshot.state.competitions ?? []).filter(
        edition => !isCompetitionArchived(edition)
      ).map(publicCompetitionEdition);
    }),
    museum: publicProcedure.query(async () => {
      const snapshot = await getChampionshipSnapshot();
      return (snapshot.state.competitions ?? [])
        .filter(isCompetitionArchived)
        .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
        .map(publicCompetitionEdition);
    }),
    adminList: adminProcedure.query(async () => {
      const snapshot = await getChampionshipSnapshot();
      return (snapshot.state.competitions ?? []).filter(
        edition => !isCompetitionArchived(edition)
      );
    }),
    get: publicProcedure
      .input(z.object({ competitionId: z.string() }))
      .query(async ({ input }) => {
        const snapshot = await getChampionshipSnapshot();
        const edition = (snapshot.state.competitions ?? []).find(
          item => item.id === input.competitionId
        );
        if (!edition) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Competição não encontrada.",
          });
        }
        return publicCompetitionEdition(edition);
      }),
    create: adminProcedure
      .input(createCompetitionInputSchema)
      .mutation(async ({ input }) => {
        const snapshot = await getChampionshipSnapshot();
        const id = registrationId("competition");
        const template = snapshot.state;
        const config = {
          ...template.config,
          name: input.name,
          edition: input.eventDate,
          subtitle:
            input.type === "weekly"
              ? "Mini campeonato semanal em um único dia."
              : template.config.subtitle,
          competitionType: input.type,
          startDate: input.eventDate,
          endDate: input.eventDate,
          registrationDeadline: input.registrationDeadline,
          paymentDeadline: "",
          entryFee: input.entryFee,
          maxTeams: input.maxTeams,
          prize: input.prize,
          venue: input.venue,
          currentPhaseId: "",
          demo: false,
        };
        const edition: CompetitionEdition = {
          id,
          type: input.type,
          eventDate: input.eventDate,
          archivedAt: "",
          status: "registration",
          state: {
            config,
            teams: [],
            players: [],
            phases: [],
            matches: [],
            announcements: [],
            registrations: [],
            payments: [],
          },
        };
        const result = await saveChampionshipSnapshot(
          {
            ...snapshot.state,
            competitions: [...(snapshot.state.competitions ?? []), edition],
          },
          snapshot.revision
        );
        return { competitionId: id, snapshot: result };
      }),
    register: protectedProcedure
      .input(competitionRegistrationInputSchema)
      .mutation(async ({ ctx, input }) => {
        const snapshot = await getChampionshipSnapshot();
        const edition = (snapshot.state.competitions ?? []).find(
          item => item.id === input.competitionId
        );
        if (!edition || edition.status !== "registration") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "As inscrições desta competição não estão disponíveis.",
          });
        }
        if (
          new Date(`${edition.state.config.registrationDeadline}T23:59:59`) <
          new Date()
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O prazo de inscrição desta competição terminou.",
          });
        }
        const registrations = edition.state.registrations ?? [];
        const active = registrations.filter(
          item => !["cancelled", "expired", "rejected"].includes(item.status)
        );
        if (
          (edition.state.config.maxTeams ?? 128) > 0 &&
          active.length >= (edition.state.config.maxTeams ?? 128)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Esta competição atingiu o limite de equipes.",
          });
        }
        if (
          active.some(
            item =>
              item.teamName.trim().toLowerCase() ===
              input.teamName.trim().toLowerCase()
          )
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta equipe já está inscrita nesta competição.",
          });
        }
        const entryFee = edition.state.config.entryFee ?? 0;
        const isFree = entryFee <= 0;
        const status = registrationStatusForFee(
          entryFee
        );
        const now = new Date().toISOString();
        const code = `SCP-${String(registrations.length + 1).padStart(5, "0")}`;
        const registration: Registration = {
          id: registrationId("registration"),
          code,
          teamName: input.teamName,
          shortName: input.shortName,
          logoUrl: "",
          teamDiscord: input.teamDiscord,
          captainName: input.captainName,
          captainDiscord: input.captainDiscord,
          captainUserId: ctx.user.openId,
          players: input.players.map((player, index) => ({
            ...player,
            id: registrationId(`player-${index + 1}`),
          })),
          acceptedRules: true,
          acceptedFinancial: true,
          responsible: true,
          status,
          paymentDeadline: isFree
            ? ""
            : edition.state.config.paymentDeadline || "",
          notes: "",
          createdAt: now,
          updatedAt: now,
          history: [
            historyEntry("received", "Inscrição recebida.", ctx.user.name || input.captainName),
            historyEntry(
              status,
              isFree
                ? "Inscrição gratuita confirmada automaticamente."
                : "Pagamento pendente de confirmação.",
              "Sistema"
            ),
          ],
        };
        const nextState = {
          ...edition.state,
          registrations: [...registrations, registration],
        };
        const result = await saveChampionshipSnapshot(
          updateCompetition(snapshot.state, edition.id, current => ({
            ...current,
            state: nextState,
          })),
          snapshot.revision
        );
        return { code, registrationId: registration.id, snapshot: result };
      }),
    submitProof: protectedProcedure
      .input(competitionProofInputSchema)
      .mutation(async ({ ctx, input }) => {
        const snapshot = await getChampionshipSnapshot();
        const edition = (snapshot.state.competitions ?? []).find(
          item => item.id === input.competitionId
        );
        const registration = edition?.state.registrations?.find(
          item => item.id === input.registrationId
        );
        if (!edition || !registration || registration.captainUserId !== ctx.user.openId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inscrição não encontrada.",
          });
        }
        if ((edition.state.config.entryFee ?? 0) <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Esta competição não cobra taxa de inscrição.",
          });
        }
        if (registration.status === "confirmed" || isCompetitionArchived(edition)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Esta inscrição não aceita comprovantes.",
          });
        }
        const bytes = decodeProof(input.base64, input.mime);
        const extension =
          input.fileName.split(".").pop()?.toLowerCase() ||
          (input.mime === "application/pdf" ? "pdf" : "jpg");
        const safeExtension = /^[a-z0-9]{1,8}$/.test(extension)
          ? extension
          : "bin";
        const uploaded = await storagePut(
          `championship/competitions/${edition.id}/payments/${registration.code}.${safeExtension}`,
          bytes,
          input.mime
        );
        const now = new Date().toISOString();
        const payments = edition.state.payments ?? [];
        const payment = {
          id:
            payments.find(item => item.registrationId === registration.id)?.id ??
            registrationId("payment"),
          registrationId: registration.id,
          status: "submitted" as const,
          proofUrl: uploaded.url,
          proofName: input.fileName,
          submittedAt: now,
          reviewedAt: "",
          reviewedBy: "",
          note: "",
        };
        const nextState = {
          ...edition.state,
          registrations: edition.state.registrations!.map(item =>
            item.id === registration.id
              ? {
                  ...item,
                  status: "proof_submitted" as const,
                  updatedAt: now,
                  history: [
                    ...item.history,
                    historyEntry(
                      "proof_submitted",
                      "Comprovante enviado para análise.",
                      ctx.user.name || item.captainName
                    ),
                  ].slice(-64),
                }
              : item
          ),
          payments: [
            ...payments.filter(item => item.registrationId !== registration.id),
            payment,
          ],
        };
        const result = await saveChampionshipSnapshot(
          updateCompetition(snapshot.state, edition.id, current => ({
            ...current,
            state: nextState,
          })),
          snapshot.revision
        );
        return { snapshot: result, payment };
      }),
    mine: protectedProcedure.query(async ({ ctx }) => {
      const snapshot = await getChampionshipSnapshot();
      return (snapshot.state.competitions ?? [])
        .map(edition => ({
          competitionId: edition.id,
          competitionName: edition.state.config.name,
          eventDate: edition.eventDate,
          registrations: (edition.state.registrations ?? []).filter(
            item => item.captainUserId === ctx.user.openId
          ),
          payments: (edition.state.payments ?? []).filter(payment =>
            edition.state.registrations?.some(
              registration =>
                registration.id === payment.registrationId &&
                registration.captainUserId === ctx.user.openId
            )
          ),
        }))
        .filter(item => item.registrations.length);
    }),
    reviewRegistration: adminProcedure
      .input(
        z.object({
          competitionId: z.string(),
          registrationId: z.string(),
          action: z.enum(["approve", "reject"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const snapshot = await getChampionshipSnapshot();
        const now = new Date().toISOString();
        const result = await saveChampionshipSnapshot(
          updateCompetition(snapshot.state, input.competitionId, edition => {
            const registrations = edition.state.registrations ?? [];
            const registration = registrations.find(
              item => item.id === input.registrationId
            );
            if (!registration) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "Inscrição não encontrada.",
              });
            }
            const status =
              input.action === "approve" ? "confirmed" : "rejected";
            const payments = (edition.state.payments ?? []).map(payment =>
              payment.registrationId === registration.id
                ? {
                    ...payment,
                    status: input.action === "approve" ? "approved" as const : "rejected" as const,
                    reviewedAt: now,
                    reviewedBy: ctx.user.name || "Organização",
                  }
                : payment
            );
            return {
              ...edition,
              state: {
                ...edition.state,
                payments,
                registrations: registrations.map(item =>
                  item.id === registration.id
                    ? {
                        ...item,
                        status,
                        updatedAt: now,
                        history: [
                          ...item.history,
                          historyEntry(
                            status,
                            input.action === "approve"
                              ? "Inscrição aprovada pela organização."
                              : "Inscrição recusada pela organização.",
                            ctx.user.name || "Organização"
                          ),
                        ].slice(-64),
                      }
                    : item
                ),
              },
            };
          }),
          snapshot.revision
        );
        return result;
      }),
    start: adminProcedure
      .input(z.object({ competitionId: z.string() }))
      .mutation(async ({ input }) => {
        const snapshot = await getChampionshipSnapshot();
        const result = await saveChampionshipSnapshot(
          updateCompetition(snapshot.state, input.competitionId, buildCompetitionSchedule),
          snapshot.revision
        );
        return result;
      }),
    recordResult: adminProcedure
      .input(competitionResultInputSchema)
      .mutation(async ({ input }) => {
        const snapshot = await getChampionshipSnapshot();
        const result = await saveChampionshipSnapshot(
          updateCompetition(snapshot.state, input.competitionId, edition =>
            applyCompetitionResult(edition, input)
          ),
          snapshot.revision
        );
        return result;
      }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
