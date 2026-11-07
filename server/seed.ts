import "dotenv/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import {
  standings,
  type Championship,
  type Match,
  type Team,
} from "@shared/championship";
import { championshipState } from "../drizzle/schema";
import { validateAndPropagateState } from "./championship";
import { closeDb, getDb } from "./db";

export const SEED_VERSION = 1;

const teamDefinitions = [
  ["Aurora FC", "AUR", "Grupo A", "Serra Clara"],
  ["Atlético Norte", "ATN", "Grupo A", "Norte Azul"],
  ["Real União", "REU", "Grupo A", "União Central"],
  ["Vila Nova", "VNO", "Grupo A", "Vila Nova"],
  ["Estrela Azul", "EAZ", "Grupo B", "Estrela"],
  ["Leões FC", "LEO", "Grupo B", "Vale dos Leões"],
  ["Sporting Vale", "SPV", "Grupo B", "Vale Verde"],
  ["Nova Geração", "NGE", "Grupo B", "Nova Aurora"],
  ["Imperial FC", "IMP", "Grupo C", "Imperial"],
  ["Fênix EC", "FEN", "Grupo C", "Fênix"],
  ["União City", "UTC", "Grupo C", "Cidade União"],
  ["Águia FC", "AGF", "Grupo C", "Alto do Voo"],
  ["Porto Real", "POR", "Grupo D", "Porto Real"],
  ["Santos da Vila", "SDV", "Grupo D", "Vila dos Santos"],
  ["Nacional FC", "NAC", "Grupo D", "Campo Nacional"],
  ["Rovers FC", "ROV", "Grupo D", "Rovers"],
] as const;

const groups = ["A", "B", "C", "D"];
const groupPhaseId = "phase-grupos";
const quarterPhaseId = "phase-quartas";
const semiPhaseId = "phase-semifinais";
const finalPhaseId = "phase-final";

function localDate(day: number, hour: number, minute = 0, month = 10): string {
  return `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`;
}

function baseMatch(
  partial: Partial<Match> & Pick<Match, "id" | "phaseId" | "scheduledAt">
): Match {
  return {
    id: partial.id,
    phaseId: partial.phaseId,
    homeId: partial.homeId ?? null,
    awayId: partial.awayId ?? null,
    scheduledAt: partial.scheduledAt,
    venue: partial.venue ?? "Arena CopaPulse",
    status: partial.status ?? "scheduled",
    homeScore: partial.homeScore ?? 0,
    awayScore: partial.awayScore ?? 0,
    homePenalties: partial.homePenalties ?? null,
    awayPenalties: partial.awayPenalties ?? null,
    minute: partial.minute ?? 0,
    nextMatchId: partial.nextMatchId ?? null,
    nextSlot: partial.nextSlot ?? null,
    winnerId: partial.winnerId ?? null,
    notes: partial.notes ?? "",
    streamUrl: partial.streamUrl ?? "",
    replayUrl: partial.replayUrl ?? "",
    replayName: partial.replayName ?? "",
  };
}

export function buildDemoChampionship(): Championship {
  const teams: Team[] = teamDefinitions.map(
    ([name, shortName, group, city], index) => ({
      id: `team-${index + 1}`,
      name,
      shortName,
      color: index % 2 === 0 ? "#155EEF" : "#0B3B8F",
      group: group.slice(-1),
      city,
      logoUrl: "",
    })
  );
  const players = teams.flatMap((team, teamIndex) =>
    ["Camisa 10", "Capitão", "Artilheiro"].map((nickname, playerIndex) => ({
      id: `player-${team.id}-${playerIndex + 1}`,
      teamId: team.id,
      name: `${team.shortName} ${nickname}`,
      nickname,
      number: playerIndex === 0 ? 10 : playerIndex === 1 ? 1 : 9,
      position:
        playerIndex === 0 ? "Meia" : playerIndex === 1 ? "Goleiro" : "Atacante",
      goals: (teamIndex * 3 + playerIndex * 2) % 12,
      assists: (teamIndex * 2 + playerIndex * 3) % 10,
    }))
  );
  const phases = [
    {
      id: groupPhaseId,
      name: "Fase de grupos",
      kind: "group" as const,
      order: 1,
    },
    {
      id: quarterPhaseId,
      name: "Quartas de final",
      kind: "knockout" as const,
      order: 2,
    },
    {
      id: semiPhaseId,
      name: "Semifinais",
      kind: "knockout" as const,
      order: 3,
    },
    { id: finalPhaseId, name: "Final", kind: "knockout" as const, order: 4 },
  ];

  const matches: Match[] = [];
  let groupMatchNumber = 0;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex]!;
    const groupTeams = teams.filter(team => team.group === group);
    for (let homeIndex = 0; homeIndex < groupTeams.length; homeIndex += 1) {
      for (
        let awayIndex = homeIndex + 1;
        awayIndex < groupTeams.length;
        awayIndex += 1
      ) {
        const home = groupTeams[homeIndex]!;
        const away = groupTeams[awayIndex]!;
        const homeScore = 1 + ((homeIndex + awayIndex + groupIndex) % 3);
        matches.push(
          baseMatch({
            id: `group-${group.toLowerCase()}-${homeIndex + 1}-${awayIndex + 1}`,
            phaseId: groupPhaseId,
            homeId: home.id,
            awayId: away.id,
            scheduledAt: localDate(
              1 + groupMatchNumber,
              18 + (groupMatchNumber % 2)
            ),
            status: "finished",
            homeScore,
            awayScore: 0,
            minute: 90,
            winnerId: home.id,
            notes: `Rodada de grupos ${group}`,
          })
        );
        groupMatchNumber += 1;
      }
    }
  }

  const qualifiers = new Map<string, [string, string]>();
  for (const group of groups) {
    const ordered = standings(
      {
        config: {} as Championship["config"],
        teams,
        players,
        phases,
        matches,
        announcements: [],
      },
      group
    );
    const first = ordered[0]?.team.id;
    const second = ordered[1]?.team.id;
    if (!first || !second)
      throw new Error(`Seed não conseguiu classificar o grupo ${group}`);
    qualifiers.set(group, [first, second]);
  }

  const [a1, a2] = qualifiers.get("A")!;
  const [b1, b2] = qualifiers.get("B")!;
  const [c1, c2] = qualifiers.get("C")!;
  const [d1, d2] = qualifiers.get("D")!;
  matches.push(
    baseMatch({
      id: "quarter-1",
      phaseId: quarterPhaseId,
      homeId: a1,
      awayId: b2,
      scheduledAt: "2026-11-05T20:00:00-03:00",
      status: "live",
      homeScore: 2,
      awayScore: 1,
      minute: 67,
      nextMatchId: "semi-1",
      nextSlot: "home",
      notes: "Ao vivo — atualização de placar em tempo real",
    }),
    baseMatch({
      id: "quarter-2",
      phaseId: quarterPhaseId,
      homeId: b1,
      awayId: a2,
      scheduledAt: "2026-11-05T22:00:00-03:00",
      status: "finished",
      homeScore: 2,
      awayScore: 0,
      minute: 90,
      winnerId: b1,
      nextMatchId: "semi-1",
      nextSlot: "away",
    }),
    baseMatch({
      id: "quarter-3",
      phaseId: quarterPhaseId,
      homeId: c1,
      awayId: d2,
      scheduledAt: "2026-11-06T18:00:00-03:00",
      status: "scheduled",
      nextMatchId: "semi-2",
      nextSlot: "home",
    }),
    baseMatch({
      id: "quarter-4",
      phaseId: quarterPhaseId,
      homeId: d1,
      awayId: c2,
      scheduledAt: "2026-11-06T20:00:00-03:00",
      status: "scheduled",
      nextMatchId: "semi-2",
      nextSlot: "away",
    }),
    baseMatch({
      id: "semi-1",
      phaseId: semiPhaseId,
      homeId: null,
      awayId: b1,
      scheduledAt: "2026-11-09T20:00:00-03:00",
      status: "scheduled",
      nextMatchId: "final-1",
      nextSlot: "home",
    }),
    baseMatch({
      id: "semi-2",
      phaseId: semiPhaseId,
      homeId: null,
      awayId: null,
      scheduledAt: "2026-11-10T20:00:00-03:00",
      status: "scheduled",
      nextMatchId: "final-1",
      nextSlot: "away",
    }),
    baseMatch({
      id: "final-1",
      phaseId: finalPhaseId,
      homeId: null,
      awayId: null,
      scheduledAt: "2026-11-15T19:00:00-03:00",
      status: "scheduled",
    })
  );

  return {
    config: {
      name: "Super Copa Pionner",
      edition: "2026",
      subtitle: "A disputa que reúne os melhores sonhos do futebol",
      logoUrl:
        "/manus-storage/rn_image_picker_lib_temp_1d5a53c6-975a-4be9-97d2-ab7fd426a83b_4004faa9.png",
      currentPhaseId: quarterPhaseId,
      startDate: "2026-10-01T18:00:00-03:00",
      endDate: "2026-11-15T19:00:00-03:00",
      venue: "Complexo Esportivo CopaPulse",
      demo: true,
      competitionType: "cup",
      modality: "X5",
      entryFee: 20,
      prize: "R$ 250 em premiação",
      maxTeams: 16,
      registrationDeadline: "2026-11-12",
      paymentDeadline: "2026-11-14",
      pixKey: "",
      pixReceiver: "",
      rules:
        "Pontuação: vitória vale 3 pontos, empate vale 1 ponto e derrota vale 0 pontos. Nos grupos, a classificação segue nesta ordem: pontos, saldo de gols, gols pró e ordem alfabética. Cada equipe enfrenta as demais uma vez. As duas melhores equipes de cada grupo avançam ao mata-mata. Nas quartas, semifinais e final, empate no tempo regulamentar é decidido nos pênaltis; o vencedor nos pênaltis avança e não existe empate no mata-mata.",
    },
    teams,
    players,
    phases,
    matches,
    announcements: [
      {
        id: "announcement-opening",
        title: "Super Copa Pionner 2026 começa com festa",
        text: "A bola rola para uma edição especial, com dezesseis equipes, quatro grupos e uma jornada de grandes histórias.",
        date: "2026-10-01T16:00:00-03:00",
      },
      {
        id: "announcement-knockout",
        title: "Mata-mata definido",
        text: "Os oito classificados foram conhecidos após uma fase de grupos equilibrada. Confira o chaveamento completo das quartas de final.",
        date: "2026-11-03T12:00:00-03:00",
      },
      {
        id: "announcement-live",
        title: "Quartas de final em andamento",
        text: "Acompanhe a atualização ao vivo e os próximos confrontos que definirão os semifinalistas da Super Copa Pionner.",
        date: "2026-11-05T18:00:00-03:00",
      },
    ],
    registrations: [],
    payments: [],
  };
}

export async function seedDemo(): Promise<{
  seeded: boolean;
  version: number;
  revision: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const state = validateAndPropagateState(buildDemoChampionship());

  try {
    return await db.transaction(async tx => {
      const existing = await tx
        .select({
          id: championshipState.id,
          revision: championshipState.revision,
        })
        .from(championshipState)
        .where(eq(championshipState.id, 1))
        .limit(1);
      if (existing[0]) {
        console.log(
          `[seed v${SEED_VERSION}] snapshot existente; nenhum dado foi reescrito`
        );
        return {
          seeded: false,
          version: SEED_VERSION,
          revision: existing[0].revision,
        };
      }

      await tx
        .insert(championshipState)
        .values({ id: 1, payload: state, revision: 1 });
      console.log(`[seed v${SEED_VERSION}] demo Copa dos Campeões persistida`);
      return { seeded: true, version: SEED_VERSION, revision: 1 };
    });
  } finally {
    await closeDb();
  }
}

const invokedDirectly =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  seedDemo()
    .then(result => {
      console.log(JSON.stringify(result));
    })
    .catch(error => {
      console.error("Seed falhou:", error);
      process.exitCode = 1;
    });
}
