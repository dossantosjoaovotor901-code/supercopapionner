export type MatchStatus = "scheduled" | "live" | "finished";
export type PhaseKind = "group" | "knockout";
export type RegistrationStatus =
  | "received"
  | "awaiting_payment"
  | "proof_submitted"
  | "under_review"
  | "confirmed"
  | "rejected"
  | "expired"
  | "cancelled";
export type PaymentStatus = "pending" | "submitted" | "under_review" | "approved" | "rejected";
export interface Team {
  id: string;
  name: string;
  shortName: string;
  color: string;
  group: string;
  city: string;
  logoUrl: string;
  pot?: number;
}
export interface Player {
  id: string;
  teamId: string;
  name: string;
  nickname: string;
  number: number;
  position: string;
  goals: number;
  assists: number;
}
export interface Phase {
  id: string;
  name: string;
  kind: PhaseKind;
  order: number;
}
export interface Match {
  id: string;
  phaseId: string;
  homeId: string | null;
  awayId: string | null;
  homeSeed?: string | null;
  awaySeed?: string | null;
  scheduledAt: string;
  deadline?: string;
  venue: string;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  homePenalties: number | null;
  awayPenalties: number | null;
  minute: number;
  nextMatchId: string | null;
  nextSlot: "home" | "away" | null;
  winnerId: string | null;
  notes: string;
  streamUrl: string;
  replayUrl: string;
  replayName: string;
}
export interface Announcement {
  id: string;
  title: string;
  text: string;
  date: string;
}
export interface RegistrationPlayer {
  id: string;
  name: string;
  discord: string;
  nickname: string;
  isCaptain: boolean;
  isReserve: boolean;
}
export interface RegistrationHistoryEntry {
  id: string;
  status: RegistrationStatus;
  note: string;
  createdAt: string;
  actorName: string;
}
export interface Registration {
  id: string;
  code: string;
  teamName: string;
  shortName: string;
  logoUrl: string;
  teamDiscord: string;
  captainName: string;
  captainDiscord: string;
  captainUserId: string;
  players: RegistrationPlayer[];
  acceptedRules: boolean;
  acceptedFinancial: boolean;
  responsible: boolean;
  status: RegistrationStatus;
  paymentDeadline: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  history: RegistrationHistoryEntry[];
}
export interface Payment {
  id: string;
  registrationId: string;
  status: PaymentStatus;
  proofUrl: string;
  proofName: string;
  submittedAt: string;
  reviewedAt: string;
  reviewedBy: string;
  note: string;
}
export type CompetitionType = "cup" | "league" | "weekly";
export type CompetitionStatus = "registration" | "running" | "completed";
export interface CompetitionData {
  config: {
    name: string;
    edition: string;
    subtitle: string;
    logoUrl: string;
    currentPhaseId: string;
    startDate: string;
    endDate: string;
    venue: string;
    demo: boolean;
    rules: string;
    competitionType?: CompetitionType;
    modality?: string;
    entryFee?: number;
    prize?: string;
    maxTeams?: number;
    registrationDeadline?: string;
    paymentDeadline?: string;
    pixKey?: string;
    pixReceiver?: string;
  };
  teams: Team[];
  players: Player[];
  phases: Phase[];
  matches: Match[];
  announcements: Announcement[];
  registrations?: Registration[];
  payments?: Payment[];
}
export interface CompetitionEdition {
  id: string;
  type: CompetitionType;
  eventDate: string;
  archivedAt: string;
  status: CompetitionStatus;
  state: CompetitionData;
}
export interface Championship extends CompetitionData {
  competitions?: CompetitionEdition[];
}
export interface ChampionshipSnapshot {
  state: Championship;
  revision: number;
}
export interface Standing {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  form: string[];
}
export function standings(state: Championship, group?: string): Standing[] {
  const ids = state.phases.filter(p => p.kind === "group").map(p => p.id);
  return state.teams
    .filter(t => !group || t.group === group)
    .map(team => {
      const games = state.matches.filter(
        m =>
          m.status === "finished" &&
          ids.includes(m.phaseId) &&
          (m.homeId === team.id || m.awayId === team.id)
      );
      let won = 0,
        drawn = 0,
        lost = 0,
        gf = 0,
        ga = 0;
      const form: string[] = [];
      games
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
        .forEach(m => {
          const h = m.homeId === team.id,
            goals = h ? m.homeScore : m.awayScore,
            against = h ? m.awayScore : m.homeScore;
          gf += goals;
          ga += against;
          if (goals > against) {
            won++;
            form.push("V");
          } else if (goals === against) {
            drawn++;
            form.push("E");
          } else {
            lost++;
            form.push("D");
          }
        });
      return {
        team,
        played: games.length,
        won,
        drawn,
        lost,
        gf,
        ga,
        gd: gf - ga,
        points: won * 3 + drawn,
        form: form.slice(-5),
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        a.team.name.localeCompare(b.team.name)
    );
}
export const matchStatusLabels: Record<MatchStatus, string> = {
  scheduled: "Agendado",
  live: "Ao vivo",
  finished: "Encerrado",
};
export const registrationStatusLabels: Record<RegistrationStatus, string> = {
  received: "Recebida",
  awaiting_payment: "Aguardando pagamento",
  proof_submitted: "Comprovante enviado",
  under_review: "Em análise",
  confirmed: "Confirmada",
  rejected: "Recusada",
  expired: "Expirada",
  cancelled: "Cancelada",
};
