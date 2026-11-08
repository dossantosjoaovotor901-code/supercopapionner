import { FormEvent, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  LockKeyhole,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
  Trophy,
  UploadCloud,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { PageHeading } from "@/components/copa/ui";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { registrationStatusLabels } from "../../../shared/championship";

type PlayerDraft = {
  name: string;
  discord: string;
  nickname: string;
  isCaptain: boolean;
  isReserve: boolean;
};

const blankPlayer = (captain = false): PlayerDraft => ({
  name: "",
  discord: "",
  nickname: "",
  isCaptain: captain,
  isReserve: false,
});

const date = (value?: string) => {
  if (!value) return "Sem prazo";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime())
    ? "Data não informada"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(parsed);
};

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

export default function EventRegistration() {
  const competitionId = new URLSearchParams(window.location.search).get("competitionId") || "";
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const event = trpc.competitions.get.useQuery({ competitionId }, { enabled: Boolean(competitionId) });
  const mine = trpc.competitions.mine.useQuery(undefined, { enabled: Boolean(user) });
  const [step, setStep] = useState(1);
  const [teamName, setTeamName] = useState("");
  const [shortName, setShortName] = useState("");
  const [teamDiscord, setTeamDiscord] = useState("");
  const [captainName, setCaptainName] = useState(user?.name || "");
  const [captainDiscord, setCaptainDiscord] = useState("");
  const [players, setPlayers] = useState<PlayerDraft[]>([blankPlayer(true)]);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [acceptedFinancial, setAcceptedFinancial] = useState(false);
  const [responsible, setResponsible] = useState(false);
  const [registerAnother, setRegisterAnother] = useState(false);
  const registrations = mine.data?.find(item => item.competitionId === competitionId)?.registrations ?? [];
  const submit = trpc.competitions.register.useMutation({
    onSuccess: result => {
      toast.success(`Inscrição ${result.code} enviada.`);
      setRegisterAnother(false);
      setStep(1);
      setTeamName("");
      setShortName("");
      setTeamDiscord("");
      setCaptainName(user?.name || "");
      setCaptainDiscord("");
      setPlayers([blankPlayer(true)]);
      setAcceptedRules(false);
      setAcceptedFinancial(false);
      setResponsible(false);
      void utils.competitions.mine.invalidate();
      void utils.competitions.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const proof = trpc.competitions.submitProof.useMutation({
    onSuccess: () => {
      toast.success("Comprovante enviado para análise.");
      void utils.competitions.mine.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const fee = useMemo(
    () => (event.data?.state.config.entryFee ?? 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    }),
    [event.data?.state.config.entryFee]
  );

  async function sendProof(registrationId: string, file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("O comprovante deve ter no máximo 5 MB.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.type)) {
      toast.error("Envie uma imagem PNG/JPEG/WebP ou um PDF.");
      return;
    }
    try {
      await proof.mutateAsync({
        competitionId,
        registrationId,
        base64: await toBase64(file),
        mime: file.type as "image/png" | "image/jpeg" | "image/webp" | "application/pdf",
        fileName: file.name,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar comprovante.");
    }
  }

  function updatePlayer(index: number, patch: Partial<PlayerDraft>) {
    setPlayers(current => current.map((player, currentIndex) => ({
      ...player,
      ...(currentIndex === index ? patch : {}),
      ...(patch.isCaptain && currentIndex !== index ? { isCaptain: false } : {}),
    })));
  }

  function goToRoster() {
    if (teamName.trim().length < 2 || shortName.trim().length < 2 || captainName.trim().length < 2) {
      toast.error("Preencha o nome da equipe, a sigla e o nome do capitão.");
      return;
    }
    setStep(2);
  }

  function goToReview() {
    if (players.some(player => player.name.trim().length < 2)) {
      toast.error("Informe o nome de todos os jogadores (mínimo de 2 caracteres).");
      return;
    }
    if (!players.some(player => player.isCaptain)) {
      toast.error("Marque qual jogador é o capitão no elenco.");
      return;
    }
    setStep(3);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!acceptedRules || !acceptedFinancial || !responsible) {
      toast.error("Confirme os três itens antes de enviar a inscrição.");
      return;
    }
    submit.mutate({
      competitionId,
      teamName,
      shortName,
      teamDiscord,
      captainName,
      captainDiscord,
      players,
      acceptedRules: true,
      acceptedFinancial: true,
      responsible: true,
    });
  }

  if (!competitionId) {
    return (
      <div className="registration-page">
        <PageHeading title="Escolha uma competição" subtitle="Abra a agenda e selecione a competição em que deseja inscrever sua equipe." />
        <Link href="/campeonatos" className="btn btn-primary"><ArrowLeft size={15} /> Ver competições</Link>
      </div>
    );
  }

  if (event.isLoading) {
    return <div className="registration-page"><PageHeading title="Carregando inscrição" subtitle="Buscando os detalhes da competição..." /></div>;
  }

  if (event.error || !event.data) {
    return (
      <div className="registration-page">
        <PageHeading title="Competição indisponível" subtitle={event.error?.message || "Não encontramos essa competição."} />
        <Link href="/campeonatos" className="btn btn-ghost"><ArrowLeft size={15} /> Voltar para competições</Link>
      </div>
    );
  }

  const edition = event.data;
  const config = edition.state.config;
  const entryFee = config.entryFee ?? 0;
  const open = edition.status === "registration" && (!config.registrationDeadline || new Date(`${config.registrationDeadline}T23:59:59`) >= new Date());
  const canRegister = open && (!registrations.length || registerAnother);
  const competitionType = edition.type === "weekly" ? "Mini campeonato semanal" : edition.type === "league" ? "Liga" : "Copa";
  const statusText = edition.status === "completed" ? "Concluída" : edition.status === "running" ? "Em andamento" : open ? "Inscrições abertas" : "Inscrições encerradas";
  const teams = new Map(edition.state.teams.map(team => [team.id, team.name]));

  if (!user && open) {
    return (
      <div className="registration-page">
        <PageHeading title="Entre para continuar" subtitle={`Sua inscrição em ${config.name} ficará vinculada à sua conta.`} />
        <section className="panel registration-login-card">
          <div className="registration-login-icon"><LockKeyhole size={26} /></div>
          <h2>Entre ou crie sua conta</h2>
          <p>Depois de entrar, você poderá cadastrar a equipe e acompanhar o status da inscrição.</p>
          <Link className="btn btn-primary" href={`/login?returnTo=${encodeURIComponent(`/inscricoes/nova?competitionId=${competitionId}`)}`}>
            Entrar ou criar conta <ArrowRight size={15} />
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="registration-page event-registration-page">
      <Link href="/campeonatos" className="event-back-link"><ArrowLeft size={15} /> Voltar para competições</Link>
      <PageHeading title={canRegister ? "Inscrever equipe" : `Acompanhar ${config.name}`} subtitle={`${competitionType} · ${date(edition.eventDate)}`}>
        <span className={`phase-pill ${open ? "is-open" : ""}`}><span className="phase-dot" />{statusText}</span>
      </PageHeading>

      <section className="event-registration-layout">
        <div className="event-registration-main">
          {registrations.map(registration => (
            <article className="panel event-registration-status" key={registration.id}>
              <div className="event-registration-status-head">
                <span className="event-registration-status-icon"><CheckCircle2 size={20} /></span>
                <div><span className="eyebrow">INSCRIÇÃO DA EQUIPE</span><h2>{registration.teamName}</h2></div>
                <span className="registration-status">{registrationStatusLabels[registration.status]}</span>
              </div>
              <div className="event-registration-code"><span>Código da inscrição</span><strong>{registration.code}</strong></div>
              <p className="muted">{registration.status === "confirmed" ? "Sua vaga está confirmada. Acompanhe por aqui as atualizações da competição." : registration.status === "rejected" ? "Esta inscrição foi recusada. Fale com a organização se precisar de mais informações." : "A organização está analisando sua inscrição."}</p>
              {entryFee > 0 && !["confirmed", "rejected", "cancelled", "expired"].includes(registration.status) && (
                <div className="event-payment-panel">
                  <div><strong>Taxa de inscrição: {fee}</strong><span>Prazo de pagamento: {registration.paymentDeadline ? date(registration.paymentDeadline) : "Sem prazo definido"}</span></div>
                  {config.pixKey && <p><b>Pix:</b> {config.pixKey}{config.pixReceiver ? ` · ${config.pixReceiver}` : ""}</p>}
                  <label className="btn btn-primary upload-proof"><UploadCloud size={15} /> Enviar comprovante<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" disabled={proof.isPending} onChange={e => { const file = e.target.files?.[0]; if (file) void sendProof(registration.id, file); e.currentTarget.value = ""; }} /></label>
                  {proof.isPending && <small>Enviando comprovante...</small>}
                </div>
              )}
            </article>
          ))}

          {canRegister ? (
            <form className="event-registration-form" onSubmit={onSubmit}>
              <section className="panel event-form-card">
                <div className="event-form-heading">
                  <span className="event-form-icon"><Users size={19} /></span>
                  <div><span className="eyebrow">NOVA INSCRIÇÃO</span><h2>Dados da equipe</h2><p>Preencha as informações para reservar sua vaga.</p></div>
                </div>
                <nav className="event-form-steps" aria-label="Etapas da inscrição">
                  {[
                    { number: 1, title: "Equipe", Icon: Trophy },
                    { number: 2, title: "Elenco", Icon: Users },
                    { number: 3, title: "Confirmar", Icon: ShieldCheck },
                  ].map(({ number, title, Icon }) => (
                    <button className={`event-form-step${step === number ? " is-active" : ""}${step > number ? " is-done" : ""}`} key={number} type="button" onClick={() => number < step && setStep(number)} aria-current={step === number ? "step" : undefined}>
                      <span>{step > number ? <Check size={14} /> : <Icon size={14} />}</span>{title}
                    </button>
                  ))}
                </nav>

                {step === 1 && (
                  <div className="event-form-step-content">
                    <div className="event-form-section-title"><span>01</span><div><h3>Identificação da equipe</h3><p>Como sua equipe vai aparecer na competição?</p></div></div>
                    <div className="event-form-grid">
                      <label className="event-field"><span>Nome da equipe <b>*</b></span><input autoFocus value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Ex.: Pionner Five" maxLength={160} required /></label>
                      <label className="event-field"><span>Sigla <b>*</b></span><input value={shortName} onChange={e => setShortName(e.target.value.toUpperCase())} placeholder="Ex.: PNR" maxLength={8} required /></label>
                      <label className="event-field event-field-wide"><span>Discord da equipe <small>Opcional</small></span><input value={teamDiscord} onChange={e => setTeamDiscord(e.target.value)} placeholder="Convite ou identificação da equipe" maxLength={128} /></label>
                    </div>
                    <div className="event-form-section-title event-captain-title"><span>02</span><div><h3>Contato do capitão</h3><p>Usaremos esses dados para falar sobre a inscrição.</p></div></div>
                    <div className="event-form-grid">
                      <label className="event-field"><span>Nome do capitão <b>*</b></span><input value={captainName} onChange={e => setCaptainName(e.target.value)} placeholder="Nome completo" maxLength={160} required /></label>
                      <label className="event-field"><span>Discord do capitão <small>Opcional</small></span><input value={captainDiscord} onChange={e => setCaptainDiscord(e.target.value)} placeholder="@usuario" maxLength={128} /></label>
                    </div>
                    <div className="event-form-actions"><Link href="/campeonatos" className="btn btn-ghost">Cancelar</Link><button type="button" className="btn btn-primary" onClick={goToRoster}>Continuar para o elenco <ArrowRight size={15} /></button></div>
                  </div>
                )}

                {step === 2 && (
                  <div className="event-form-step-content">
                    <div className="event-form-section-title"><span>03</span><div><h3>Jogadores da equipe</h3><p>Adicione o elenco e marque quem é o capitão.</p></div><span className="registration-counter">{players.length}/32</span></div>
                    <div className="event-roster event-roster-redesigned">
                      <div className="event-roster-head"><span>JOGADOR</span><span>APELIDO</span><span>DISCORD</span><span>PAPEL</span><span /></div>
                      <div className="event-roster-list">{players.map((player, index) => (
                        <div className="event-roster-row" key={index}>
                          <span className="event-roster-number">{String(index + 1).padStart(2, "0")}</span>
                          <input aria-label={`Nome do jogador ${index + 1}`} value={player.name} onChange={e => updatePlayer(index, { name: e.target.value })} placeholder="Nome do jogador" maxLength={160} required />
                          <input aria-label={`Apelido do jogador ${index + 1}`} value={player.nickname} onChange={e => updatePlayer(index, { nickname: e.target.value })} placeholder="Apelido" maxLength={48} />
                          <input aria-label={`Discord do jogador ${index + 1}`} value={player.discord} onChange={e => updatePlayer(index, { discord: e.target.value })} placeholder="Discord" maxLength={128} />
                          <label className={`event-captain-toggle${player.isCaptain ? " is-selected" : ""}`}><input type="radio" name="captain" checked={player.isCaptain} onChange={() => updatePlayer(index, { isCaptain: true })} /><span>{player.isCaptain ? "Capitão" : "Marcar capitão"}</span></label>
                          <button type="button" className="player-remove" aria-label={`Remover jogador ${index + 1}`} disabled={players.length === 1} onClick={() => setPlayers(current => current.filter((_, currentIndex) => currentIndex !== index))}><Trash2 size={15} /></button>
                        </div>
                      ))}</div>
                      <button type="button" className="add-player" disabled={players.length >= 32} onClick={() => setPlayers(current => current.length >= 32 ? current : [...current, blankPlayer()])}><Plus size={15} /> Adicionar jogador</button>
                      <p className="event-roster-help">Você pode cadastrar de 1 a 32 jogadores. O capitão também deve constar no elenco.</p>
                    </div>
                    <div className="event-form-actions"><button type="button" className="btn btn-ghost" onClick={() => setStep(1)}><ArrowLeft size={15} /> Voltar</button><button type="button" className="btn btn-primary" onClick={goToReview}>Revisar inscrição <ArrowRight size={15} /></button></div>
                  </div>
                )}

                {step === 3 && (
                  <div className="event-form-step-content">
                    <div className="event-form-section-title"><span>04</span><div><h3>Revise e confirme</h3><p>Confira os dados antes de enviar para a organização.</p></div></div>
                    <div className="event-review-card">
                      <div><span>Equipe</span><strong>{teamName} <small>{shortName}</small></strong></div>
                      <div><span>Capitão</span><strong>{captainName}</strong></div>
                      <div><span>Elenco</span><strong>{players.length} jogador(es) · {players.find(player => player.isCaptain)?.name || "Capitão não selecionado"}</strong></div>
                      <div><span>Taxa de inscrição</span><strong>{entryFee === 0 ? "Gratuita" : fee}</strong></div>
                    </div>
                    <div className="event-terms event-terms-redesigned">
                      <label><input type="checkbox" checked={acceptedRules} onChange={e => setAcceptedRules(e.target.checked)} /><span><strong>Aceito o regulamento</strong><small>Li e concordo com as regras desta competição.</small></span></label>
                      <label><input type="checkbox" checked={acceptedFinancial} onChange={e => setAcceptedFinancial(e.target.checked)} /><span><strong>Estou ciente da taxa</strong><small>{entryFee > 0 ? `A inscrição custa ${fee}; confira as informações de pagamento na confirmação.` : "A inscrição nesta competição é gratuita."}</small></span></label>
                      <label><input type="checkbox" checked={responsible} onChange={e => setResponsible(e.target.checked)} /><span><strong>Confirmo os dados enviados</strong><small>Sou responsável pelas informações cadastradas da equipe.</small></span></label>
                    </div>
                    <div className="event-form-actions"><button type="button" className="btn btn-ghost" onClick={() => setStep(2)}><ArrowLeft size={15} /> Voltar ao elenco</button><button type="submit" className="btn btn-primary" disabled={submit.isPending || !acceptedRules || !acceptedFinancial || !responsible}>{submit.isPending ? "Enviando inscrição..." : "Confirmar inscrição"} <ArrowRight size={15} /></button></div>
                  </div>
                )}
              </section>
            </form>
          ) : !open && edition.status === "registration" ? (
            <section className="panel event-registration-closed"><LockKeyhole size={24} /><h2>Inscrições encerradas</h2><p>O prazo para entrar nesta competição terminou.</p><Link className="btn btn-ghost" href="/campeonatos">Ver outras competições</Link></section>
          ) : null}

          {edition.status !== "registration" && (
            <section className="panel event-matches">
              <div className="section-header"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2>Partidas</h2></div></div>
              {edition.state.matches.map(match => (
                <div className="event-match" key={match.id}>
                  <span>{teams.get(match.homeId || "") || "A definir"}</span>
                  <strong>{match.status === "finished" ? `${match.homeScore} × ${match.awayScore}` : "×"}</strong>
                  <span>{teams.get(match.awayId || "") || "A definir"}</span>
                </div>
              ))}
            </section>
          )}
        </div>

        <aside className="event-registration-aside">
          <section className="panel event-summary-card">
            <span className="eyebrow">RESUMO DA COMPETIÇÃO</span>
            <h2>{config.name}</h2>
            <span className={`phase-pill ${open ? "is-open" : ""}`}><span className="phase-dot" />{statusText}</span>
            <div className="event-summary-list">
              <div><CalendarDays size={16} /><span><small>Data do evento</small><strong>{date(edition.eventDate)}</strong></span></div>
              <div><CircleDollarSign size={16} /><span><small>Inscrição</small><strong>{entryFee === 0 ? "Gratuita" : fee}</strong></span></div>
              <div><FileText size={16} /><span><small>Inscrições até</small><strong>{date(config.registrationDeadline)}</strong></span></div>
              <div><Users size={16} /><span><small>Vagas ocupadas</small><strong>{edition.registrationCount ?? (edition.state.registrations ?? []).length}{config.maxTeams ? ` de ${config.maxTeams}` : ""}</strong></span></div>
              {config.venue && <div><MapPin size={16} /><span><small>Local</small><strong>{config.venue}</strong></span></div>}
            </div>
          </section>
          <section className="event-registration-help">
            <ShieldCheck size={18} />
            <div><strong>Seus dados protegidos</strong><p>A inscrição fica vinculada à sua conta e só a organização pode consultar os dados da equipe.</p></div>
          </section>
        </aside>
      </section>

      {open && registrations.length > 0 && (
        <section className="event-my-registrations">
          <div className="section-header"><div><span className="eyebrow">ÁREA DO CAPITÃO</span><h2>Suas equipes inscritas</h2></div></div>
          <div className="event-my-registration-list">
            {registrations.map(registration => <article className="panel event-my-registration" key={registration.id}>
              <span className="registration-status">{registrationStatusLabels[registration.status]}</span>
              <div><strong>{registration.teamName}</strong><small>{registration.code}</small></div>
            </article>)}
          </div>
          {!registerAnother && <button className="btn btn-ghost" onClick={() => { setRegisterAnother(true); setStep(1); }}><Plus size={15} /> Inscrever outra equipe</button>}
        </section>
      )}
    </div>
  );
}
