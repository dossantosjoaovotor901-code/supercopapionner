import { CheckCircle2, ExternalLink, FileSearch, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { Championship, RegistrationStatus } from "../../../shared/championship";
import { registrationStatusLabels } from "../../../shared/championship";

const date = (value: string) => {
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: value.length > 10 ? "short" : undefined }).format(parsed);
};
const statusClass = (status: RegistrationStatus) => `adm-registration-status status-${status.replaceAll("_", "-")}`;

export default function AdminRegistrations({ state, onRefresh }: { state: Championship; onRefresh: () => void }) {
  const review = trpc.tournament.reviewRegistration.useMutation({ onSuccess: () => { toast.success("Inscrição atualizada."); onRefresh(); }, onError: error => toast.error(error.message) });
  const registrations = state.registrations ?? [];
  const payments = state.payments ?? [];
  const pending = registrations.filter(item => ["proof_submitted", "under_review"].includes(item.status)).length;
  const confirmed = registrations.filter(item => item.status === "confirmed").length;
  const run = (registrationId: string, action: "review" | "approve" | "reject" | "request_proof") => {
    const note = window.prompt(action === "approve" ? "Observação opcional para a aprovação:" : "Informe a observação desta decisão:", "") ?? "";
    if (action !== "approve" && !note.trim()) return;
    review.mutate({ registrationId, action, note });
  };
  return <div className="adm-stack">
    <div className="adm-section-header"><div><span className="adm-eyebrow">OPERAÇÃO FINANCEIRA</span><h2>Inscrições e pagamentos</h2><p>Confira equipes, comprovantes e histórico antes de confirmar uma vaga.</p></div></div>
    <div className="adm-stat-grid adm-registration-stats"><div className="adm-stat-card"><span className="adm-stat-icon"><FileSearch size={17} /></span><strong className="adm-stat-value">{registrations.length}</strong><span className="adm-stat-label">Inscrições recebidas</span></div><div className="adm-stat-card"><span className="adm-stat-icon"><RotateCcw size={17} /></span><strong className="adm-stat-value">{pending}</strong><span className="adm-stat-label">Aguardando análise</span></div><div className="adm-stat-card"><span className="adm-stat-icon"><CheckCircle2 size={17} /></span><strong className="adm-stat-value">{confirmed}</strong><span className="adm-stat-label">Equipes confirmadas</span></div><div className="adm-stat-card"><span className="adm-stat-icon"><ExternalLink size={17} /></span><strong className="adm-stat-value">{payments.filter(item => item.proofUrl).length}</strong><span className="adm-stat-label">Comprovantes enviados</span></div></div>
    <section className="adm-panel adm-registration-panel"><div className="adm-panel-heading"><div><span className="adm-eyebrow">FILA DE CONFERÊNCIA</span><h3>Solicitações mais recentes</h3></div><span className="adm-revision">Aprovação manual</span></div><div className="adm-table-wrap"><table className="adm-table adm-registration-table"><thead><tr><th>Inscrição</th><th>Equipe / capitão</th><th>Elenco</th><th>Status</th><th>Comprovante</th><th>Ações</th></tr></thead><tbody>{registrations.slice().reverse().map(registration => { const payment = payments.find(item => item.registrationId === registration.id); return <tr key={registration.id}><td><strong>{registration.code}</strong><span className="adm-cell-sub">{date(registration.createdAt)}</span></td><td><strong>{registration.teamName}</strong><span className="adm-cell-sub">{registration.captainName} · {registration.captainDiscord || "Discord não informado"}</span></td><td>{registration.players.length} jogadores<span className="adm-cell-sub">{registration.shortName}</span></td><td><span className={statusClass(registration.status)}>{registrationStatusLabels[registration.status]}</span>{registration.notes && <span className="adm-cell-sub">{registration.notes}</span>}</td><td>{payment?.proofUrl ? <a className="adm-cell-link" href={payment.proofUrl} target="_blank" rel="noreferrer">Abrir arquivo <ExternalLink size={12} /></a> : <span className="adm-muted">Não enviado</span>}</td><td><div className="adm-match-actions">{registration.status !== "confirmed" && registration.status !== "cancelled" && <><button className="adm-btn adm-btn-primary" onClick={() => run(registration.id, "approve")} disabled={review.isPending}><CheckCircle2 size={14} /> Aprovar</button><button className="adm-btn" onClick={() => run(registration.id, "request_proof")} disabled={review.isPending}>Pedir novo</button><button className="adm-btn adm-btn-danger" onClick={() => run(registration.id, "reject")} disabled={review.isPending}><XCircle size={14} /> Recusar</button></>}</div></td></tr>; })}{!registrations.length && <tr><td colSpan={6}><div className="adm-empty"><FileSearch size={24} /><strong>Nenhuma inscrição ainda.</strong><span>As novas solicitações aparecerão aqui após o envio do formulário.</span></div></td></tr>}</tbody></table></div></section>
  </div>;
}
