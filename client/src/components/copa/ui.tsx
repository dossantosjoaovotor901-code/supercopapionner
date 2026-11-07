import { useState } from "react";
import {
  Anchor,
  ArrowUpRight,
  Bird,
  CalendarDays,
  Clock3,
  Crown,
  Flame,
  Hourglass,
  MapPin,
  Shield,
  Star,
  Swords,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  Championship,
  Match,
  Team,
} from "../../../../shared/championship";
import { matchStatusLabels } from "../../../../shared/championship";

const emblems = [Crown, Zap, Shield, Star, Swords, Flame, Anchor, Bird, Trophy];
export function TeamBadge({
  team,
  size = "normal",
}: {
  team?: Team;
  size?: "small" | "normal" | "large" | "hero";
}) {
  const [failed, setFailed] = useState(false);
  if (team?.logoUrl && !failed)
    return (
      <span className={`team-badge image-badge ${size}`}>
        <img
          src={team.logoUrl}
          alt={`Escudo ${team.name}`}
          onError={() => setFailed(true)}
        />
      </span>
    );
  const Icon = team
    ? emblems[
        Array.from(team.name).reduce((n, c) => n + c.charCodeAt(0), 0) %
          emblems.length
      ]
    : Shield;
  return (
    <span
      className={`team-badge ${size} ${team ? "" : "unassigned"}`}
      style={
        { "--team-color": team?.color || "#9caac0" } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <span className="crest-lines" />
      <Icon strokeWidth={1.75} />
      <span className="crest-text">{team?.shortName || "?"}</span>
    </span>
  );
}
export function StatusBadge({ match }: { match: Match }) {
  return (
    <span className={`status-badge ${match.status}`}>
      {match.status === "live" && <i />}
      {matchStatusLabels[match.status]}
      {match.status === "live" && ` · ${match.minute}′`}
    </span>
  );
}
export function dateLabel(value: string, options?: Intl.DateTimeFormatOptions) {
  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00-03:00`
    : value;
  return new Date(dateValue).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    ...options,
    timeZone: "America/Sao_Paulo",
  });
}
export function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}
export function getTeam(state: Championship, id: string | null) {
  return state.teams.find(t => t.id === id);
}
export function phaseName(state: Championship, match: Match) {
  return state.phases.find(p => p.id === match.phaseId)?.name || "Partida";
}
export function MatchCard({
  state,
  match,
  onOpen,
  compact = false,
}: {
  state: Championship;
  match: Match;
  onOpen: (m: Match) => void;
  compact?: boolean;
}) {
  const home = getTeam(state, match.homeId),
    away = getTeam(state, match.awayId);
  return (
    <button
      className={`match-card ${compact ? "compact" : ""}`}
      onClick={() => onOpen(match)}
    >
      <span className="match-card-top">
        <span>{phaseName(state, match)}</span>
        <StatusBadge match={match} />
      </span>
      <span className="match-card-teams">
        <span className="match-team">
          <TeamBadge team={home} />
          <strong>{home?.shortName || "A definir"}</strong>
        </span>
        <span
          className={`match-score ${match.status === "scheduled" ? "not-started" : ""}`}
        >
          {match.status === "scheduled" ? (
            <>
              <span>{timeLabel(match.scheduledAt)}</span>
              <small>{dateLabel(match.scheduledAt)}</small>
            </>
          ) : (
            <>
              {match.homeScore}
              <em>:</em>
              {match.awayScore}
            </>
          )}
        </span>
        <span className="match-team">
          <TeamBadge team={away} />
          <strong>{away?.shortName || "A definir"}</strong>
        </span>
      </span>
      <span className="match-card-bottom">
        <span className="match-card-details">
          {match.venue ? (
            <span>
              <MapPin size={12} />
              {match.venue}
            </span>
          ) : null}
          {match.deadline ? (
            <span className="match-card-deadline">
              <Hourglass size={12} />
              Prazo até {dateLabel(match.deadline)}
            </span>
          ) : null}
        </span>
        <ArrowUpRight size={14} />
      </span>
    </button>
  );
}
export function SectionHeader({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
export function PageHeading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
export function MatchDetails({
  state,
  match,
  onClose,
}: {
  state: Championship;
  match: Match | null;
  onClose: () => void;
}) {
  if (!match) return null;
  const home = getTeam(state, match.homeId),
    away = getTeam(state, match.awayId);
  const homePlayers = state.players.filter(p => p.teamId === home?.id),
    awayPlayers = state.players.filter(p => p.teamId === away?.id);
  return (
    <Dialog open={!!match} onOpenChange={open => !open && onClose()}>
      <DialogContent className="match-dialog" showCloseButton={false}>
        <DialogDescription className="sr-only">
          Informações, placar e elenco das equipes desta partida.
        </DialogDescription>
        <div className="dialog-top">
          <div>
            <p className="eyebrow">{state.config.name}</p>
            <DialogTitle>{phaseName(state, match)}</DialogTitle>
          </div>
          <button
            className="icon-btn"
            aria-label="Fechar detalhes da partida"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="detail-match">
          <StatusBadge match={match} />
          <div className="detail-scoreboard">
            <div>
              <TeamBadge team={home} size="large" />
              <h3>{home?.name || "A definir"}</h3>
            </div>
            <div className="detail-score">
              {match.status === "scheduled"
                ? "×"
                : `${match.homeScore} : ${match.awayScore}`}
              <small>
                {match.status === "scheduled"
                  ? timeLabel(match.scheduledAt)
                  : "PLACAR"}
              </small>
            </div>
            <div>
              <TeamBadge team={away} size="large" />
              <h3>{away?.name || "A definir"}</h3>
            </div>
          </div>
          {match.homePenalties !== null && match.awayPenalties !== null && (
            <p>
              Pênaltis: {match.homePenalties} × {match.awayPenalties}
            </p>
          )}
        </div>
        <div className="match-meta">
          <span>
            <CalendarDays size={16} />
            {dateLabel(match.scheduledAt, { year: "numeric" })}
          </span>
          <span>
            <Clock3 size={16} />
            {timeLabel(match.scheduledAt)} · Brasília
          </span>
          {match.deadline ? (
            <span>
              <Hourglass size={16} />
              Prazo até {dateLabel(match.deadline, { year: "numeric" })}
            </span>
          ) : null}
          <span>
            <MapPin size={16} />
            {match.venue || "Local a definir"}
          </span>
        </div>
        {match.notes && (
          <div className="match-notes">
            <h4>Informações da partida</h4>
            <p>{match.notes}</p>
          </div>
        )}
        {match.winnerId && (
          <div className="winner-note">
            <Trophy size={17} />
            {getTeam(state, match.winnerId)?.name} venceu a partida.
          </div>
        )}
        {match.streamUrl && (
          <a
            className="btn btn-primary"
            href={match.streamUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Assistir à transmissão <ArrowUpRight size={16} />
          </a>
        )}
        {match.status === "finished" && match.replayUrl && (
          <a
            className="btn btn-secondary replay-link"
            href={match.replayUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Assistir replay{match.replayName ? ` · ${match.replayName}` : ""}{" "}
            <ArrowUpRight size={16} />
          </a>
        )}
        <div className="roster-columns">
          {[
            [home, homePlayers],
            [away, awayPlayers],
          ].map(([team, players], i) => (
            <div key={i}>
              <h4>
                Elenco · {(team as Team | undefined)?.shortName || "A definir"}
              </h4>
              {(players as typeof homePlayers).length ? (
                (players as typeof homePlayers).map(p => (
                  <div className="roster-row" key={p.id}>
                    <span className="jersey">{p.number}</span>
                    <span>
                      {p.name}
                      <small>{p.position}</small>
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted">Elenco ainda não informado.</p>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
