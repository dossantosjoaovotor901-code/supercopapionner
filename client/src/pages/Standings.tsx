import { useState } from "react";
import {
  ArrowRight,
  CircleCheck,
  Goal,
  Trophy,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import type { Championship } from "../../../shared/championship";
import { standings } from "../../../shared/championship";
import {
  getTeam,
  PageHeading,
  SectionHeader,
  TeamBadge,
} from "@/components/copa/ui";

export default function Standings({ state }: { state: Championship }) {
  const [tab, setTab] = useState("groups");
  const groups = Array.from(
    new Set(state.teams.map(t => t.group).filter(Boolean))
  ).sort();
  const players = [...state.players].sort(
    (a, b) =>
      b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name)
  );
  const completedMatches = state.matches.filter(
    match => match.status === "finished"
  ).length;
  return (
    <div className="standings-page">
      <PageHeading
        title="O desempenho fala."
        subtitle="Pontos, resultados e os destaques que estão escrevendo a história da copa."
      >
        <Link className="btn btn-secondary" href="/chaveamento">
          Ver mata-mata
          <ArrowRight size={14} />
        </Link>
      </PageHeading>
      <div className="standings-summary" aria-label="Resumo da competição">
        <div className="standings-summary-card">
          <span className="standings-summary-icon">
            <Users size={19} />
          </span>
          <span>
            <small>Equipes inscritas</small>
            <strong>{state.teams.length}</strong>
          </span>
        </div>
        <div className="standings-summary-card">
          <span className="standings-summary-icon">
            <Trophy size={19} />
          </span>
          <span>
            <small>Grupos definidos</small>
            <strong>{groups.length}</strong>
          </span>
        </div>
        <div className="standings-summary-card">
          <span className="standings-summary-icon">
            <CircleCheck size={19} />
          </span>
          <span>
            <small>Partidas encerradas</small>
            <strong>{completedMatches}</strong>
          </span>
        </div>
      </div>
      <div className="filter-bar standings-filter-bar">
        <div className="segmented-control">
          <button
            onClick={() => setTab("groups")}
            className={tab === "groups" ? "active" : ""}
            aria-pressed={tab === "groups"}
          >
            <Trophy size={15} />
            Fase de grupos
          </button>
          <button
            onClick={() => setTab("players")}
            className={tab === "players" ? "active" : ""}
            aria-pressed={tab === "players"}
          >
            <Goal size={15} />
            Artilharia
          </button>
        </div>
        <span className="muted small">
          Classificação calculada pelos resultados confirmados
        </span>
      </div>
      {tab === "groups" ? (
        <>
          <div
            className={`groups-grid standings-groups-grid${groups.length === 1 ? " is-single-group" : ""}`}
          >
            {groups.map(group => (
              <section className="panel group-panel" key={group}>
                <SectionHeader
                  title={`Grupo ${group}`}
                  action={
                    <span className="group-tag">
                      {state.teams.filter(t => t.group === group).length}{" "}
                      equipes
                    </span>
                  }
                />
                <div className="table-scroll">
                  <table className="standings-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Equipe</th>
                        <th>PTS</th>
                        <th>J</th>
                        <th>V</th>
                        <th>E</th>
                        <th>D</th>
                        <th>GP</th>
                        <th>GC</th>
                        <th>SG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings(state, group).map((r, i) => (
                        <tr key={r.team.id}>
                          <td>
                            <span
                              className={`position ${i < 2 ? "qualified" : ""}`}
                            >
                              {i + 1}
                            </span>
                          </td>
                          <td>
                            <Link
                              href={`/equipes/${r.team.id}`}
                              className="table-team"
                            >
                              <TeamBadge team={r.team} size="small" />
                              <span>{r.team.name}</span>
                            </Link>
                          </td>
                          <td className="points">{r.points}</td>
                          <td>{r.played}</td>
                          <td>{r.won}</td>
                          <td>{r.drawn}</td>
                          <td>{r.lost}</td>
                          <td>{r.gf}</td>
                          <td>{r.ga}</td>
                          <td>
                            {r.gd > 0 ? "+" : ""}
                            {r.gd}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
          {!groups.length && (
            <div className="empty-state">
              <Trophy size={38} />
              <h2>A fase de grupos ainda não foi definida.</h2>
              <p>As equipes serão exibidas após o cadastro dos grupos.</p>
            </div>
          )}
          <div className="standings-legend">
            <span>
              <i className="legend-dot" />
              Primeiras duas posições do grupo
            </span>
            <p>
              <strong>PTS</strong> pontos · <strong>J</strong> jogos ·{" "}
              <strong>V</strong> vitórias · <strong>E</strong> empates ·{" "}
              <strong>D</strong> derrotas · <strong>GP</strong> gols pró ·{" "}
              <strong>GC</strong> gols contra · <strong>SG</strong> saldo de
              gols
            </p>
          </div>
          <div className="info-banner">
            Desempates da tabela: pontos, saldo de gols, gols pró e ordem
            alfabética. Os classificados do mata-mata são definidos pela
            organização.{" "}
            <Link href="/regulamento">
              Ver regulamento
              <ArrowRight size={13} />
            </Link>
          </div>
        </>
      ) : (
        <section className="panel standings-players-panel">
          <SectionHeader
            title="A disputa pela artilharia"
            action={<span className="group-tag">{players.length} atletas</span>}
          />
          {players.length ? (
            <div className="table-scroll">
              <table className="standings-table player-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Jogador</th>
                  <th>Equipe</th>
                  <th>Posição</th>
                  <th>Gols</th>
                  <th>Assistências</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.id}>
                    <td>
                      <span
                        className={`position ${i === 0 ? "qualified" : ""}`}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td>
                      <div className="player-name">
                        <span className="player-avatar">
                          {p.name
                            .split(" ")
                            .map(n => n[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <span>
                          <strong>{p.name}</strong>
                          <small>{p.nickname || `Camisa ${p.number}`}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <Link
                        className="table-team"
                        href={`/equipes/${p.teamId}`}
                      >
                        <TeamBadge
                          team={getTeam(state, p.teamId)}
                          size="small"
                        />
                        <span>{getTeam(state, p.teamId)?.name}</span>
                      </Link>
                    </td>
                    <td>{p.position}</td>
                    <td className="points">{p.goals}</td>
                    <td>{p.assists}</td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          ) : (
            <div className="standings-empty">
              <span className="standings-empty-icon">
                <Goal size={25} />
              </span>
              <h3>A artilharia começa com os jogadores.</h3>
              <p>
                Assim que a organização cadastrar atletas e atualizar os
                resultados, gols e assistências aparecerão aqui.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
