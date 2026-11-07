import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Trash2, UploadCloud } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { PageHeading } from "@/components/copa/ui";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type PlayerDraft = { name: string; discord: string; nickname: string; isCaptain: boolean; isReserve: boolean };
const blankPlayer = (): PlayerDraft => ({ name: "", discord: "", nickname: "", isCaptain: false, isReserve: false });

const date = (value: string) => {
  if (!value) return "Sem prazo";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime())
    ? "Data não informada"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(parsed);
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
  const [teamName, setTeamName] = useState("");
  const [shortName, setShortName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [captainDiscord, setCaptainDiscord] = useState("");
  const [teamDiscord, setTeamDiscord] = useState("");
  const [players, setPlayers] = useState<PlayerDraft[]>([blankPlayer()]);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [acceptedFinancial, setAcceptedFinancial] = useState(false);
  const [responsible, setResponsible] = useState(false);
  const registrations = mine.data?.find(item => item.competitionId === competitionId)?.registrations ?? [];
  const [registerAnother, setRegisterAnother] = useState(false);
  const submit = trpc.competitions.register.useMutation({
    onSuccess: result => {
      toast.success(`Inscrição ${result.code} enviada.`);
      setRegisterAnother(false);
      setTeamName("");
      setShortName("");
      setTeamDiscord("");
      setPlayerName("");
      setCaptainDiscord("");
      setPlayers([blankPlayer()]);
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
      toast.success("Comprovante enviado.");
      void utils.competitions.mine.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const fee = useMemo(
    () =>
      (event.data?.state.config.entryFee ?? 0).toLocaleString("pt-BR", {
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

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (players.some(player => !player.name.trim())) {
      toast.error("Preencha o nome de todos os jogadores.");
      return;
    }
    if (!acceptedRules || !acceptedFinancial || !responsible) {
      toast.error("Aceite os três termos para continuar.");
      return;
    }
    submit.mutate({
      competitionId,
      teamName,
      shortName,
      teamDiscord,
      captainName: playerName,
      captainDiscord,
      players,
      acceptedRules: true,
      acceptedFinancial: true,
      responsible: true,
    });
  }

  function updatePlayer(index: number, patch: Partial<PlayerDraft>) {
    setPlayers(current => current.map((player, currentIndex) => ({
      ...player,
      ...(currentIndex === index ? patch : {}),
      ...(patch.isCaptain && currentIndex !== index ? { isCaptain: false } : {}),
    })));
  }

  if (!event.data) {
    return <div className="registration-page"><PageHeading title="Inscrição da competição" subtitle={event.error?.message || "Carregando competição..."} /><Link href="/campeonatos" className="btn btn-ghost"><ArrowLeft size={15} /> Voltar</Link></div>;
  }
  if (!user && event.data.status === "registration") {
    return <div className="registration-page"><PageHeading title="Entre para se inscrever" subtitle="A inscrição fica vinculada à sua conta." /><Link className="btn btn-primary" href={`/login?returnTo=${encodeURIComponent(`/inscricoes/nova?competitionId=${competitionId}`)}`}>Entrar ou criar conta <ArrowRight size={15} /></Link></div>;
  }

  const config = event.data.state.config;
  const alreadyRegistered = registrations.length > 0;
  const entryFee = config.entryFee ?? 0;
  const open = event.data.status === "registration" && (!config.registrationDeadline || new Date(`${config.registrationDeadline}T23:59:59`) >= new Date());
  const teams = new Map(event.data.state.teams.map(team => [team.id, team.name]));
  return (
    <div className="registration-page">
      <PageHeading title={event.data.status === "registration" ? alreadyRegistered ? "Sua inscrição" : `Inscrever em ${config.name}` : `Acompanhar ${config.name}`} subtitle={`${event.data.type === "weekly" ? "Mini campeonato semanal" : event.data.type === "league" ? "Liga" : "Copa"} · ${date(event.data.eventDate)}`} />
      {registrations.map(registration => (
        <article className="panel registration-status-card" key={registration.id}>
          <span className="eyebrow">CÓDIGO SCP</span>
          <strong className="registration-code">{registration.code}</strong>
          <h2>{registration.teamName}</h2>
          <p className="muted">{registration.status === "confirmed" ? "Inscrição confirmada." : registration.status === "rejected" ? "Inscrição recusada pela organização." : "Aguardando validação da organização."}</p>
          {entryFee > 0 && registration.status !== "confirmed" && registration.status !== "rejected" && <div className="payment-box"><div><strong>Taxa: {fee}</strong><span>Prazo: {registration.paymentDeadline ? date(registration.paymentDeadline) : "Sem prazo definido"}</span></div><label className="btn btn-primary upload-proof"><UploadCloud size={15} /> Enviar comprovante<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={e => { const file = e.target.files?.[0]; if (file) void sendProof(registration.id, file); }} /></label></div>}
          {entryFee > 0 && config.pixKey && registration.status !== "confirmed" && registration.status !== "rejected" && <div className="pix-hint"><strong>Pix</strong><span>{config.pixKey}{config.pixReceiver ? ` · ${config.pixReceiver}` : ""}</span></div>}
        </article>
      ))}
      {event.data.status !== "registration" && (
        <section className="panel event-matches">
          <div className="section-header"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2>Partidas</h2></div></div>
          {event.data.state.matches.map(match => (
            <div className="event-match" key={match.id}>
              <span>{teams.get(match.homeId || "") || "A definir"}</span>
              <strong>{match.status === "finished" ? `${match.homeScore} × ${match.awayScore}` : "×"}</strong>
              <span>{teams.get(match.awayId || "") || "A definir"}</span>
            </div>
          ))}
        </section>
      )}
      {open && alreadyRegistered && !registerAnother && (
        <button className="btn btn-ghost registration-add-another" onClick={() => setRegisterAnother(true)}>Inscrever outra equipe</button>
      )}
      {(!alreadyRegistered || registerAnother) && open && (
        <form className="registration-form" onSubmit={onSubmit}>
          <section className="panel registration-card">
            <div className="registration-card-head"><div><span className="eyebrow">COMPETIÇÃO</span><h2>{config.name}</h2></div></div>
            <div className="registration-summary"><div><span>Data</span><strong>{date(event.data.eventDate)}</strong></div><div><span>Inscrição</span><strong>{fee}</strong></div><div><span>Inscrever até</span><strong>{date(config.registrationDeadline || "")}</strong></div></div>
            <div className="form-grid">
              <label><span>Nome da equipe</span><input value={teamName} onChange={e => setTeamName(e.target.value)} required /></label>
              <label><span>Sigla</span><input value={shortName} onChange={e => setShortName(e.target.value.toUpperCase())} maxLength={8} required /></label>
              <label><span>Nome do capitão</span><input value={playerName} onChange={e => setPlayerName(e.target.value)} required /></label>
              <label><span>Discord da equipe <small>opcional</small></span><input value={teamDiscord} onChange={e => setTeamDiscord(e.target.value)} /></label>
              <label><span>Discord do capitão</span><input value={captainDiscord} onChange={e => setCaptainDiscord(e.target.value)} /></label>
            </div>
            <section className="event-roster">
              <div className="registration-card-head"><div><span className="eyebrow">ELENCO</span><h2>Jogadores da equipe</h2></div><span className="registration-counter">{players.length}/32</span></div>
              <div className="player-drafts">{players.map((player, index) => <div className="player-draft" key={index}>
                <span className="player-number">{String(index + 1).padStart(2, "0")}</span>
                <input aria-label={`Nome do jogador ${index + 1}`} value={player.name} onChange={e => updatePlayer(index, { name: e.target.value })} placeholder="Nome do jogador" required />
                <input aria-label={`Apelido do jogador ${index + 1}`} value={player.nickname} onChange={e => updatePlayer(index, { nickname: e.target.value })} placeholder="Apelido" />
                <input aria-label={`Discord do jogador ${index + 1}`} value={player.discord} onChange={e => updatePlayer(index, { discord: e.target.value })} placeholder="Discord" />
                <label className="player-check"><input type="checkbox" checked={player.isCaptain} onChange={e => updatePlayer(index, { isCaptain: e.target.checked })} /> Capitão</label>
                <button type="button" className="player-remove" aria-label={`Remover jogador ${index + 1}`} disabled={players.length === 1} onClick={() => setPlayers(current => current.filter((_, currentIndex) => currentIndex !== index))}><Trash2 size={15} /></button>
              </div>)}</div>
              <button type="button" className="add-player" disabled={players.length >= 32} onClick={() => setPlayers(current => current.length >= 32 ? current : [...current, blankPlayer()])}><Plus size={15} /> Adicionar jogador</button>
            </section>
            <div className="event-terms">
              <label><input type="checkbox" checked={acceptedRules} onChange={e => setAcceptedRules(e.target.checked)} /> Aceito o regulamento da competição.</label>
              <label><input type="checkbox" checked={acceptedFinancial} onChange={e => setAcceptedFinancial(e.target.checked)} /> Estou ciente das condições financeiras da inscrição.</label>
              <label><input type="checkbox" checked={responsible} onChange={e => setResponsible(e.target.checked)} /> Confirmo que sou responsável pelos dados enviados.</label>
            </div>
            {!open && <p className="competition-note">As inscrições desta competição estão encerradas.</p>}
            <div className="registration-form-footer"><Link className="btn btn-ghost" href="/campeonatos">Voltar</Link><button className="btn btn-primary" disabled={!open || submit.isPending}>{submit.isPending ? "Enviando..." : "Enviar inscrição"} <ArrowRight size={15} /></button></div>
          </section>
        </form>
      )}
      {event.data.status === "registration" && !open && <p className="competition-note">As inscrições desta competição estão encerradas.</p>}
    </div>
  );
}
