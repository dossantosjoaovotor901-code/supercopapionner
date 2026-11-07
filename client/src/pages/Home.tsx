import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  CircleDot,
  Clock3,
  Goal,
  MapPin,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import type { Championship, Match } from "../../../shared/championship";
import { standings } from "../../../shared/championship";
import {
  dateLabel,
  getTeam,
  MatchCard,
  PageHeading,
  phaseName,
  SectionHeader,
  StatusBadge,
  TeamBadge,
  timeLabel,
} from "@/components/copa/ui";

export default function Home({
  state,
  onOpen,
}: {
  state: Championship;
  onOpen: (m: Match) => void;
}) {
  const current = state.phases.find(p => p.id === state.config.currentPhaseId);
  const sorted = [...state.matches].sort((a, b) =>
    a.scheduledAt.localeCompare(b.scheduledAt)
  );
  const live = sorted.filter(m => m.status === "live");
  const upcoming = sorted
    .filter(m => m.status === "scheduled" && m.homeId && m.awayId)
    .slice(0, 3);
  const featured =
    live[0] ||
    upcoming[0] ||
    sorted.filter(m => m.status === "finished").at(-1);
  const home = featured ? getTeam(state, featured.homeId) : undefined,
    away = featured ? getTeam(state, featured.awayId) : undefined;
  const group = state.teams.find(t => t.group)?.group;
  const table = standings(state, group).slice(0, 4);
  const knockouts = state.phases
    .filter(p => p.kind === "knockout")
    .sort((a, b) => a.order - b.order);
  const semifinals = knockouts.length > 1 ? knockouts.at(-2) : knockouts[0];
  const semiMatches = state.matches
    .filter(m => m.phaseId === semifinals?.id)
    .slice(0, 2);
  const completed = state.matches.filter(m => m.status === "finished").length;
  const goals = state.matches
    .filter(m => m.status !== "scheduled")
    .reduce((sum, m) => sum + m.homeScore + m.awayScore, 0);
  const highlights = [
    ...live,
    ...sorted
      .filter(m => m.status === "finished" && m.phaseId === current?.id)
      .reverse(),
    ...upcoming,
  ]
    .filter((m, i, all) => all.findIndex(x => x.id === m.id) === i)
    .slice(0, 3);
  return (
    <>
      <PageHeading
        title="A copa acontece aqui."
        subtitle={
          state.config.subtitle ||
          "Cada jogo. Cada conquista. Todo o campeonato em um só lugar."
        }
      >
        <span className="phase-pill">
          <span className="phase-dot" />
          {current?.name || "Campeonato"}
        </span>
      </PageHeading>
      <div className="stat-grid">
        {[
          {
            label: "Equipes na disputa",
            value: state.teams.length,
            Icon: Shield,
            note: "Unidas pelo mesmo objetivo",
          },
          {
            label: "Partidas realizadas",
            value: completed,
            Icon: CalendarDays,
            note: `de ${state.matches.length} jogos na copa`,
          },
          {
            label: "Gols no campeonato",
            value: goals,
            Icon: Goal,
            note: "A emoção não para",
          },
          {
            label: "Jogadores inscritos",
            value: state.players.length,
            Icon: Users,
            note: "Os protagonistas da copa",
          },
        ].map(({ label, value, Icon, note }) => (
          <div className="stat-card" key={label}>
            <div>
              <span className="stat-label">{label}</span>
              <strong>{String(value).padStart(2, "0")}</strong>
              <span className="stat-note">{note}</span>
            </div>
            <span className="stat-icon">
              <Icon size={21} />
            </span>
          </div>
        ))}
      </div>
      <div className="hero-grid">
        <section className="featured-match">
          <div className="field-decoration">
            <span />
            <span />
            <span />
          </div>
          <div className="featured-top">
            <span className="featured-eyebrow">
              <CircleDot size={14} />
              PARTIDA EM DESTAQUE
            </span>
            {featured && <StatusBadge match={featured} />}
          </div>
          {featured ? (
            <>
              <div className="featured-title">
                <span>{phaseName(state, featured)}</span>
                <p>
                  {state.config.name} <span>·</span> {state.config.edition}
                </p>
              </div>
              <div className="featured-scoreboard">
                <div className="featured-team">
                  <TeamBadge team={home} size="hero" />
                  <h2>{home?.name || "A definir"}</h2>
                  <span>{home?.city || "Aguardando classificação"}</span>
                </div>
                <div className="featured-score">
                  {featured.status === "scheduled" ? (
                    <strong>VS</strong>
                  ) : (
                    <strong>
                      {featured.homeScore}
                      <span>:</span>
                      {featured.awayScore}
                    </strong>
                  )}
                  <span className="score-time">
                    {featured.status === "live"
                      ? `${featured.minute}′ · Em andamento`
                      : featured.status === "finished"
                        ? "Placar final"
                        : timeLabel(featured.scheduledAt)}
                  </span>
                </div>
                <div className="featured-team">
                  <TeamBadge team={away} size="hero" />
                  <h2>{away?.name || "A definir"}</h2>
                  <span>{away?.city || "Aguardando classificação"}</span>
                </div>
              </div>
              <div className="featured-bottom">
                <span>
                  <MapPin size={14} />
                  {featured.venue}
                  <span className="featured-date">
                    {" "}
                    · {dateLabel(featured.scheduledAt)}
                  </span>
                </span>
                <button
                  className="btn btn-white"
                  onClick={() => onOpen(featured)}
                >
                  Detalhes da partida <ArrowRight size={15} />
                </button>
              </div>
            </>
          ) : (
            <div className="empty-hero">
              <Trophy size={48} />
              <h2>O próximo capítulo está chegando.</h2>
              <p>As partidas serão exibidas aqui quando forem cadastradas.</p>
            </div>
          )}
        </section>
        <section className="panel upcoming-panel">
          <SectionHeader
            title="Próximos confrontos"
            action={
              <Link
                href="/partidas"
                className="icon-btn"
                aria-label="Ver todas as partidas"
              >
                <ArrowUpRightIcon />
              </Link>
            }
          />
          <div className="upcoming-list">
            {upcoming.length ? (
              upcoming.map(m => (
                <button
                  className="upcoming-row"
                  key={m.id}
                  onClick={() => onOpen(m)}
                >
                  <span className="upcoming-phase">
                    {phaseName(state, m)}{" "}
                    <span>{dateLabel(m.scheduledAt)}</span>
                  </span>
                  <span className="upcoming-teams">
                    <span>
                      <TeamBadge size="small" team={getTeam(state, m.homeId)} />
                      <strong>
                        {getTeam(state, m.homeId)?.shortName || "A definir"}
                      </strong>
                    </span>
                    <span className="upcoming-time">
                      {timeLabel(m.scheduledAt)}
                      <small>VS</small>
                    </span>
                    <span>
                      <strong>
                        {getTeam(state, m.awayId)?.shortName || "A definir"}
                      </strong>
                      <TeamBadge size="small" team={getTeam(state, m.awayId)} />
                    </span>
                  </span>
                  <span className="upcoming-venue">
                    <MapPin size={11} />
                    {m.venue}
                  </span>
                </button>
              ))
            ) : (
              <div className="empty-inline">
                Nenhum confronto agendado com equipes definidas.
              </div>
            )}
          </div>
          <Link className="schedule-link" href="/partidas">
            <CalendarDays size={14} />
            Ver calendário completo
            <ChevronRight size={15} />
          </Link>
        </section>
      </div>
      {highlights.length > 0 && (
        <section className="highlights-section">
          <SectionHeader
            title="Dentro de campo"
            action={
              <Link className="text-link" href="/partidas">
                Todas as partidas
                <ArrowRight size={14} />
              </Link>
            }
          />
          <div className="match-grid">
            {highlights.map(m => (
              <MatchCard key={m.id} state={state} match={m} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
      <div className="bottom-grid">
        <section className="panel standings-panel">
          <SectionHeader
            title="Classificação"
            action={<span className="group-tag">Grupo {group || "—"}</span>}
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
                  <th>SG</th>
                  <th>Últimos jogos</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row, i) => (
                  <tr key={row.team.id}>
                    <td>
                      <span className={`position ${i < 2 ? "qualified" : ""}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="table-team"
                        href={`/equipes/${row.team.id}`}
                      >
                        <TeamBadge team={row.team} size="small" />
                        <span>{row.team.name}</span>
                      </Link>
                    </td>
                    <td className="points">{row.points}</td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td>
                      {row.gd > 0 ? "+" : ""}
                      {row.gd}
                    </td>
                    <td>
                      <div className="form-badges">
                        {row.form.map((f, j) => (
                          <span
                            key={j}
                            className={`form-badge ${f}`}
                            title={
                              f === "V"
                                ? "Vitória"
                                : f === "E"
                                  ? "Empate"
                                  : "Derrota"
                            }
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-footer">
            <span>
              <i className="legend-dot" />
              Zona de classificação
            </span>
            <Link className="text-link" href="/classificacao">
              Ver todos os grupos
              <ArrowRight size={13} />
            </Link>
          </div>
        </section>
        <section className="panel mini-bracket">
          <SectionHeader
            title="Rumo à taça"
            action={<Trophy size={18} className="blue" />}
          />
          <p className="muted mini-description">
            O caminho até o lugar mais alto.
          </p>
          <div className="mini-bracket-content">
            <div className="mini-round-label">
              {semifinals?.name || "Mata-mata"}
            </div>
            {semiMatches.length ? (
              semiMatches.map(m => (
                <button
                  className="mini-bracket-game"
                  key={m.id}
                  onClick={() => onOpen(m)}
                >
                  {[m.homeId, m.awayId].map((id, i) => (
                    <span key={i}>
                      <TeamBadge size="small" team={getTeam(state, id)} />
                      <strong>{getTeam(state, id)?.name || "A definir"}</strong>
                      <span>
                        {m.status === "scheduled"
                          ? "–"
                          : i === 0
                            ? m.homeScore
                            : m.awayScore}
                      </span>
                    </span>
                  ))}
                </button>
              ))
            ) : (
              <p className="muted">
                O chaveamento será definido pela organização.
              </p>
            )}
            <div className="trophy-target">
              <Trophy size={26} />
              <span>
                A grande final
                <strong>
                  {dateLabel(state.config.endDate, { month: "long" })}
                </strong>
              </span>
            </div>
          </div>
          <Link className="bracket-link" href="/chaveamento">
            Explorar chaveamento
            <ArrowRight size={14} />
          </Link>
        </section>
      </div>
      {state.announcements.length > 0 && (
        <section className="news-section">
          <SectionHeader title="Na voz da organização" />
          <div className="news-grid">
            {state.announcements.slice(0, 3).map((a, i) => (
              <article className="news-card" key={a.id}>
                <span className="news-category">
                  COMUNICADO {String(i + 1).padStart(2, "0")}
                </span>
                <h3>{a.title}</h3>
                <p>{a.text}</p>
                <time>{dateLabel(a.date, { year: "numeric" })}</time>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={17} style={{ transform: "rotate(-45deg)" }} />;
}
