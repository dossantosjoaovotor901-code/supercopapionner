import { CalendarDays, Medal, Trophy } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { PageHeading } from "@/components/copa/ui";
import { standings } from "../../../shared/championship";
import "./museum.css";

const date = (value: string) => {
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime())
    ? "Data não informada"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(parsed);
};

export default function Museum() {
  const museum = trpc.competitions.museum.useQuery();
  return (
    <div className="museum-page">
      <PageHeading
        title="Museu da SCP"
        subtitle="A história das competições, equipes e campeões da Super Copa Pionner."
      />
      {museum.isLoading ? (
        <div className="panel museum-empty">Carregando o acervo...</div>
      ) : museum.error ? (
        <div className="panel museum-empty">Não foi possível carregar o museu.</div>
      ) : museum.data?.length ? (
        <div className="museum-grid">
          {museum.data.map(edition => {
            const final = edition.state.matches.find(
              match => !match.nextMatchId && match.status === "finished"
            );
            const champion =
              edition.type === "league"
                ? standings(edition.state)[0]?.team
                : edition.state.teams.find(team => team.id === final?.winnerId);
            return (
              <article className="panel museum-card" key={edition.id}>
                <div className="museum-card-top">
                  <span><Medal size={16} /> {edition.type === "weekly" ? "SEMANAL" : edition.type === "league" ? "LIGA" : "COPA"}</span>
                  <span><CalendarDays size={15} /> {date(edition.eventDate)}</span>
                </div>
                <h2>{edition.state.config.name}</h2>
                <p>{edition.state.config.subtitle || edition.state.config.edition}</p>
                <div className="museum-champion">
                  <Trophy size={21} />
                  <span><small>CAMPEÃ(O)</small><strong>{champion?.name || "Campeão não registrado"}</strong></span>
                </div>
                <div className="museum-results">
                  <strong>{edition.state.teams.length} equipes</strong>
                  <span>{edition.state.matches.filter(match => match.status === "finished").length} partidas encerradas</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel museum-empty">
          <Trophy size={32} />
          <h2>O museu está começando</h2>
          <p>As competições concluídas serão arquivadas aqui automaticamente.</p>
          <Link className="btn btn-primary" href="/campeonatos">Ver competições</Link>
        </div>
      )}
    </div>
  );
}
