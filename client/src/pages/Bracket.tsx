import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  GitBranch,
  Maximize2,
  Trophy,
} from "lucide-react";
import { Link } from "wouter";
import type { Championship, Match } from "../../../shared/championship";
import {
  dateLabel,
  getTeam,
  PageHeading,
  StatusBadge,
  TeamBadge,
  timeLabel,
} from "@/components/copa/ui";

export default function Bracket({
  state,
  onOpen,
}: {
  state: Championship;
  onOpen: (m: Match) => void;
}) {
  const phases = [...state.phases]
    .filter(p => p.kind === "knockout")
    .sort((a, b) => a.order - b.order);
  const final = state.matches.find(m => m.phaseId === phases.at(-1)?.id);
  const winner = final?.winnerId ? getTeam(state, final.winnerId) : undefined;
  const boardRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<{
    width: number;
    height: number;
    paths: { id: string; d: string; confirmed: boolean }[];
  }>({ width: 0, height: 0, paths: [] });
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const draw = () => {
      const origin = board.getBoundingClientRect();
      const nodes = new Map(
        Array.from(
          board.querySelectorAll<HTMLButtonElement>("[data-match-id]")
        ).map(node => [node.dataset.matchId!, node])
      );
      const paths = state.matches.flatMap(match => {
        const source = nodes.get(match.id),
          target = match.nextMatchId ? nodes.get(match.nextMatchId) : undefined;
        if (!source || !target || !match.nextSlot) return [];
        const sourceBox = source.getBoundingClientRect();
        const targetBox = target.getBoundingClientRect();
        const slot =
          target.querySelectorAll<HTMLElement>(".bracket-team")[
            match.nextSlot === "home" ? 0 : 1
          ];
        const slotBox = slot?.getBoundingClientRect();
        const x1 = sourceBox.right - origin.left,
          y1 = sourceBox.top - origin.top + sourceBox.height / 2;
        const x2 = targetBox.left - origin.left,
          y2 = slotBox
            ? slotBox.top - origin.top + slotBox.height / 2
            : targetBox.top - origin.top + targetBox.height / 2;
        const middle = (x1 + x2) / 2;
        return [
          {
            id: match.id,
            d: `M ${x1} ${y1} H ${middle} V ${y2} H ${x2}`,
            confirmed: !!match.winnerId,
          },
        ];
      });
      setConnections({
        width: board.scrollWidth,
        height: board.scrollHeight,
        paths,
      });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(board);
    return () => observer.disconnect();
  }, [state]);
  return (
    <>
      <PageHeading
        title="Um caminho. Uma taça."
        subtitle="Acompanhe cada confronto do mata-mata até conhecer o campeão."
      >
        <Link className="btn btn-secondary" href="/classificacao">
          Ver fase de grupos
          <ArrowRight size={14} />
        </Link>
      </PageHeading>
      <div className="bracket-intro">
        <span>
          <GitBranch size={19} />
          <strong>Chaveamento da copa</strong>
          <span className="muted">Eliminação direta</span>
        </span>
        <span className="scroll-hint">
          <Maximize2 size={13} />
          Deslize para explorar
        </span>
      </div>
      {phases.length ? (
        <section className="bracket-panel panel">
          <div className="bracket-scroll">
            <div className="bracket-rounds" ref={boardRef}>
              <svg
                className="bracket-connections"
                width={connections.width}
                height={connections.height}
                aria-hidden="true"
              >
                {connections.paths.map(path => (
                  <path
                    key={path.id}
                    d={path.d}
                    fill="none"
                    stroke={path.confirmed ? "#8fb0e8" : "#dce6f5"}
                    strokeWidth={1.5}
                  />
                ))}
              </svg>
              {phases.map((phase, index) => {
                const matches = state.matches
                  .filter(m => m.phaseId === phase.id)
                  .sort((a, b) => a.id.localeCompare(b.id));
                return (
                  <div
                    className={`bracket-round round-${index}`}
                    key={phase.id}
                  >
                    <div className="round-heading">
                      <span>FASE {String(index + 1).padStart(2, "0")}</span>
                      <h2>{phase.name}</h2>
                      <small>
                        {matches.length === 1
                          ? "A grande decisão"
                          : `${matches.length} confrontos`}
                      </small>
                    </div>
                    <div className="round-matches">
                      {matches.map((m, i) => (
                        <div className="bracket-game-wrap" key={m.id}>
                          <button
                            data-match-id={m.id}
                            className={`bracket-game ${m.status === "live" ? "is-live" : ""}`}
                            onClick={() => onOpen(m)}
                          >
                            <span className="bracket-game-info">
                              <span>Jogo {i + 1}</span>
                              {m.status === "live" ? (
                                <StatusBadge match={m} />
                              ) : (
                                <small>
                                  {dateLabel(m.scheduledAt)} ·{" "}
                                  {timeLabel(m.scheduledAt)}
                                </small>
                              )}
                            </span>
                            {[m.homeId, m.awayId].map((id, j) => (
                              <span
                                className={`bracket-team ${m.winnerId && id === m.winnerId ? "winner" : ""} ${m.winnerId && id !== m.winnerId ? "loser" : ""}`}
                                key={j}
                              >
                                <TeamBadge
                                  size="small"
                                  team={getTeam(state, id)}
                                />
                                <strong>
                                  {getTeam(state, id)?.name || "A definir"}
                                </strong>
                                <span className="bracket-score">
                                  {m.status === "scheduled"
                                    ? "–"
                                    : j === 0
                                      ? m.homeScore
                                      : m.awayScore}
                                </span>
                                {id && m.winnerId === id && (
                                  <ChevronRight size={14} />
                                )}
                              </span>
                            ))}
                            <span className="bracket-game-footer">
                              {m.status === "finished"
                                ? "Encerrado"
                                : m.status === "live"
                                  ? "Em campo agora"
                                  : m.homeId && m.awayId
                                    ? "Confronto definido"
                                    : "Aguardando classificados"}
                              <ArrowRight size={11} />
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="champion-column">
                <div className="champion-card">
                  <span className="champion-glow" />
                  <Trophy size={52} strokeWidth={1.4} />
                  <p>{winner ? "CAMPEÃO DA COPA" : "A TAÇA ESPERA"}</p>
                  <h2>{winner?.name || "Quem vai fazer história?"}</h2>
                  {winner && <TeamBadge team={winner} size="large" />}
                  <span>{state.config.name}</span>
                  <small>
                    {dateLabel(state.config.endDate, {
                      year: "numeric",
                      month: "long",
                    })}
                  </small>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="empty-state">
          <GitBranch size={38} />
          <h2>O chaveamento está sendo preparado.</h2>
          <p>A organização ainda não cadastrou fases de mata-mata.</p>
        </div>
      )}
      <div className="bracket-explainer">
        <div>
          <span className="explain-icon">
            <Trophy size={19} />
          </span>
          <h3>Venceu? Próxima fase.</h3>
          <p>
            Os classificados avançam pelos confrontos definidos pela
            organização.
          </p>
        </div>
        <div>
          <span className="explain-icon">
            <GitBranch size={19} />
          </span>
          <h3>Cada resultado conta.</h3>
          <p>
            Placares e classificados são atualizados após a confirmação
            administrativa.
          </p>
        </div>
        <Link href="/regulamento" className="bracket-rule-link">
          Consulte os critérios de desempate
          <ArrowRight size={15} />
        </Link>
      </div>
    </>
  );
}
