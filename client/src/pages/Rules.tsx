import {
  CalendarDays,
  CheckCircle2,
  FileText,
  MapPin,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import type { Championship } from "../../../shared/championship";
import { dateLabel, PageHeading } from "@/components/copa/ui";
export default function Rules({ state }: { state: Championship }) {
  return (
    <>
      <PageHeading
        title="Jogo limpo, regras claras."
        subtitle="Tudo o que você precisa saber para acompanhar e participar da competição."
      />
      <div className="rules-grid">
        <section className="panel rules-content">
          <div className="rules-header">
            <span className="stat-icon">
              <FileText size={22} />
            </span>
            <div>
              <p className="eyebrow">DOCUMENTO DA COMPETIÇÃO</p>
              <h2>Regulamento oficial</h2>
              <p>
                {state.config.name} · {state.config.edition}
              </p>
            </div>
          </div>
          <div className="rules-text">
            {state.config.rules ? (
              state.config.rules
                .split("\n\n")
                .map((block, i) => <p key={i}>{block}</p>)
            ) : (
              <p>O regulamento ainda será publicado pela organização.</p>
            )}
          </div>
        </section>
        <aside className="rules-aside">
          <section className="panel tournament-info">
            <h2>A competição</h2>
            <div>
              <Trophy size={18} />
              <span>
                Formato<strong>Copa · grupos e mata-mata</strong>
              </span>
            </div>
            <div>
              <CalendarDays size={18} />
              <span>
                Período
                <strong>
                  {dateLabel(state.config.startDate)} a{" "}
                  {dateLabel(state.config.endDate, { year: "numeric" })}
                </strong>
              </span>
            </div>
            <div>
              <MapPin size={18} />
              <span>
                Local<strong>{state.config.venue || "A definir"}</strong>
              </span>
            </div>
            <div>
              <ShieldCheck size={18} />
              <span>
                Participantes
                <strong>
                  {state.teams.length} equipes · {state.players.length}{" "}
                  jogadores
                </strong>
              </span>
            </div>
          </section>
          <div className="fair-play-card">
            <ShieldCheck size={35} />
            <h2>O respeito também entra em campo.</h2>
            <p>
              Valorize os adversários, respeite as decisões e ajude a fazer uma
              copa para todos.
            </p>
          </div>
          <p className="rules-footnote">
            <CheckCircle2 size={14} />
            As informações são mantidas pela organização do campeonato.
          </p>
        </aside>
      </div>
    </>
  );
}
