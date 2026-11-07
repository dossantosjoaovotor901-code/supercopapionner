import { ChangeEvent, useMemo, useState } from "react";
import { ArrowRight, Check, FileText, LockKeyhole, Plus, ReceiptText, ShieldCheck, Trash2, UploadCloud } from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import type { RegistrationStatus } from "../../../shared/championship";
import { registrationStatusLabels } from "../../../shared/championship";
import { PageHeading } from "@/components/copa/ui";

const statusClass = (status: RegistrationStatus) => `registration-status status-${status.replaceAll("_", "-")}`;
const date = (value: string) => {
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? "A definir" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(parsed);
};
const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
  reader.readAsDataURL(file);
});

type PlayerDraft = { name: string; discord: string; nickname: string; isCaptain: boolean; isReserve: boolean };
const blankPlayer = (captain = false): PlayerDraft => ({ name: "", discord: "", nickname: "", isCaptain: captain, isReserve: false });

export default function Registration({ entryFee = 0, paymentDeadline = "", registrationDeadline = "", pixKey = "", pixReceiver = "" }: { entryFee?: number; paymentDeadline?: string; registrationDeadline?: string; pixKey?: string; pixReceiver?: string }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const mine = trpc.tournament.myRegistrations.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const submit = trpc.tournament.submitRegistration.useMutation({ onSuccess: result => { toast.success(`Inscrição ${result.code} criada.`); void mine.refetch(); setLocation("/inscricoes"); }, onError: error => toast.error(error.message) });
  const proof = trpc.tournament.submitPaymentProof.useMutation({ onSuccess: () => { toast.success("Comprovante enviado para análise."); void mine.refetch(); void utils.tournament.get.invalidate(); }, onError: error => toast.error(error.message) });
  const [teamName, setTeamName] = useState("");
  const [shortName, setShortName] = useState("");
  const [teamDiscord, setTeamDiscord] = useState("");
  const [captainName, setCaptainName] = useState(user?.name || "");
  const [captainDiscord, setCaptainDiscord] = useState("");
  const [players, setPlayers] = useState<PlayerDraft[]>([blankPlayer(true)]);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [acceptedFinancial, setAcceptedFinancial] = useState(false);
  const [responsible, setResponsible] = useState(false);
  const isForm = typeof window !== "undefined" && window.location.pathname.endsWith("/nova");
  const open = !registrationDeadline || new Date(`${registrationDeadline}T23:59:59`).getTime() >= Date.now();
  const hasRegistration = (mine.data?.state.registrations ?? []).length > 0;
  const addPlayer = () => setPlayers(current => current.length >= 32 ? current : [...current, blankPlayer()]);
  const updatePlayer = (index: number, patch: Partial<PlayerDraft>) => setPlayers(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const removePlayer = (index: number) => setPlayers(current => current.length <= 1 ? current : current.filter((_, itemIndex) => itemIndex !== index));
  const submitForm = (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return startLogin();
    if (players.some(player => !player.name.trim())) return toast.error("Preencha o nome de todos os jogadores.");
    if (!acceptedRules || !acceptedFinancial || !responsible) return toast.error("Aceite os três termos para continuar.");
    submit.mutate({ teamName, shortName, teamDiscord, captainName, captainDiscord, players, acceptedRules: true, acceptedFinancial: true, responsible: true });
  };
  const submitProof = async (registrationId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("O comprovante deve ter no máximo 5 MB.");
    const allowed = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) return toast.error("Envie uma imagem PNG/JPEG/WebP ou PDF.");
    try { proof.mutate({ registrationId, base64: await fileToBase64(file), mime: file.type as "image/png" | "image/jpeg" | "image/webp" | "application/pdf", fileName: file.name }); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível ler o comprovante."); }
  };
  const registrations = mine.data?.state.registrations ?? [];
  const payments = mine.data?.state.payments ?? [];
  const paymentFor = (registrationId: string) => payments.find(item => item.registrationId === registrationId);
  const fee = useMemo(() => entryFee.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), [entryFee]);

  if (!user) return <div className="registration-page"><PageHeading title="Inscreva sua equipe" subtitle="A inscrição fica vinculada à sua conta para manter o histórico seguro." /><section className="registration-login-card"><div className="registration-login-icon"><LockKeyhole size={26} /></div><h2>Entre para começar</h2><p>Entre ou crie uma conta para cadastrar a equipe, acompanhar o código SCP e enviar o comprovante Pix.</p><button className="btn btn-primary" onClick={startLogin}>Entrar ou criar conta <ArrowRight size={15} /></button></section></div>;

  return <div className="registration-page">
    <PageHeading title={isForm ? "Nova inscrição" : "Minhas inscrições"} subtitle={isForm ? "Cadastre sua equipe em poucos passos. O código gerado será sua referência oficial." : "Acompanhe status, prazo de pagamento e análise dos comprovantes enviados."}>
      <span className={`phase-pill ${open ? "is-open" : ""}`}><span className="phase-dot" />{open ? "Inscrições abertas" : "Inscrições encerradas"}</span>
    </PageHeading>
    {isForm ? <>
      <div className="registration-steps"><span className="active"><b>1</b>Equipe e capitão</span><i /><span><b>2</b>Elenco</span><i /><span><b>3</b>Confirmação</span></div>
      <form className="registration-form" onSubmit={submitForm}>
        <section className="panel registration-card"><div className="registration-card-head"><div><span className="eyebrow">IDENTIDADE DA EQUIPE</span><h2>Quem vai entrar em campo?</h2></div><ShieldCheck className="blue" size={22} /></div><div className="form-grid"><label><span>Nome da equipe</span><input value={teamName} onChange={event => setTeamName(event.target.value)} placeholder="Ex.: Pionner Five" required /></label><label><span>Sigla</span><input value={shortName} onChange={event => setShortName(event.target.value.toUpperCase())} maxLength={8} placeholder="PNR" required /></label><label><span>Discord da equipe <small>opcional</small></span><input value={teamDiscord} onChange={event => setTeamDiscord(event.target.value)} placeholder="discord.gg/..." /></label><label><span>Discord do capitão</span><input value={captainDiscord} onChange={event => setCaptainDiscord(event.target.value)} placeholder="@usuario" /></label><label className="wide"><span>Nome do capitão</span><input value={captainName} onChange={event => setCaptainName(event.target.value)} required /></label></div></section>
        <section className="panel registration-card"><div className="registration-card-head"><div><span className="eyebrow">ELENCO</span><h2>Jogadores da equipe</h2></div><span className="registration-counter">{players.length}/32</span></div><div className="player-drafts">{players.map((player, index) => <div className="player-draft" key={index}><span className="player-number">{String(index + 1).padStart(2, "0")}</span><input value={player.name} onChange={event => updatePlayer(index, { name: event.target.value })} placeholder="Nome completo" required /><input value={player.nickname} onChange={event => updatePlayer(index, { nickname: event.target.value })} placeholder="Nick" /><input value={player.discord} onChange={event => updatePlayer(index, { discord: event.target.value })} placeholder="Discord" /><label className="player-check"><input type="checkbox" checked={player.isReserve} onChange={event => updatePlayer(index, { isReserve: event.target.checked })} /> reserva</label>{index > 0 && <button type="button" className="icon-btn" onClick={() => removePlayer(index)} aria-label="Remover jogador"><Trash2 size={15} /></button>}</div>)}</div><button className="add-player" type="button" onClick={addPlayer}><Plus size={16} /> Adicionar jogador</button></section>
        <section className="panel registration-card"><div className="registration-card-head"><div><span className="eyebrow">CONFIRMAÇÃO</span><h2>Antes de enviar</h2></div><ReceiptText className="blue" size={22} /></div><div className="registration-summary"><div><span>Taxa de inscrição</span><strong>{fee}</strong></div><div><span>Pagamento até</span><strong>{(entryFee || 0) > 0 ? paymentDeadline ? date(paymentDeadline) : "Sem prazo" : "Não se aplica"}</strong></div><div><span>Inscrições até</span><strong>{date(registrationDeadline)}</strong></div></div><div className="terms-list"><label><input type="checkbox" checked={acceptedRules} onChange={event => setAcceptedRules(event.target.checked)} /> Aceito o regulamento desta competição.</label><label><input type="checkbox" checked={acceptedFinancial} onChange={event => setAcceptedFinancial(event.target.checked)} /> {(entryFee || 0) > 0 ? "Aceito as condições financeiras e o prazo de pagamento." : "Confirmo que estou ciente de que a inscrição é gratuita."}</label><label><input type="checkbox" checked={responsible} onChange={event => setResponsible(event.target.checked)} /> Confirmo que as informações da equipe e do elenco são verdadeiras.</label></div><div className="registration-form-footer"><Link className="btn btn-ghost" href="/regulamento">Ver regulamento</Link><button className="btn btn-primary" type="submit" disabled={submit.isPending || !open}>{submit.isPending ? "Enviando…" : "Enviar inscrição"}<ArrowRight size={15} /></button></div></section>
      </form>
    </> : <>
      {!registrations.length && <section className="registration-empty"><FileText size={30} /><h2>Nenhuma inscrição encontrada</h2><p>Cadastre sua equipe para receber um código e as instruções de pagamento.</p><Link className="btn btn-primary" href="/inscricoes/nova">Começar inscrição <ArrowRight size={15} /></Link></section>}
      <div className="registration-list">{registrations.map(registration => { const payment = paymentFor(registration.id); return <article className="panel registration-status-card" key={registration.id}><div className="registration-status-top"><div><span className="eyebrow">CÓDIGO DA INSCRIÇÃO</span><strong className="registration-code">{registration.code}</strong></div><span className={statusClass(registration.status)}>{registrationStatusLabels[registration.status]}</span></div><div className="registration-team-row"><div className="registration-team-mark">{registration.shortName.slice(0, 3)}</div><div><h2>{registration.teamName}</h2><span>{registration.players.length} jogadores · enviada em {date(registration.createdAt)}</span></div></div>{(entryFee || 0) > 0 && registration.status !== "confirmed" && <div className="payment-box"><div><strong>{payment?.proofUrl ? "Comprovante recebido" : "Envie o comprovante Pix"}</strong><span>{payment?.proofUrl ? `${payment.proofName} · aguardando conferência da organização` : `Pagamento até ${registration.paymentDeadline ? date(registration.paymentDeadline) : "Sem prazo definido"}`}</span></div>{!payment?.proofUrl && !["expired", "cancelled"].includes(registration.status) && <label className="btn btn-primary upload-proof"><UploadCloud size={15} /> Selecionar arquivo<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={event => void submitProof(registration.id, event)} /></label>}</div>}{registration.status === "confirmed" && <div className="confirmed-banner"><Check size={17} /> {(entryFee || 0) > 0 ? "Pagamento aprovado. Sua equipe está confirmada na competição." : "Inscrição gratuita confirmada. Sua equipe está na competição."}</div>}{(entryFee || 0) > 0 && pixKey && !payment?.proofUrl && <div className="pix-hint"><strong>Pix para pagamento</strong><span>{pixKey}{pixReceiver ? ` · ${pixReceiver}` : ""}</span></div>}<div className="registration-history">{registration.history.slice().reverse().slice(0, 3).map(entry => <div key={entry.id}><i /><span><strong>{registrationStatusLabels[entry.status]}</strong><small>{entry.note} · {date(entry.createdAt)}</small></span></div>)}</div></article>; })}</div>
      <div className="registration-bottom-actions"><Link className="btn btn-primary" href="/inscricoes/nova"><Plus size={15} /> Nova inscrição</Link><Link className="text-link" href="/campeonatos">Voltar para competições <ArrowRight size={14} /></Link></div>
    </>}
  </div>;
}
