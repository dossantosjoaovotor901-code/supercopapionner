import { useMemo, useState } from "react";
import { CalendarDays, Search, SlidersHorizontal } from "lucide-react";
import type { Championship, Match } from "../../../shared/championship";
import {
  dateLabel,
  getTeam,
  MatchCard,
  PageHeading,
  SectionHeader,
} from "@/components/copa/ui";

export default function Matches({
  state,
  onOpen,
}: {
  state: Championship;
  onOpen: (m: Match) => void;
}) {
  const [status, setStatus] = useState("all"),
    [phase, setPhase] = useState("all"),
    [query, setQuery] = useState("");
  const matches = useMemo(
    () =>
      [...state.matches]
        .filter(
          m =>
            (status === "all" || m.status === status) &&
            (phase === "all" || m.phaseId === phase) &&
            `${getTeam(state, m.homeId)?.name || ""} ${getTeam(state, m.awayId)?.name || ""} ${m.venue}`
              .toLowerCase()
              .includes(query.toLowerCase())
        )
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [state, status, phase, query]
  );
  const groups = matches.reduce(
    (map, m) => {
      const day = dateLabel(m.scheduledAt, {
        weekday: "long",
        year: "numeric",
      });
      (map[day] ||= []).push(m);
      return map;
    },
    {} as Record<string, Match[]>
  );
  return (
    <>
      <PageHeading
        title="O jogo tem dia e hora."
        subtitle="Confira a agenda, acompanhe os placares e não perca nenhum confronto."
      />
      <div className="filter-bar">
        <div className="segmented-control">
          {[
            ["all", "Todas"],
            ["live", "Ao vivo"],
            ["scheduled", "Próximas"],
            ["finished", "Resultados"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={status === id ? "active" : ""}
              onClick={() => setStatus(id)}
            >
              {id === "live" && <i className="live-dot" />}
              {label}
              {id === "live" && (
                <span>
                  {state.matches.filter(m => m.status === "live").length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="filter-controls">
          <label className="select-wrap">
            <SlidersHorizontal size={14} />
            <select
              value={phase}
              onChange={e => setPhase(e.target.value)}
              aria-label="Filtrar por fase"
            >
              <option value="all">Todas as fases</option>
              {[...state.phases]
                .sort((a, b) => a.order - b.order)
                .map(p => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="search-input">
            <Search size={16} />
            <input
              placeholder="Buscar equipe ou local"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Buscar partidas"
            />
          </label>
        </div>
      </div>
      <p className="results-count">
        {matches.length}{" "}
        {matches.length === 1 ? "partida encontrada" : "partidas encontradas"}{" "}
        <span>· Horários de Brasília</span>
      </p>
      {Object.entries(groups).map(([date, dayMatches]) => (
        <section className="match-day" key={date}>
          <SectionHeader
            title={date}
            action={
              <span className="day-count">
                <CalendarDays size={14} />
                {dayMatches.length} jogos
              </span>
            }
          />
          <div className="match-grid">
            {dayMatches.map(m => (
              <MatchCard state={state} match={m} key={m.id} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
      {!matches.length && (
        <div className="empty-state">
          <CalendarDays size={38} />
          <h2>Nenhuma partida por aqui.</h2>
          <p>Tente outro filtro ou busque uma equipe diferente.</p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setStatus("all");
              setPhase("all");
              setQuery("");
            }}
          >
            Limpar filtros
          </button>
        </div>
      )}
    </>
  );
}
