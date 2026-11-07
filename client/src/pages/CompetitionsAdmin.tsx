import { FormEvent, useState } from "react";
import { CalendarDays, Check, CircleDollarSign, Play, Plus, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { CompetitionEdition } from "../../../shared/championship";
import { registrationStatusLabels } from "../../../shared/championship";

const today = new Date().toISOString().slice(0, 10);

function CompetitionMatches({
  edition,
  onResult,
}: {
  edition: CompetitionEdition;
  onResult: (input: {
    competitionId: string;
    matchId: string;
    homeScore: number;
    awayScore: number;
    homePenalties: number | null;
    awayPenalties: number | null;
  }) => void;
}) {
  const teams = new Map(edition.state.teams.map(team => [team.id, team.name]));
  return (
    <div className="competition-admin-matches">
      {edition.state.matches.map(match => (
        <form
          className="competition-admin-match"
          key={match.id}
          onSubmit={event => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onResult({
              competitionId: edition.id,
              matchId: match.id,
              homeScore: Number(form.get("homeScore")),
              awayScore: Number(form.get("awayScore")),
              homePenalties: form.get("homePenalties") === "" ? null : Number(form.get("homePenalties")),
              awayPenalties: form.get("awayPenalties") === "" ? null : Number(form.get("awayPenalties")),
            });
          }}
        >
          <strong>{teams.get(match.homeId || "") || "A definir"}</strong>
          {match.status === "finished" ? (
            <span className="competition-score">{match.homeScore} × {match.awayScore}{match.homeScore === match.awayScore && match.homePenalties !== null ? ` (${match.homePenalties}–${match.awayPenalties})` : ""}</span>
          ) : match.homeId && match.awayId ? (
            <>
              <input aria-label="Gols mandante" name="homeScore" type="number" min="0" max="99" defaultValue="0" required />
              <span>×</span>
              <input aria-label="Gols visitante" name="awayScore" type="number" min="0" max="99" defaultValue="0" required />
              {edition.type !== "league" && <><input aria-label="Pênaltis mandante, se houver empate" name="homePenalties" type="number" min="0" max="99" placeholder="Pên." /><input aria-label="Pênaltis visitante, se houver empate" name="awayPenalties" type="number" min="0" max="99" placeholder="Pên." /></>}
              <button className="btn btn-primary" type="submit">Salvar resultado</button>
            </>
          ) : (
            <span className="muted">Aguardando resultado anterior</span>
          )}
          <strong>{teams.get(match.awayId || "") || "A definir"}</strong>
        </form>
      ))}
    </div>
  );
}

export default function CompetitionsAdmin() {
  const utils = trpc.useUtils();
  const list = trpc.competitions.adminList.useQuery();
  const museum = trpc.competitions.museum.useQuery();
  const [name, setName] = useState("");
  const [type, setType] = useState<"cup" | "league" | "weekly">("weekly");
  const [eventDate, setEventDate] = useState(today);
  const [registrationDeadline, setRegistrationDeadline] = useState(today);
  const [entryFee, setEntryFee] = useState("0");
  const [maxTeams, setMaxTeams] = useState("16");
  const [prize, setPrize] = useState("");
  const [venue, setVenue] = useState("");
  const create = trpc.competitions.create.useMutation({
    onSuccess: () => {
      toast.success("Competição criada.");
      setName("");
      void utils.competitions.adminList.invalidate();
      void utils.competitions.list.invalidate();
      void utils.competitions.museum.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const start = trpc.competitions.start.useMutation({
    onSuccess: () => {
      toast.success("Partidas geradas.");
      void utils.competitions.adminList.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const result = trpc.competitions.recordResult.useMutation({
    onSuccess: () => {
      toast.success("Resultado salvo.");
      void utils.competitions.adminList.invalidate();
      void utils.competitions.museum.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const review = trpc.competitions.reviewRegistration.useMutation({
    onSuccess: () => {
      toast.success("Inscrição atualizada.");
      void utils.competitions.adminList.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate({
      name,
      type,
      eventDate,
      registrationDeadline,
      entryFee: Number(entryFee),
      maxTeams: Number(maxTeams),
      prize: prize || "A definir",
      venue,
    });
  }

  return (
    <div className="competition-admin">
      <section className="panel competition-admin-create">
        <div className="registration-card-head">
          <div><span className="eyebrow">NOVA EDIÇÃO</span><h2>Adicionar competição</h2></div>
          <Plus className="blue" size={22} />
        </div>
        <form className="competition-admin-form" onSubmit={submit}>
          <label>Nome<input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Semanal SCP #1" required minLength={2} maxLength={160} /></label>
          <label>Tipo<select value={type} onChange={event => setType(event.target.value as typeof type)}><option value="weekly">Semanal (mini campeonato)</option><option value="cup">Copa</option><option value="league">Liga</option></select></label>
          <label>Data do evento<input type="date" value={eventDate} onChange={event => setEventDate(event.target.value)} required /></label>
          <label>Inscrições até<input type="date" value={registrationDeadline} onChange={event => setRegistrationDeadline(event.target.value)} required /></label>
          <label>Taxa (R$)<input type="number" min="0" step="0.01" value={entryFee} onChange={event => setEntryFee(event.target.value)} required /></label>
          <label>Limite de equipes<input type="number" min="2" max="128" value={maxTeams} onChange={event => setMaxTeams(event.target.value)} required /></label>
          <label>Premiação<input value={prize} onChange={event => setPrize(event.target.value)} placeholder="A definir" /></label>
          <label>Local<input value={venue} onChange={event => setVenue(event.target.value)} placeholder="Opcional" /></label>
          <button className="btn btn-primary" type="submit" disabled={create.isPending}><Plus size={15} /> Criar competição</button>
        </form>
      </section>

      <section className="competition-admin-list">
        <div className="section-header"><div><span className="eyebrow">EDIÇÕES ATIVAS</span><h2>Competições</h2></div><Trophy className="blue" size={21} /></div>
        {list.data?.map(edition => {
          const registrations = edition.state.registrations ?? [];
          const confirmed = registrations.filter(item => item.status === "confirmed").length;
          return (
            <article className="panel competition-admin-edition" key={edition.id}>
              <header><div><span className="phase-pill is-open">{edition.type === "weekly" ? "SEMANAL" : edition.type === "league" ? "LIGA" : "COPA"}</span><h3>{edition.state.config.name}</h3></div><span><CalendarDays size={14} /> {edition.eventDate}</span></header>
              <div className="competition-admin-stats"><span><strong>{registrations.length}</strong> inscrições</span><span><strong>{confirmed}</strong> confirmadas</span><span><CircleDollarSign size={14} /> {edition.state.config.entryFee ? `R$ ${edition.state.config.entryFee}` : "Grátis"}</span></div>
              {!!registrations.length && <div className="competition-admin-registrations">{registrations.map(registration => <div key={registration.id}><span><strong>{registration.teamName}</strong><small>{registration.code} · {registrationStatusLabels[registration.status]}</small></span>{registration.status !== "confirmed" && registration.status !== "rejected" && <span><button aria-label={`Aprovar ${registration.teamName}`} onClick={() => review.mutate({ competitionId: edition.id, registrationId: registration.id, action: "approve" })}><Check size={16} /></button><button aria-label={`Recusar ${registration.teamName}`} onClick={() => review.mutate({ competitionId: edition.id, registrationId: registration.id, action: "reject" })}><X size={16} /></button></span>}</div>)}</div>}
              {edition.status === "registration" ? <button className="btn btn-primary" disabled={start.isPending || confirmed < 2} onClick={() => start.mutate({ competitionId: edition.id })}><Play size={15} /> Gerar partidas e iniciar {edition.type === "weekly" ? "mini campeonato" : "competição"}</button> : <CompetitionMatches edition={edition} onResult={input => result.mutate(input)} />}
            </article>
          );
        })}
        {!list.data?.length && <p className="muted">Nenhuma edição ativa cadastrada.</p>}
      </section>
      {!!museum.data?.length && <p className="muted">Museu: {museum.data.length} edição(ões) concluída(s) arquivada(s) automaticamente.</p>}
    </div>
  );
}
