import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Coins, Shield, Trophy, Users } from "lucide-react";
import { Link } from "wouter";
import type { Championship } from "../../../shared/championship";
import { registrationStatusLabels } from "../../../shared/championship";
import { PageHeading } from "@/components/copa/ui";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import "./competitions.css";

const date = (value?: string) => {
  if (!value) return "A definir";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? "A definir" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(parsed);
};
const money = (value = 0) => value ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Grátis";

export default function Championships({ state }: { state: Championship }) {
  const { user } = useAuth();
  const editions = trpc.competitions.list.useQuery();
  const myCompetitions = trpc.competitions.mine.useQuery(undefined, { enabled: Boolean(user) });
  const config = state.config;
  const active = (state.registrations ?? []).filter(item => !["cancelled", "expired", "rejected"].includes(item.status)).length;
  const maxTeams = config.maxTeams || 0;
  const open = !config.registrationDeadline || new Date(`${config.registrationDeadline}T23:59:59`).getTime() >= Date.now();
  const firstOpenEdition = editions.data?.find(edition =>
    edition.status === "registration" &&
    (!edition.state.config.registrationDeadline ||
      new Date(`${edition.state.config.registrationDeadline}T23:59:59`).getTime() >= Date.now())
  );
  const featuredEdition = firstOpenEdition ?? editions.data?.[0];
  const registrationHref = featuredEdition
    ? `/inscricoes/nova?competitionId=${encodeURIComponent(featuredEdition.id)}`
    : "#agenda-scp";
  return (
    <div className="competition-page">
      <PageHeading
        title="Competições"
        subtitle="Escolha sua próxima disputa, confira as regras e acompanhe cada etapa da Super Copa Pionner."
      >
        <span className={`phase-pill ${open ? "is-open" : ""}`}><span className="phase-dot" />{open ? "Inscrições abertas" : "Inscrições encerradas"}</span>
      </PageHeading>
      <section className="competition-hero">
        <div className="competition-hero-copy">
          <span className="eyebrow">COMPETIÇÃO EM DESTAQUE · {config.edition || "2026"}</span>
          <h2>{config.name}</h2>
          <p>{config.subtitle || "A competição da comunidade HaxBall começa aqui."}</p>
          <div className="competition-actions">
            <Link className="btn btn-primary" href={registrationHref}>
              {firstOpenEdition ? "Inscrever minha equipe" : featuredEdition ? "Acompanhar competição" : "Ver agenda"}
              <ArrowRight size={15} />
            </Link>
            <Link className="btn btn-ghost" href="/regulamento">Ler regulamento</Link>
          </div>
        </div>
        <div className="competition-hero-mark"><Trophy size={74} strokeWidth={1.1} /><strong>{config.modality || "X5"}</strong><span>{config.competitionType === "weekly" ? "Semanal" : config.competitionType === "league" ? "Liga" : "Copa"}</span></div>
      </section>
      {!!editions.data?.length && (
        <section className="competition-editions" id="agenda-scp">
          <div className="section-header"><div><span className="eyebrow">AGENDA SCP</span><h3>Próximas competições</h3></div></div>
          <div className="competition-edition-grid">
            {editions.data.map(edition => {
              const eventConfig = edition.state.config;
              const registered = edition.registrationCount;
              return (
                <article className="panel competition-edition-card" key={edition.id}>
                  <span className={`phase-pill${edition.status === "registration" ? " is-open" : ""}`}>{edition.type === "weekly" ? "SEMANAL" : edition.type === "league" ? "LIGA" : "COPA"}</span>
                  <h3>{eventConfig.name}</h3>
                  <p>{eventConfig.subtitle || "Edição da Super Copa Pionner"}</p>
                  <div className="competition-edition-meta">
                    <span><CalendarDays size={14} /> {date(edition.eventDate)}</span>
                    <span><Coins size={14} /> {money(eventConfig.entryFee)}</span>
                    <span><Users size={14} /> {registered}/{eventConfig.maxTeams} equipes</span>
                  </div>
                  <Link className="btn btn-primary" href={`/inscricoes/nova?competitionId=${encodeURIComponent(edition.id)}`}>
                    {edition.status === "registration" ? "Inscrever equipe" : "Acompanhar competição"} <ArrowRight size={15} />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <section className="competition-facts">
        {([
          { Icon: Coins, label: "Taxa de inscrição", value: money(config.entryFee) },
          { Icon: Trophy, label: "Premiação", value: config.prize || "A definir" },
          { Icon: Users, label: "Vagas", value: maxTeams ? `${active}/${maxTeams} equipes` : "A definir" },
          { Icon: CalendarDays, label: "Início", value: date(config.startDate) },
        ] as Array<{ Icon: typeof Coins; label: string; value: string }>).map(({ Icon, label, value }) => (
          <div className="competition-fact" key={label}><Icon size={19} /><span>{label}</span><strong>{value}</strong></div>
        ))}
      </section>
      {user && (
        <section className="competition-editions">
          <div className="section-header"><div><span className="eyebrow">ÁREA DO CAPITÃO</span><h3>Minhas inscrições em competições</h3></div></div>
          {myCompetitions.error ? <p className="competition-note">Não foi possível carregar suas inscrições. Tente novamente.</p> : myCompetitions.data?.length ? (
            <div className="competition-edition-grid">
              {myCompetitions.data.flatMap(edition => edition.registrations.map(registration => (
                <article className="panel competition-edition-card" key={registration.id}>
                  <span className="phase-pill">{registrationStatusLabels[registration.status]}</span>
                  <h3>{registration.teamName}</h3>
                  <p>{edition.competitionName} · {date(edition.eventDate)}</p>
                  <div className="competition-edition-meta"><span>Código {registration.code}</span></div>
                  <Link className="btn btn-ghost" href={`/inscricoes/nova?competitionId=${encodeURIComponent(edition.competitionId)}`}>Ver inscrição</Link>
                </article>
              )))}
            </div>
          ) : <p className="muted">Você ainda não se inscreveu em nenhuma competição.</p>}
        </section>
      )}
      <div className="competition-columns">
        <section className="panel competition-info-card">
          <div className="section-header"><div><span className="eyebrow">COMO FUNCIONA</span><h3>Do cadastro ao jogo</h3></div><CheckCircle2 className="blue" size={22} /></div>
          <div className="competition-steps">
            <div><b>01</b><span><strong>Envie a inscrição</strong><small>Cadastre equipe, capitão e elenco.</small></span></div>
            <div><b>02</b><span><strong>{(config.entryFee || 0) > 0 ? "Confirme o Pix" : "Inscrição gratuita"}</strong><small>{(config.entryFee || 0) > 0 ? "Envie o comprovante pela sua área." : "Não é necessário enviar comprovante."}</small></span></div>
            <div><b>03</b><span><strong>Entre na disputa</strong><small>Acompanhe chaveamento e partidas.</small></span></div>
          </div>
        </section>
        <section className="panel competition-info-card">
          <div className="section-header"><div><span className="eyebrow">PRAZOS</span><h3>Não perca a janela</h3></div><Clock3 className="blue" size={22} /></div>
          <div className="deadline-list"><div><span>Inscrições até</span><strong>{date(config.registrationDeadline)}</strong></div><div><span>Pagamento até</span><strong>{config.paymentDeadline ? date(config.paymentDeadline) : "Sem prazo"}</strong></div><div><span>Local principal</span><strong>{config.venue || "A definir"}</strong></div></div>
        </section>
      </div>
      <div className="competition-note"><Shield size={18} /><span>{(config.entryFee || 0) > 0 ? "O pagamento é conferido manualmente pela organização." : "A inscrição é gratuita e confirmada automaticamente."} Seu código de inscrição acompanha todo o processo.</span><Link href="/inscricoes">Acompanhar inscrição <ArrowRight size={14} /></Link></div>
    </div>
  );
}
