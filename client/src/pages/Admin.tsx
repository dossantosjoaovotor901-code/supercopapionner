import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type {
  Announcement,
  Championship,
  ChampionshipSnapshot,
  CompetitionType,
  Match,
  MatchStatus,
  Phase,
  PhaseKind,
  Player,
  Team,
} from "@shared/championship";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Download,
  GitBranch,
  LayoutDashboard,
  Link2,
  Loader2,
  LogIn,
  MapPin,
  Megaphone,
  Pencil,
  Plus,
  ReceiptText,
  Save,
  Settings2,
  ShieldAlert,
  Trash2,
  Trophy,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import "@/admin.css";
import "@/admin-registration.css";
import AdminRegistrations from "./AdminRegistrations";
import CompetitionsAdmin from "./CompetitionsAdmin";
import "./competition-admin.css";

type TabId =
  | "overview"
  | "teams"
  | "players"
  | "matches"
  | "phases"
  | "announcements"
  | "competitions"
  | "settings";
type Entity = "team" | "player" | "match" | "phase" | "announcement" | "config";
type EditorValue =
  | Team
  | Player
  | Match
  | Phase
  | Announcement
  | Championship["config"];

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "teams", label: "Equipes", icon: Users },
  { id: "players", label: "Jogadores", icon: UserRound },
  { id: "matches", label: "Partidas", icon: CalendarDays },
  { id: "phases", label: "Fases", icon: GitBranch },
  { id: "announcements", label: "Avisos", icon: Megaphone },
  { id: "competitions", label: "Competições", icon: CalendarDays },
  { id: "settings", label: "Configurações", icon: Settings2 },
];

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const idFor = (prefix: string) =>
  `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const teamBlank = (): Team => ({
  id: idFor("team"),
  name: "",
  shortName: "",
  color: "#2563eb",
  group: "",
  city: "",
  logoUrl: "",
});
const playerBlank = (teamId = ""): Player => ({
  id: idFor("player"),
  teamId,
  name: "",
  nickname: "",
  number: 1,
  position: "",
  goals: 0,
  assists: 0,
});
const phaseBlank = (phases: Phase[] = []): Phase => ({
  id: idFor("phase"),
  name: "",
  kind: "group",
  order: Math.max(0, ...phases.map(phase => phase.order)) + 1,
});
const matchBlank = (phaseId = ""): Match => ({
  id: idFor("match"),
  phaseId,
  homeId: null,
  awayId: null,
  scheduledAt: new Date().toISOString(),
  deadline: new Date().toISOString().slice(0, 10),
  venue: "",
  status: "scheduled",
  homeScore: 0,
  awayScore: 0,
  homePenalties: null,
  awayPenalties: null,
  minute: 0,
  nextMatchId: null,
  nextSlot: null,
  winnerId: null,
  notes: "",
  streamUrl: "",
  replayUrl: "",
  replayName: "",
});
const announcementBlank = (): Announcement => ({
  id: idFor("announcement"),
  title: "",
  text: "",
  date: new Date().toISOString().slice(0, 10),
});

const localDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
};
const isoDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
};
const dateLabel = (value: string, time = false) => {
  const date = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(time ? { timeStyle: "short" } : {}),
  }).format(date);
};
const errorText = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "Não foi possível concluir esta ação.";
  if (/revision|conflict/i.test(message))
    return "Os dados foram alterados por outra pessoa. Atualize o painel e tente novamente.";
  if (/forbidden|permission/i.test(message))
    return "Sua conta não tem permissão para esta operação.";
  return message || "Não foi possível concluir esta ação.";
};

function Field({
  label,
  children,
  hint,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <label className={`adm-field${wide ? " adm-field-wide" : ""}`}>
      <span className="adm-field-label">{label}</span>
      {children}
      {hint ? <span className="adm-field-hint">{hint}</span> : null}
    </label>
  );
}
function Button({
  children,
  onClick,
  type = "button",
  variant = "secondary",
  disabled = false,
  form,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  form?: string;
}) {
  return (
    <button
      type={type}
      form={form}
      onClick={onClick}
      disabled={disabled}
      className={`adm-btn adm-btn-${variant}`}
    >
      {children}
    </button>
  );
}
function SaveButton({
  saving,
  label = "Salvar",
  form,
}: {
  saving: boolean;
  label?: string;
  form?: string;
}) {
  return (
    <Button type="submit" form={form} variant="primary" disabled={saving}>
      {saving ? <Loader2 className="adm-spin" size={16} /> : <Save size={16} />}
      {saving ? "Salvando…" : label}
    </Button>
  );
}
function FormDialog({
  title,
  description,
  wide = false,
  onClose,
  children,
  footer,
}: {
  title: string;
  description: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent
        className={`adm-dialog-content${wide ? " adm-dialog-wide" : ""}`}
      >
        <DialogHeader className="adm-dialog-header">
          <DialogTitle className="adm-dialog-title">{title}</DialogTitle>
          <DialogDescription className="adm-dialog-description">
            {description}
          </DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter className="adm-dialog-footer">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogoUpload({
  value,
  onChange,
  onUpload,
  uploading,
}: {
  value: string;
  onChange: (value: string) => void;
  onUpload: (file: File) => Promise<string>;
  uploading: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const selectFile = async (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage("Use PNG, JPEG ou WebP.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setMessage("A imagem deve ter no máximo 1 MB.");
      return;
    }
    setMessage("");
    try {
      onChange(await onUpload(file));
    } catch (error) {
      setMessage(errorText(error));
    }
  };
  return (
    <div className="adm-logo-field">
      <div className="adm-logo-preview">
        {value ? <img src={value} alt="Logo" /> : <Trophy size={24} />}
      </div>
      <div className="adm-logo-actions">
        <input
          ref={input}
          className="adm-file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={event => void selectFile(event.target.files?.[0])}
        />
        <Button disabled={uploading} onClick={() => input.current?.click()}>
          {uploading ? (
            <Loader2 className="adm-spin" size={16} />
          ) : (
            <Upload size={16} />
          )}
          {uploading ? "Enviando…" : "Enviar imagem"}
        </Button>
        <span className="adm-field-hint">PNG, JPEG ou WebP · máximo 1 MB</span>
        {message ? <span className="adm-form-error">{message}</span> : null}
      </div>
    </div>
  );
}

function ReplayUpload({
  status,
  value,
  name,
  onUpload,
  onClear,
  uploading,
}: {
  status: MatchStatus;
  value: string;
  name: string;
  onUpload: (file: File) => Promise<{ url: string; name: string }>;
  onClear: () => void;
  uploading: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const selectFile = async (file?: File) => {
    if (!file) return;
    if (status !== "finished") {
      setMessage(
        "O replay só pode ser anexado depois que a partida for encerrada."
      );
      return;
    }
    if (
      !file.type.startsWith("video/") &&
      file.type !== "application/octet-stream"
    ) {
      setMessage("Selecione um vídeo MP4, WebM, MOV ou AVI.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setMessage("O replay deve ter no máximo 30 MB.");
      return;
    }
    setMessage("");
    try {
      await onUpload(file);
    } catch (error) {
      setMessage(errorText(error));
    }
  };
  return (
    <div className="adm-replay-upload">
      <div className="adm-replay-copy">
        <strong>{value ? "Replay anexado" : "Anexar replay da partida"}</strong>
        <span>
          {value
            ? name || "Arquivo de replay disponível"
            : status === "finished"
              ? "Vídeo para o público assistir no detalhe do jogo."
              : "Disponível somente para partidas com status Encerrado."}
        </span>
      </div>
      <div className="adm-replay-actions">
        <input
          ref={input}
          className="adm-file-input"
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,application/octet-stream"
          onChange={event => void selectFile(event.target.files?.[0])}
        />
        <Button
          disabled={uploading || status !== "finished"}
          onClick={() => input.current?.click()}
        >
          {uploading ? (
            <Loader2 className="adm-spin" size={16} />
          ) : (
            <Upload size={16} />
          )}
          {uploading
            ? "Enviando…"
            : value
              ? "Trocar replay"
              : "Selecionar vídeo"}
        </Button>
        {value ? (
          <Button onClick={onClear} variant="danger">
            Remover
          </Button>
        ) : null}
      </div>
      <span className="adm-field-hint">
        MP4, WebM, MOV ou AVI · máximo 30 MB
      </span>
      {message ? <span className="adm-form-error">{message}</span> : null}
    </div>
  );
}

function EditorDialog({
  kind,
  initial,
  state,
  saving,
  serverError,
  uploading,
  replayUploading,
  onUpload,
  onReplayUpload,
  onSave,
  onClose,
  focusScore = false,
}: {
  kind: Entity;
  initial: EditorValue;
  state: Championship;
  saving: boolean;
  serverError: string;
  uploading: boolean;
  replayUploading: boolean;
  onUpload: (file: File) => Promise<string>;
  onReplayUpload: (
    matchId: string,
    file: File
  ) => Promise<{ url: string; name: string }>;
  onSave: (value: EditorValue) => Promise<boolean>;
  onClose: () => void;
  focusScore?: boolean;
}) {
  const normalized = (() => {
    if (kind === "match") {
      const item = initial as Match;
      return {
        ...item,
        scheduledAt: localDateTime(item.scheduledAt),
        deadline: item.deadline || item.scheduledAt.slice(0, 10),
        homePenalties:
          item.homePenalties === null ? "" : String(item.homePenalties),
        awayPenalties:
          item.awayPenalties === null ? "" : String(item.awayPenalties),
      };
    }
    if (kind === "config") {
      const item = initial as Championship["config"];
      return {
        ...item,
        startDate: item.startDate.slice(0, 10),
        endDate: item.endDate.slice(0, 10),
      };
    }
    return { ...initial };
  })();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(normalized).map(([key, value]) => [
        key,
        value === null || value === undefined ? "" : String(value),
      ])
    )
  );
  const scoreSectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusScore || kind !== "match") return;
    const timer = window.setTimeout(() => {
      scoreSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusScore, kind]);
  const [formError, setFormError] = useState("");
  const [scoreEdited, setScoreEdited] = useState(false);
  const set = (key: string, value: string) =>
    setValues(current => ({ ...current, [key]: value }));
  const number = (key: string, fallback = 0) =>
    Math.max(0, Number(values[key]) || fallback);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      kind === "team" &&
      (!values.name?.trim() || !values.shortName?.trim())
    ) {
      setFormError("Nome e nome curto são obrigatórios.");
      return;
    }
    if (kind === "player" && (!values.name?.trim() || !values.teamId)) {
      setFormError("Nome e equipe são obrigatórios.");
      return;
    }
    if (kind === "phase" && !values.name?.trim()) {
      setFormError("O nome da fase é obrigatório.");
      return;
    }
    if (
      kind === "announcement" &&
      (!values.title?.trim() || !values.text?.trim() || !values.date)
    ) {
      setFormError("Título, texto e data são obrigatórios.");
      return;
    }
    if (kind === "config" && !values.name?.trim()) {
      setFormError("O nome do campeonato é obrigatório.");
      return;
    }
    if (kind === "match" && (!values.phaseId || !values.scheduledAt)) {
      setFormError("Fase e data da partida são obrigatórias.");
      return;
    }
    if (kind === "match" && values.homeId && values.homeId === values.awayId) {
      setFormError("A equipe da casa e a visitante devem ser diferentes.");
      return;
    }
    setFormError("");
    let result: EditorValue;
    if (kind === "team")
      result = {
        id: values.id,
        name: values.name.trim(),
        shortName: values.shortName.trim(),
        color: values.color || "#2563eb",
        group: values.group || "",
        city: values.city || "",
        logoUrl: values.logoUrl || "",
      } as Team;
    else if (kind === "player")
      result = {
        id: values.id,
        teamId: values.teamId,
        name: values.name.trim(),
        nickname: values.nickname || "",
        number: number("number"),
        position: values.position || "",
        goals: number("goals"),
        assists: number("assists"),
      } as Player;
    else if (kind === "phase")
      result = {
        id: values.id,
        name: values.name.trim(),
        kind: (values.kind || "group") as PhaseKind,
        order: number("order", 1),
      } as Phase;
    else if (kind === "announcement")
      result = {
        id: values.id,
        title: values.title.trim(),
        text: values.text.trim(),
        date: values.date,
      } as Announcement;
    else if (kind === "config")
      result = {
        name: values.name.trim(),
        edition: values.edition || "",
        subtitle: values.subtitle || "",
        logoUrl: values.logoUrl || "",
        currentPhaseId: values.currentPhaseId || "",
        startDate: values.startDate || "",
        endDate: values.endDate || "",
        venue: values.venue || "",
        demo: values.demo === "true",
        rules: values.rules || "",
        competitionType: (values.competitionType || "cup") as CompetitionType,
        modality: values.modality || "X5",
        entryFee: number("entryFee"),
        prize: values.prize || "A definir",
        maxTeams: number("maxTeams", 16),
        registrationDeadline: values.registrationDeadline || values.endDate,
        paymentDeadline: values.paymentDeadline || "",
        pixKey: values.pixKey || "",
        pixReceiver: values.pixReceiver || "",
      } as Championship["config"];
    else {
      const original = initial as Match;
      result = {
        id: values.id,
        phaseId: values.phaseId,
        homeId: values.homeId || null,
        awayId: values.awayId || null,
        homeSeed: original.homeSeed,
        awaySeed: original.awaySeed,
        scheduledAt: isoDateTime(values.scheduledAt),
        deadline: values.deadline || "",
        venue: values.venue || "",
        status: (
          values.status === "scheduled" && scoreEdited
            ? "finished"
            : values.status || "scheduled"
        ) as MatchStatus,
        homeScore: number("homeScore"),
        awayScore: number("awayScore"),
        homePenalties:
          values.homePenalties === "" ? null : number("homePenalties"),
        awayPenalties:
          values.awayPenalties === "" ? null : number("awayPenalties"),
        minute: number("minute"),
        nextMatchId: original.nextMatchId,
        nextSlot: original.nextSlot,
        winnerId: null,
        notes: values.notes || "",
        streamUrl: values.streamUrl || "",
        replayUrl: values.replayUrl || "",
        replayName: values.replayName || "",
      } as Match;
    }
    if (await onSave(result)) onClose();
  };
  const teamOptions = (
    <>
      <option value="">Sem equipe definida</option>
      {state.teams.map(team => (
        <option value={team.id} key={team.id}>
          {team.name}
        </option>
      ))}
    </>
  );
  const phaseOptions = (
    <>
      <option value="">Selecione uma fase</option>
      {state.phases.map(phase => (
        <option value={phase.id} key={phase.id}>
          {phase.name}
        </option>
      ))}
    </>
  );
  const title =
    kind === "config"
      ? "Configurações do campeonato"
      : kind === "team"
        ? values.name
          ? "Editar equipe"
          : "Nova equipe"
        : kind === "player"
          ? values.name
            ? "Editar jogador"
            : "Novo jogador"
          : kind === "phase"
            ? values.name
              ? "Editar fase"
              : "Nova fase"
            : kind === "match"
              ? values.venue || values.homeId
                ? "Editar partida"
                : "Nova partida"
              : values.title
                ? "Editar aviso"
                : "Novo aviso";
  const description =
    kind === "config"
      ? "Defina identidade, período, regras e informações oficiais."
      : kind === "match"
        ? "Configure confronto, resultado, transmissão e o encaixe da próxima fase."
        : "Preencha os campos oficiais do campeonato.";
  return (
    <FormDialog
      title={title}
      description={description}
      wide={kind === "match" || kind === "config"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <SaveButton
            form="adm-editor-form"
            saving={saving || uploading}
            label={kind === "config" ? "Salvar configurações" : "Salvar"}
          />
        </>
      }
    >
      <form id="adm-editor-form" className="adm-form" onSubmit={submit}>
        {kind === "team" ? (
          <>
            <div className="adm-form-grid">
              <Field label="Nome da equipe">
                <Input
                  required
                  value={values.name}
                  onChange={event => set("name", event.target.value)}
                  placeholder="Ex.: Estrela Azul"
                />
              </Field>
              <Field label="Nome curto">
                <Input
                  required
                  maxLength={8}
                  value={values.shortName}
                  onChange={event => set("shortName", event.target.value)}
                  placeholder="EAZ"
                />
              </Field>
              <Field label="Cidade">
                <Input
                  value={values.city}
                  onChange={event => set("city", event.target.value)}
                />
              </Field>
              <Field label="Grupo">
                <Input
                  value={values.group}
                  onChange={event => set("group", event.target.value)}
                  placeholder="Grupo A"
                />
              </Field>
              <Field label="Cor principal">
                <input
                  className="adm-color-input"
                  type="color"
                  value={values.color || "#2563eb"}
                  onChange={event => set("color", event.target.value)}
                />
              </Field>
              <Field label="URL do logo">
                <Input
                  value={values.logoUrl}
                  onChange={event => set("logoUrl", event.target.value)}
                  placeholder="https://…"
                />
              </Field>
            </div>
            <div className="adm-form-section">
              <span className="adm-section-kicker">Escudo</span>
              <LogoUpload
                value={values.logoUrl}
                onChange={value => set("logoUrl", value)}
                onUpload={onUpload}
                uploading={uploading}
              />
            </div>
          </>
        ) : null}
        {kind === "player" ? (
          <div className="adm-form-grid">
            <Field label="Nome completo">
              <Input
                required
                value={values.name}
                onChange={event => set("name", event.target.value)}
              />
            </Field>
            <Field label="Apelido">
              <Input
                value={values.nickname}
                onChange={event => set("nickname", event.target.value)}
              />
            </Field>
            <Field label="Equipe">
              <select
                className="adm-select"
                required
                value={values.teamId}
                onChange={event => set("teamId", event.target.value)}
              >
                {teamOptions}
              </select>
            </Field>
            <Field label="Número">
              <Input
                type="number"
                min={0}
                max={99}
                value={values.number}
                onChange={event => set("number", event.target.value)}
              />
            </Field>
            <Field label="Posição">
              <Input
                value={values.position}
                onChange={event => set("position", event.target.value)}
                placeholder="Atacante"
              />
            </Field>
            <Field label="Gols">
              <Input
                type="number"
                min={0}
                value={values.goals}
                onChange={event => set("goals", event.target.value)}
              />
            </Field>
            <Field label="Assistências">
              <Input
                type="number"
                min={0}
                value={values.assists}
                onChange={event => set("assists", event.target.value)}
              />
            </Field>
          </div>
        ) : null}
        {kind === "phase" ? (
          <div className="adm-form-grid">
            <Field label="Nome da fase">
              <Input
                required
                value={values.name}
                onChange={event => set("name", event.target.value)}
                placeholder="Fase de grupos"
              />
            </Field>
            <Field label="Tipo">
              <select
                className="adm-select"
                value={values.kind}
                onChange={event => set("kind", event.target.value)}
              >
                <option value="group">Grupos</option>
                <option value="knockout">Mata-mata</option>
              </select>
            </Field>
            <Field label="Ordem">
              <Input
                type="number"
                min={1}
                value={values.order}
                onChange={event => set("order", event.target.value)}
              />
            </Field>
          </div>
        ) : null}
        {kind === "announcement" ? (
          <div className="adm-form-grid">
            <Field label="Título">
              <Input
                required
                value={values.title}
                onChange={event => set("title", event.target.value)}
              />
            </Field>
            <Field label="Data">
              <Input
                type="date"
                required
                value={values.date?.slice(0, 10)}
                onChange={event => set("date", event.target.value)}
              />
            </Field>
            <Field label="Texto" wide>
              <Textarea
                rows={7}
                required
                value={values.text}
                onChange={event => set("text", event.target.value)}
              />
            </Field>
          </div>
        ) : null}
        {kind === "match" ? (
          <>
            <div className="adm-form-section">
              <span className="adm-section-kicker">Confronto</span>
              <div className="adm-form-grid">
                <Field label="Fase">
                  <select
                    className="adm-select"
                    required
                    value={values.phaseId}
                    onChange={event => set("phaseId", event.target.value)}
                  >
                    {phaseOptions}
                  </select>
                </Field>
                <Field label="Data e hora local">
                  <Input
                    type="datetime-local"
                    required
                    value={values.scheduledAt}
                    onChange={event => set("scheduledAt", event.target.value)}
                  />
                  <span className="adm-field-hint">
                    Convertido para ISO usando o fuso local do navegador.
                  </span>
                </Field>
                <Field label="Prazo para jogar até">
                  <Input
                    type="date"
                    value={values.deadline}
                    onChange={event => set("deadline", event.target.value)}
                  />
                  <span className="adm-field-hint">
                    Data limite para as equipes realizarem o confronto.
                  </span>
                </Field>
                <Field label="Equipe da casa">
                  <select
                    className="adm-select"
                    value={values.homeId}
                    onChange={event => set("homeId", event.target.value)}
                  >
                    {teamOptions}
                  </select>
                </Field>
                <Field label="Equipe visitante">
                  <select
                    className="adm-select"
                    value={values.awayId}
                    onChange={event => set("awayId", event.target.value)}
                  >
                    {teamOptions}
                  </select>
                </Field>
                <Field label="Local">
                  <Input
                    value={values.venue}
                    onChange={event => set("venue", event.target.value)}
                  />
                </Field>
                <Field label="Status">
                  <select
                    className="adm-select"
                    value={values.status}
                    onChange={event => set("status", event.target.value)}
                  >
                    <option value="scheduled">Agendado</option>
                    <option value="live">Ao vivo</option>
                    <option value="finished">Encerrado</option>
                  </select>
                </Field>
              </div>
            </div>
            <div
              ref={scoreSectionRef}
              className="adm-form-section adm-score-editor-section"
            >
              <span className="adm-section-kicker">Placar</span>
              <div className="adm-form-grid adm-form-grid-compact">
                <Field label="Gols casa">
                  <Input
                    type="number"
                    min={0}
                    value={values.homeScore}
                    onChange={event => {
                      setScoreEdited(true);
                      set("homeScore", event.target.value);
                    }}
                  />
                </Field>
                <Field label="Gols visitante">
                  <Input
                    type="number"
                    min={0}
                    value={values.awayScore}
                    onChange={event => {
                      setScoreEdited(true);
                      set("awayScore", event.target.value);
                    }}
                  />
                </Field>
                <Field label="Pênaltis casa">
                  <Input
                    type="number"
                    min={0}
                    value={values.homePenalties}
                    onChange={event => set("homePenalties", event.target.value)}
                  />
                </Field>
                <Field label="Pênaltis visitante">
                  <Input
                    type="number"
                    min={0}
                    value={values.awayPenalties}
                    onChange={event => set("awayPenalties", event.target.value)}
                  />
                </Field>
                <Field label="Minuto">
                  <Input
                    type="number"
                    min={0}
                    value={values.minute}
                    onChange={event => set("minute", event.target.value)}
                  />
                </Field>
              </div>
              <p className="adm-inline-note">
                <CheckCircle2 size={15} /> Ao salvar um placar editado, a
                partida é encerrada e o vencedor avança automaticamente. Para
                atualizar uma partida em andamento, selecione Ao vivo.
              </p>
            </div>
            <div className="adm-form-section">
              <span className="adm-section-kicker">
                Transmissão e replay
              </span>
              <div className="adm-form-grid">
                <Field label="Link da transmissão">
                  <Input
                    type="url"
                    value={values.streamUrl}
                    onChange={event => set("streamUrl", event.target.value)}
                    placeholder="https://…"
                  />
                </Field>
                <Field label="Replay da partida" wide>
                  <ReplayUpload
                    status={(values.status || "scheduled") as MatchStatus}
                    value={values.replayUrl || ""}
                    name={values.replayName || ""}
                    uploading={replayUploading}
                    onClear={() => {
                      set("replayUrl", "");
                      set("replayName", "");
                    }}
                    onUpload={async file => {
                      const result = await onReplayUpload(values.id, file);
                      set("replayUrl", result.url);
                      set("replayName", result.name);
                      return result;
                    }}
                  />
                </Field>
                <Field label="Observações" wide>
                  <Textarea
                    value={values.notes}
                    onChange={event => set("notes", event.target.value)}
                  />
                </Field>
              </div>
            </div>
          </>
        ) : null}
        {kind === "config" ? (
          <>
            <div className="adm-form-section">
              <span className="adm-section-kicker">
                Identidade e calendário
              </span>
              <div className="adm-form-grid">
                <Field label="Nome do campeonato">
                  <Input
                    required
                    value={values.name}
                    onChange={event => set("name", event.target.value)}
                  />
                </Field>
                <Field label="Edição">
                  <Input
                    value={values.edition}
                    onChange={event => set("edition", event.target.value)}
                  />
                </Field>
                <Field label="Subtítulo" wide>
                  <Input
                    value={values.subtitle}
                    onChange={event => set("subtitle", event.target.value)}
                  />
                </Field>
                <Field label="Local principal">
                  <Input
                    value={values.venue}
                    onChange={event => set("venue", event.target.value)}
                  />
                </Field>
                <Field label="Fase atual">
                  <select
                    className="adm-select"
                    value={values.currentPhaseId}
                    onChange={event =>
                      set("currentPhaseId", event.target.value)
                    }
                  >
                    <option value="">Nenhuma</option>
                    {state.phases.map(phase => (
                      <option value={phase.id} key={phase.id}>
                        {phase.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Início">
                  <Input
                    type="date"
                    value={values.startDate}
                    onChange={event => set("startDate", event.target.value)}
                  />
                </Field>
                <Field label="Fim">
                  <Input
                    type="date"
                    value={values.endDate}
                    onChange={event => set("endDate", event.target.value)}
                  />
                </Field>
                <label className="adm-check-field">
                  <input
                    type="checkbox"
                    checked={values.demo === "true"}
                    onChange={event =>
                      set("demo", String(event.target.checked))
                    }
                  />
                  <span>
                    <strong>Modo demonstração</strong>
                    <small>Marca que a competição está em preparação.</small>
                  </span>
                </label>
              </div>
            </div>
            <div className="adm-form-section">
              <span className="adm-section-kicker">Inscrições e financeiro</span>
              <div className="adm-form-grid">
                <Field label="Tipo de competição">
                  <select className="adm-select" value={values.competitionType || "cup"} onChange={event => set("competitionType", event.target.value)}>
                    <option value="cup">Copa</option>
                    <option value="league">Liga</option>
                  </select>
                </Field>
                <Field label="Modalidade">
                  <Input value={values.modality || "X5"} onChange={event => set("modality", event.target.value)} placeholder="X5" />
                </Field>
                <Field label="Taxa de inscrição (R$)">
                  <Input type="number" min="0" step="0.01" value={values.entryFee || "0"} onChange={event => set("entryFee", event.target.value)} />
                </Field>
                <Field label="Limite de equipes">
                  <Input type="number" min="0" value={values.maxTeams || "16"} onChange={event => set("maxTeams", event.target.value)} />
                </Field>
                <Field label="Premiação" wide>
                  <Input value={values.prize || ""} onChange={event => set("prize", event.target.value)} placeholder="Ex.: R$ 250 + troféu" />
                </Field>
                <Field label="Inscrições até">
                  <Input type="date" value={values.registrationDeadline || ""} onChange={event => set("registrationDeadline", event.target.value)} />
                </Field>
                <div className="adm-field payment-deadline-field">
                  <label className="payment-deadline-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(values.paymentDeadline)}
                      onChange={event =>
                        set(
                          "paymentDeadline",
                          event.target.checked
                            ? values.registrationDeadline || values.endDate || ""
                            : ""
                        )
                      }
                    />
                    <span>Definir prazo de pagamento</span>
                  </label>
                  {values.paymentDeadline && (
                    <Input
                      aria-label="Pagamento até"
                      type="date"
                      value={values.paymentDeadline}
                      onChange={event =>
                        set("paymentDeadline", event.target.value)
                      }
                    />
                  )}
                  {!values.paymentDeadline && (
                    <small>Sem prazo de pagamento definido.</small>
                  )}
                </div>
                <Field label="Chave Pix">
                  <Input value={values.pixKey || ""} onChange={event => set("pixKey", event.target.value)} placeholder="CPF, e-mail ou chave aleatória" />
                </Field>
                <Field label="Recebedor do Pix">
                  <Input value={values.pixReceiver || ""} onChange={event => set("pixReceiver", event.target.value)} placeholder="Nome do recebedor" />
                </Field>
              </div>
            </div>
            <div className="adm-form-section">
              <span className="adm-section-kicker">Logo oficial</span>
              <LogoUpload
                value={values.logoUrl}
                onChange={value => set("logoUrl", value)}
                onUpload={onUpload}
                uploading={uploading}
              />
            </div>
            <div className="adm-form-section">
              <span className="adm-section-kicker">Regulamento</span>
              <Field label="Regras públicas" wide>
                <Textarea
                  rows={9}
                  value={values.rules}
                  onChange={event => set("rules", event.target.value)}
                  placeholder="Escreva o regulamento oficial."
                />
              </Field>
            </div>
          </>
        ) : null}
        {formError ? <p className="adm-form-error">{formError}</p> : null}
        {serverError ? (
          <p className="adm-form-error" role="alert">
            {serverError}
          </p>
        ) : null}
      </form>
    </FormDialog>
  );
}

function Empty({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="adm-empty">
      <div className="adm-empty-icon">
        <Icon size={22} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Header({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="adm-section-header">
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}
function Actions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="adm-row-actions">
      <button
        className="adm-icon-btn"
        title="Editar"
        aria-label="Editar"
        onClick={onEdit}
      >
        <Pencil size={15} />
      </button>
      <button
        className="adm-icon-btn adm-icon-danger"
        title="Excluir"
        aria-label="Excluir"
        onClick={onDelete}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function Overview({
  state,
  onTab,
  onExport,
}: {
  state: Championship;
  onTab: (tab: TabId) => void;
  onExport: () => void;
}) {
  const cards: {
    label: string;
    value: number;
    tab: TabId;
    icon: LucideIcon;
  }[] = [
    { label: "Equipes", value: state.teams.length, tab: "teams", icon: Users },
    {
      label: "Jogadores",
      value: state.players.length,
      tab: "players",
      icon: UserRound,
    },
    {
      label: "Partidas",
      value: state.matches.length,
      tab: "matches",
      icon: CalendarDays,
    },
    {
      label: "Avisos",
      value: state.announcements.length,
      tab: "announcements",
      icon: Megaphone,
    },
  ];
  return (
    <div className="adm-stack">
      <div className="adm-welcome">
        <div>
          <span className="adm-eyebrow">
            <Trophy size={14} /> Centro de operação
          </span>
          <h2>Visão geral do torneio</h2>
          <p>Gerencie o campeonato com dados oficiais e revisão controlada.</p>
        </div>
        <Button onClick={onExport}>
          <Download size={16} /> Exportar JSON
        </Button>
      </div>
      <div className="adm-stat-grid">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <button
              className="adm-stat-card"
              key={card.tab}
              onClick={() => onTab(card.tab)}
            >
              <span className="adm-stat-icon">
                <Icon size={19} />
              </span>
              <span className="adm-stat-value">{card.value}</span>
              <span className="adm-stat-label">{card.label}</span>
              <span className="adm-stat-link">
                Abrir seção <span>→</span>
              </span>
            </button>
          );
        })}
      </div>
      <section className="adm-control-panel">
        <div className="adm-control-heading">
          <div>
            <span className="adm-section-kicker">Operação completa</span>
            <h3>Controle total do campeonato</h3>
            <p>
              Acesse rapidamente cada cadastro e mantenha placares, elencos,
              chaveamento e comunicação oficiais em dia.
            </p>
          </div>
          <Settings2 size={22} aria-hidden="true" />
        </div>
        <div className="adm-control-grid">
          {(
            [
              {
                tab: "matches",
                label: "Partidas e placares",
                text: "Agenda, resultados e encaixes da próxima fase.",
                icon: CalendarDays,
              },
              {
                tab: "teams",
                label: "Equipes e elencos",
                text: "Times, escudos, grupos e seus atletas.",
                icon: Users,
              },
              {
                tab: "players",
                label: "Jogadores e estatísticas",
                text: "Cadastros, camisas, gols e assistências.",
                icon: UserRound,
              },
              {
                tab: "phases",
                label: "Fases e chaveamento",
                text: "Ordem da competição e partidas conectadas.",
                icon: GitBranch,
              },
              {
                tab: "announcements",
                label: "Avisos",
                text: "Publicações oficiais para equipes e torcida.",
                icon: Megaphone,
              },
              {
                tab: "settings",
                label: "Configurações",
                text: "Identidade, regras, calendário e logo.",
                icon: Settings2,
              },
            ] satisfies {
              tab: Exclude<TabId, "overview">;
              label: string;
              text: string;
              icon: LucideIcon;
            }[]
          ).map(shortcut => {
            const Icon = shortcut.icon;
            return (
              <button
                className="adm-control-shortcut"
                key={shortcut.tab}
                onClick={() => onTab(shortcut.tab)}
              >
                <span className="adm-control-icon">
                  <Icon size={18} />
                </span>
                <span>
                  <strong>{shortcut.label}</strong>
                  <small>{shortcut.text}</small>
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>
      <div className="adm-two-column">
        <section className="adm-panel">
          <Header
            title="Próximas partidas"
            text="Agenda operacional"
            action={
              <button
                className="adm-text-link"
                onClick={() => onTab("matches")}
              >
                Ver todas
              </button>
            }
          />
          {state.matches
            .filter(match => match.status !== "finished")
            .slice(0, 4)
            .map(match => (
              <div className="adm-list-row" key={match.id}>
                <div className="adm-list-main">
                  <CalendarDays size={17} />
                  <span>
                    <strong>
                      {teamName(state, match.homeId)} <small>×</small>{" "}
                      {teamName(state, match.awayId)}
                    </strong>
                    <em>
                      {dateLabel(match.scheduledAt, true)} ·{" "}
                      {phaseName(state, match.phaseId)}
                    </em>
                  </span>
                </div>
                <span className={`adm-badge adm-badge-${match.status}`}>
                  {match.status === "live" ? "Ao vivo" : "Agendado"}
                </span>
              </div>
            ))}
          {!state.matches.some(match => match.status !== "finished") ? (
            <p className="adm-muted">Nenhuma partida pendente.</p>
          ) : null}
        </section>
        <section className="adm-panel">
          <Header
            title="Avisos recentes"
            text="Comunicação da organização"
            action={
              <button
                className="adm-text-link"
                onClick={() => onTab("announcements")}
              >
                Gerenciar
              </button>
            }
          />
          {state.announcements
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 4)
            .map(item => (
              <div className="adm-list-row" key={item.id}>
                <div className="adm-list-main">
                  <Megaphone size={17} />
                  <span>
                    <strong>{item.title}</strong>
                    <em>{dateLabel(item.date)}</em>
                  </span>
                </div>
                <ChevronRight size={16} className="adm-muted" />
              </div>
            ))}
          {!state.announcements.length ? (
            <p className="adm-muted">Nenhum aviso publicado.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function teamName(state: Championship, id: string | null) {
  return id
    ? state.teams.find(team => team.id === id)?.shortName ||
        state.teams.find(team => team.id === id)?.name ||
        "Equipe removida"
    : "A definir";
}
function phaseName(state: Championship, id: string) {
  return state.phases.find(phase => phase.id === id)?.name || "Fase removida";
}
function Teams({
  state,
  onCreate,
  onEdit,
  onDelete,
}: {
  state: Championship;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="adm-stack">
      <Header
        title="Equipes"
        text="Identidade, grupo e elenco de cada participante."
        action={
          <Button onClick={onCreate}>
            <Plus size={16} /> Nova equipe
          </Button>
        }
      />
      {state.teams.length ? (
        <div className="adm-panel adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Equipe</th>
                <th>Grupo</th>
                <th>Cidade</th>
                <th>Elenco</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.teams.map(team => (
                <tr key={team.id}>
                  <td>
                    <div className="adm-team-cell">
                      <span
                        className="adm-team-mark"
                        style={{ background: team.color || "#2563eb" }}
                      >
                        {team.logoUrl ? (
                          <img src={team.logoUrl} alt="" />
                        ) : (
                          team.shortName.slice(0, 2)
                        )}
                      </span>
                      <span>
                        <strong>{team.name}</strong>
                        <small>{team.shortName}</small>
                      </span>
                    </div>
                  </td>
                  <td>{team.group || "—"}</td>
                  <td>{team.city || "—"}</td>
                  <td>
                    {
                      state.players.filter(player => player.teamId === team.id)
                        .length
                    }
                  </td>
                  <td>
                    <Actions
                      onEdit={() => onEdit(team.id)}
                      onDelete={() => onDelete(team.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={Users}
          title="Nenhuma equipe cadastrada"
          text="Comece pela equipe que vai disputar o campeonato."
          action={
            <Button onClick={onCreate}>
              <Plus size={16} /> Cadastrar equipe
            </Button>
          }
        />
      )}
    </div>
  );
}

function Players({
  state,
  onCreate,
  onEdit,
  onDelete,
}: {
  state: Championship;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="adm-stack">
      <Header
        title="Jogadores"
        text="Cadastros, números e estatísticas individuais."
        action={
          <Button onClick={onCreate}>
            <Plus size={16} /> Novo jogador
          </Button>
        }
      />
      {state.players.length ? (
        <div className="adm-panel adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Jogador</th>
                <th>Equipe</th>
                <th>Camisa</th>
                <th>Posição</th>
                <th>Gols</th>
                <th>Assist.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.players.map(player => (
                <tr key={player.id}>
                  <td>
                    <strong>{player.name}</strong>
                    {player.nickname ? (
                      <small className="adm-cell-sub">
                        “{player.nickname}”
                      </small>
                    ) : null}
                  </td>
                  <td>
                    {state.teams.find(team => team.id === player.teamId)
                      ?.shortName || "Equipe removida"}
                  </td>
                  <td>
                    <span className="adm-number-badge">{player.number}</span>
                  </td>
                  <td>{player.position || "—"}</td>
                  <td>{player.goals}</td>
                  <td>{player.assists}</td>
                  <td>
                    <Actions
                      onEdit={() => onEdit(player.id)}
                      onDelete={() => onDelete(player.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={UserRound}
          title="Nenhum jogador cadastrado"
          text="Adicione atletas depois de criar as equipes."
          action={
            <Button onClick={onCreate}>
              <Plus size={16} /> Cadastrar jogador
            </Button>
          }
        />
      )}
    </div>
  );
}

function Matches({
  state,
  onEdit,
  onScoreEdit,
  onDelete,
  onAddTeams,
  onGenerate,
  generating,
}: {
  state: Championship;
  onEdit: (id: string) => void;
  onScoreEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAddTeams: () => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <div className="adm-stack">
      <Header
        title="Partidas"
        text="Os jogos e o chaveamento são gerados automaticamente pelas equipes inscritas. Informe os placares para atualizar a competição."
      />
      {state.matches.length ? (
        <div className="adm-panel adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Prazo</th>
                <th>Confronto</th>
                <th>Fase</th>
                <th>Status</th>
                <th>Placar</th>
                <th>Local</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.matches
                .slice()
                .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
                .map(match => (
                  <tr key={match.id}>
                    <td>
                      <strong>{dateLabel(match.scheduledAt)}</strong>
                      <small className="adm-cell-sub">
                        {dateLabel(match.scheduledAt, true).split(", ").pop()}
                      </small>
                    </td>
                    <td>
                      {match.deadline
                        ? dateLabel(match.deadline)
                        : "Não definido"}
                    </td>
                    <td>
                      <strong>
                        {teamName(state, match.homeId)}{" "}
                        <span className="adm-score-separator">×</span>{" "}
                        {teamName(state, match.awayId)}
                      </strong>
                      {match.streamUrl ? (
                        <a
                          className="adm-cell-link"
                          href={match.streamUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Link2 size={13} /> transmissão
                        </a>
                      ) : null}
                      {match.replayUrl ? (
                        <a
                          className="adm-cell-link adm-replay-link"
                          href={match.replayUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download size={13} /> replay
                        </a>
                      ) : null}
                    </td>
                    <td>{phaseName(state, match.phaseId)}</td>
                    <td>
                      <span className={`adm-badge adm-badge-${match.status}`}>
                        {match.status === "live"
                          ? "Ao vivo"
                          : match.status === "finished"
                            ? "Encerrado"
                            : "Agendado"}
                      </span>
                    </td>
                    <td>
                      <strong>
                        {match.homeScore} — {match.awayScore}
                      </strong>
                      {match.homePenalties !== null ||
                      match.awayPenalties !== null ? (
                        <small className="adm-cell-sub">
                          pênaltis {match.homePenalties ?? "—"} —{" "}
                          {match.awayPenalties ?? "—"}
                        </small>
                      ) : null}
                    </td>
                    <td>{match.venue || "—"}</td>
                    <td>
                      <div className="adm-match-actions">
                        <Button
                          onClick={() => onScoreEdit(match.id)}
                          variant="secondary"
                        >
                          <Pencil size={14} /> Editar placar
                        </Button>
                        <Actions
                          onEdit={() => onEdit(match.id)}
                          onDelete={() => onDelete(match.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={CalendarDays}
          title={
            state.teams.length < 2
              ? "Inscreva mais uma equipe para gerar os jogos."
              : "Tudo pronto para gerar a agenda."
          }
          text={
            state.teams.length < 2
              ? "Ao cadastrar pelo menos duas equipes, a fase de grupos e o chaveamento serão montados automaticamente."
              : "Clique no botão para montar os grupos, os confrontos da primeira fase e o chaveamento."
          }
          action={
            state.teams.length < 2 ? (
              <Button onClick={onAddTeams}>
                <Users size={16} /> Cadastrar equipe
              </Button>
            ) : (
              <Button onClick={onGenerate} disabled={generating} variant="primary">
                {generating ? (
                  <Loader2 className="adm-spin" size={16} />
                ) : (
                  <CalendarDays size={16} />
                )}
                {generating ? "Gerando partidas…" : "Gerar partidas"}
              </Button>
            )
          }
        />
      )}
    </div>
  );
}

function Phases({
  state,
  onCreate,
  onEdit,
  onDelete,
}: {
  state: Championship;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="adm-stack">
      <Header
        title="Fases"
        text="Estruture grupos, mata-mata e a ordem da competição."
        action={
          <Button onClick={onCreate}>
            <Plus size={16} /> Nova fase
          </Button>
        }
      />
      {state.phases.length ? (
        <div className="adm-panel adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Ordem</th>
                <th>Fase</th>
                <th>Formato</th>
                <th>Partidas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.phases
                .slice()
                .sort((a, b) => a.order - b.order)
                .map(phase => (
                  <tr key={phase.id}>
                    <td>
                      <span className="adm-order-badge">{phase.order}</span>
                    </td>
                    <td>
                      <strong>{phase.name}</strong>
                      {state.config.currentPhaseId === phase.id ? (
                        <span className="adm-current-label">Fase atual</span>
                      ) : null}
                    </td>
                    <td>
                      <span className="adm-badge adm-badge-neutral">
                        {phase.kind === "group" ? "Grupos" : "Mata-mata"}
                      </span>
                    </td>
                    <td>
                      {
                        state.matches.filter(
                          match => match.phaseId === phase.id
                        ).length
                      }
                    </td>
                    <td>
                      <Actions
                        onEdit={() => onEdit(phase.id)}
                        onDelete={() => onDelete(phase.id)}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={GitBranch}
          title="Nenhuma fase cadastrada"
          text="Defina a primeira fase antes de criar as partidas."
          action={
            <Button onClick={onCreate}>
              <Plus size={16} /> Cadastrar fase
            </Button>
          }
        />
      )}
    </div>
  );
}

function Announcements({
  state,
  onCreate,
  onEdit,
  onDelete,
}: {
  state: Championship;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="adm-stack">
      <Header
        title="Avisos"
        text="Comunicação oficial da organização para o público."
        action={
          <Button onClick={onCreate}>
            <Plus size={16} /> Novo aviso
          </Button>
        }
      />
      {state.announcements.length ? (
        <div className="adm-announcement-grid">
          {state.announcements
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map(item => (
              <article className="adm-panel adm-announcement" key={item.id}>
                <div className="adm-announcement-top">
                  <span className="adm-badge adm-badge-neutral">
                    {dateLabel(item.date)}
                  </span>
                  <Actions
                    onEdit={() => onEdit(item.id)}
                    onDelete={() => onDelete(item.id)}
                  />
                </div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
        </div>
      ) : (
        <Empty
          icon={Megaphone}
          title="Nenhum aviso publicado"
          text="Mantenha equipes e torcida informadas pela área de avisos."
          action={
            <Button onClick={onCreate}>
              <Plus size={16} /> Publicar aviso
            </Button>
          }
        />
      )}
    </div>
  );
}

function Settings({
  state,
  onEdit,
}: {
  state: Championship;
  onEdit: () => void;
}) {
  return (
    <div className="adm-stack">
      <Header
        title="Configurações"
        text="Identidade, calendário e regras oficiais."
        action={
          <Button onClick={onEdit}>
            <Pencil size={16} /> Editar configurações
          </Button>
        }
      />
      <div className="adm-settings-grid">
        <section className="adm-panel adm-setting-hero">
          {state.config.logoUrl ? (
            <img
              src={state.config.logoUrl}
              alt="Logo do campeonato"
              className="adm-config-logo"
            />
          ) : (
            <div className="adm-config-logo adm-config-logo-empty">
              <Trophy size={30} />
            </div>
          )}
          <div>
            <span className="adm-eyebrow">Identidade</span>
            <h2>{state.config.name || "Campeonato sem nome"}</h2>
            <p>
              {state.config.edition
                ? `Edição ${state.config.edition}`
                : "Edição não definida"}
            </p>
            {state.config.subtitle ? (
              <span className="adm-muted">{state.config.subtitle}</span>
            ) : null}
          </div>
        </section>
        <section className="adm-panel">
          <span className="adm-section-kicker">Calendário e operação</span>
          <dl className="adm-detail-list">
            <div>
              <dt>
                <MapPin size={15} /> Local
              </dt>
              <dd>{state.config.venue || "Não definido"}</dd>
            </div>
            <div>
              <dt>
                <CalendarDays size={15} /> Período
              </dt>
              <dd>
                {state.config.startDate || "—"} até{" "}
                {state.config.endDate || "—"}
              </dd>
            </div>
            <div>
              <dt>
                <GitBranch size={15} /> Fase atual
              </dt>
              <dd>
                {state.phases.find(
                  phase => phase.id === state.config.currentPhaseId
                )?.name || "Não definida"}
              </dd>
            </div>
            <div>
              <dt>
                <span
                  className={`adm-status-dot${state.config.demo ? " adm-dot-demo" : ""}`}
                />{" "}
                Ambiente
              </dt>
              <dd>{state.config.demo ? "Demonstração" : "Oficial"}</dd>
            </div>
          </dl>
        </section>
        <section className="adm-panel">
          <span className="adm-section-kicker">Inscrições e financeiro</span>
          <dl className="adm-detail-list">
            <div><dt><Users size={15} /> Modalidade</dt><dd>{state.config.modality || "X5"} · {state.config.competitionType === "weekly" ? "Semanal" : state.config.competitionType === "league" ? "Liga" : "Copa"}</dd></div>
            <div><dt><ReceiptText size={15} /> Taxa / premiação</dt><dd>{(state.config.entryFee || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · {state.config.prize || "A definir"}</dd></div>
            <div><dt><CalendarDays size={15} /> Janela de inscrição</dt><dd>{state.config.registrationDeadline || "A definir"} · pagamento: {state.config.paymentDeadline || "sem prazo"}</dd></div>
            <div><dt><ShieldAlert size={15} /> Vagas</dt><dd>{(state.registrations ?? []).filter(item => !["cancelled", "expired", "rejected"].includes(item.status)).length} / {state.config.maxTeams || "—"} ocupadas</dd></div>
          </dl>
        </section>
        <section className="adm-panel adm-rules-panel">
          <div className="adm-section-header">
            <span className="adm-section-kicker">Regulamento público</span>
            <Button onClick={onEdit}>
              <Pencil size={15} /> Editar regulamento
            </Button>
          </div>
          <p>{state.config.rules || "Nenhum regulamento informado."}</p>
        </section>
      </div>
    </div>
  );
}

function LoadingAccess() {
  return (
    <div className="adm-access-state">
      <Loader2 className="adm-spin adm-access-icon" size={30} />
      <h1>Carregando painel</h1>
      <p>Verificando sua sessão Manus…</p>
    </div>
  );
}

export default function Admin({
  snapshot,
  onRefresh,
}: {
  snapshot: ChampionshipSnapshot;
  onRefresh: () => void;
}) {
  const { loading, user } = useAuth();
  const [state, setState] = useState<Championship>(() => clone(snapshot.state));
  const [revision, setRevision] = useState(snapshot.revision);
  const stateRef = useRef(state);
  const revisionRef = useRef(snapshot.revision);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{
    kind: Entity;
    id?: string;
    focusScore?: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState<{
    entity: Exclude<Entity, "config">;
    id: string;
    title: string;
    text: string;
    blocked: boolean;
    blockReason?: string;
  } | null>(null);
  const save = trpc.tournament.save.useMutation();
  const upload = trpc.tournament.uploadLogo.useMutation();
  const uploadReplay = trpc.tournament.uploadReplay.useMutation();

  useEffect(() => {
    if (savingRef.current) return;
    const next = clone(snapshot.state);
    setState(next);
    stateRef.current = next;
    setRevision(snapshot.revision);
    revisionRef.current = snapshot.revision;
  }, [snapshot]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const persist = async (next: Championship) => {
    if (savingRef.current) return false;
    const previous = clone(stateRef.current);
    savingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    setState(next);
    stateRef.current = next;
    try {
      const response = await save.mutateAsync({
        state: next,
        revision: revisionRef.current,
      });
      const updated = response as ChampionshipSnapshot;
      const received = clone(updated.state);
      setState(received);
      stateRef.current = received;
      setRevision(updated.revision);
      revisionRef.current = updated.revision;
      setNotice("Alterações salvas com sucesso.");
      setSaving(false);
      savingRef.current = false;
      onRefresh();
      return true;
    } catch (saveError) {
      setState(previous);
      stateRef.current = previous;
      setError(errorText(saveError));
      setSaving(false);
      savingRef.current = false;
      onRefresh();
      return false;
    }
  };
  const commit = (updater: (current: Championship) => Championship) =>
    persist(updater(clone(stateRef.current)));
  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      const encoded = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const raw = String(reader.result || "");
          resolve(raw.slice(raw.indexOf(",") + 1));
        };
        reader.onerror = () =>
          reject(new Error("Não foi possível ler a imagem."));
        reader.readAsDataURL(file);
      });
      const result = await upload.mutateAsync({
        base64: encoded,
        mime: file.type as "image/png" | "image/jpeg" | "image/webp",
      });
      return result.url;
    } finally {
      setUploading(false);
    }
  };
  const uploadMatchReplay = async (matchId: string, file: File) => {
    const reader = new FileReader();
    const encoded = await new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const raw = String(reader.result || "");
        resolve(raw.slice(raw.indexOf(",") + 1));
      };
      reader.onerror = () =>
        reject(new Error("Não foi possível ler o replay."));
      reader.readAsDataURL(file);
    });
    return uploadReplay.mutateAsync({
      matchId,
      base64: encoded,
      mime: (file.type || "application/octet-stream") as
        | "video/mp4"
        | "video/webm"
        | "video/quicktime"
        | "video/x-msvideo"
        | "application/octet-stream",
      fileName: file.name,
    });
  };

  const editInitial = (): EditorValue | null => {
    const current = stateRef.current;
    if (!editor) return null;
    if (editor.kind === "team")
      return editor.id
        ? current.teams.find(item => item.id === editor.id) || null
        : teamBlank();
    if (editor.kind === "player")
      return editor.id
        ? current.players.find(item => item.id === editor.id) || null
        : playerBlank(current.teams[0]?.id || "");
    if (editor.kind === "phase")
      return editor.id
        ? current.phases.find(item => item.id === editor.id) || null
        : phaseBlank(current.phases);
    if (editor.kind === "match")
      return editor.id
        ? current.matches.find(item => item.id === editor.id) || null
        : matchBlank(current.phases[0]?.id || "");
    if (editor.kind === "announcement")
      return editor.id
        ? current.announcements.find(item => item.id === editor.id) || null
        : announcementBlank();
    return current.config;
  };
  const saveEditor = (value: EditorValue) =>
    commit(current => {
      if (editor?.kind === "team") {
        const item = value as Team;
        return {
          ...current,
          teams: current.teams.some(row => row.id === item.id)
            ? current.teams.map(row => (row.id === item.id ? item : row))
            : [...current.teams, item],
        };
      }
      if (editor?.kind === "player") {
        const item = value as Player;
        return {
          ...current,
          players: current.players.some(row => row.id === item.id)
            ? current.players.map(row => (row.id === item.id ? item : row))
            : [...current.players, item],
        };
      }
      if (editor?.kind === "phase") {
        const item = value as Phase;
        return {
          ...current,
          phases: current.phases.some(row => row.id === item.id)
            ? current.phases.map(row => (row.id === item.id ? item : row))
            : [...current.phases, item],
        };
      }
      if (editor?.kind === "match") {
        const item = value as Match;
        return {
          ...current,
          matches: current.matches.some(row => row.id === item.id)
            ? current.matches.map(row => (row.id === item.id ? item : row))
            : [...current.matches, item],
        };
      }
      if (editor?.kind === "announcement") {
        const item = value as Announcement;
        return {
          ...current,
          announcements: current.announcements.some(row => row.id === item.id)
            ? current.announcements.map(row =>
                row.id === item.id ? item : row
              )
            : [...current.announcements, item],
        };
      }
      return { ...current, config: value as Championship["config"] };
    });

  const askDelete = (entity: Exclude<Entity, "config">, id: string) => {
    const current = stateRef.current;
    if (entity === "team") {
      const team = current.teams.find(item => item.id === id);
      if (!team) return;
      const games = current.matches.filter(
        match => match.homeId === id || match.awayId === id
      ).length;
      const players = current.players.filter(
        player => player.teamId === id
      ).length;
      return setDeleting({
        entity,
        id,
        title: `Excluir ${team.name}`,
        text: games
          ? `Esta equipe tem ${games} partida(s) vinculada(s).`
          : players
            ? `A equipe será removida e ${players} jogador(es) cadastrado(s) também serão excluídos.`
            : "A equipe será removida do campeonato.",
        blocked: games > 0,
        blockReason:
          "Exclua primeiro todas as partidas que usam esta equipe. A exclusão foi bloqueada para preservar o histórico.",
      });
    }
    if (entity === "phase") {
      const phase = current.phases.find(item => item.id === id);
      if (!phase) return;
      const games = current.matches.filter(
        match => match.phaseId === id
      ).length;
      return setDeleting({
        entity,
        id,
        title: `Excluir ${phase.name}`,
        text: games
          ? `Esta fase tem ${games} partida(s) vinculada(s).`
          : "Se for a fase atual, a configuração será limpa.",
        blocked: games > 0,
        blockReason:
          "Exclua primeiro todas as partidas desta fase. Uma fase com jogos não pode ser removida.",
      });
    }
    if (entity === "match") {
      const refs = current.matches.filter(
        match => match.nextMatchId === id
      ).length;
      return setDeleting({
        entity,
        id,
        title: "Excluir partida",
        text: refs
          ? `A partida é destino de ${refs} outro(s) jogo(s). Os vínculos de próxima partida serão limpos.`
          : "A partida será removida do campeonato.",
        blocked: false,
      });
    }
    if (entity === "player") {
      const item = current.players.find(row => row.id === id);
      if (item)
        setDeleting({
          entity,
          id,
          title: `Excluir ${item.name}`,
          text: "O cadastro e suas estatísticas serão removidos.",
          blocked: false,
        });
      return;
    }
    setDeleting({
      entity,
      id,
      title: "Excluir aviso",
      text: "O aviso deixará de aparecer para o público.",
      blocked: false,
    });
  };
  const confirmDelete = () => {
    if (!deleting || deleting.blocked) return;
    const request = deleting;
    setDeleting(null);
    void commit(current => {
      if (request.entity === "team")
        return {
          ...current,
          teams: current.teams.filter(item => item.id !== request.id),
          players: current.players.filter(item => item.teamId !== request.id),
        };
      if (request.entity === "phase")
        return {
          ...current,
          phases: current.phases.filter(item => item.id !== request.id),
          config: {
            ...current.config,
            currentPhaseId:
              current.config.currentPhaseId === request.id
                ? ""
                : current.config.currentPhaseId,
          },
        };
      if (request.entity === "match")
        return {
          ...current,
          matches: current.matches
            .filter(item => item.id !== request.id)
            .map(item =>
              item.nextMatchId === request.id
                ? { ...item, nextMatchId: null, nextSlot: null }
                : item
            ),
        };
      if (request.entity === "player")
        return {
          ...current,
          players: current.players.filter(item => item.id !== request.id),
        };
      return {
        ...current,
        announcements: current.announcements.filter(
          item => item.id !== request.id
        ),
      };
    });
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(stateRef.current, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(stateRef.current.config.name || "campeonato").replace(/\s+/g, "-").toLowerCase()}-dados.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Exportação JSON iniciada.");
  };

  if (loading) return <LoadingAccess />;
  if (!user)
    return (
      <div className="adm-access-state">
        <div className="adm-access-icon">
          <LogIn size={28} />
        </div>
        <h1>Acesso administrativo</h1>
        <p>
          Entre com o e-mail e a senha de administrador configurados no servidor
          para acessar o painel do campeonato.
        </p>
        <Button variant="primary" onClick={() => startLogin()}>
          <LogIn size={17} /> Entrar com e-mail e senha
        </Button>
      </div>
    );
  if (user.role !== "admin")
    return (
      <div className="adm-access-state">
        <div className="adm-access-icon adm-access-icon-warning">
          <ShieldAlert size={28} />
        </div>
        <h1>Conta sem permissão</h1>
        <p>
          Esta conta está autenticada, mas não tem acesso à organização. Peça a
          um responsável para conceder o papel de administrador.
        </p>
        <span className="adm-access-email">
          {user.email || user.name || "Conta autenticada"}
        </span>
      </div>
    );

  const current = editInitial();
  const renderTab = () => {
    if (tab === "overview")
      return <Overview state={state} onTab={setTab} onExport={exportJson} />;
    if (tab === "teams")
      return (
        <Teams
          state={state}
          onCreate={() => setEditor({ kind: "team" })}
          onEdit={id => setEditor({ kind: "team", id })}
          onDelete={id => askDelete("team", id)}
        />
      );
    if (tab === "players")
      return (
        <Players
          state={state}
          onCreate={() => setEditor({ kind: "player" })}
          onEdit={id => setEditor({ kind: "player", id })}
          onDelete={id => askDelete("player", id)}
        />
      );
    if (tab === "matches")
      return (
        <Matches
          state={state}
          onEdit={id => setEditor({ kind: "match", id })}
          onScoreEdit={id => setEditor({ kind: "match", id, focusScore: true })}
          onDelete={id => askDelete("match", id)}
          onAddTeams={() => setTab("teams")}
          onGenerate={() => void commit(current => current)}
          generating={saving}
        />
      );
    if (tab === "phases")
      return (
        <Phases
          state={state}
          onCreate={() => setEditor({ kind: "phase" })}
          onEdit={id => setEditor({ kind: "phase", id })}
          onDelete={id => askDelete("phase", id)}
        />
      );
    if (tab === "announcements")
      return (
        <Announcements
          state={state}
          onCreate={() => setEditor({ kind: "announcement" })}
          onEdit={id => setEditor({ kind: "announcement", id })}
          onDelete={id => askDelete("announcement", id)}
        />
      );
    if (tab === "competitions")
      return (
        <div className="adm-stack">
          <CompetitionsAdmin />
          <AdminRegistrations state={state} onRefresh={onRefresh} />
        </div>
      );
    return (
      <Settings state={state} onEdit={() => setEditor({ kind: "config" })} />
    );
  };
  return (
    <div className="adm-page">
      <header className="adm-header">
        <div>
          <span className="adm-eyebrow">
            <Trophy size={14} /> Administração do campeonato
          </span>
          <h1>{state.config.name || "Painel de organização"}</h1>
          <p>
            {state.config.edition
              ? `Edição ${state.config.edition}`
              : "Dados oficiais e operação em um só lugar"}
            {state.config.demo ? (
              <span className="adm-demo-pill">Demonstração</span>
            ) : null}
          </p>
        </div>
        <div className="adm-header-actions">
          <span className="adm-revision">
            <span className="adm-status-dot" /> Revisão {revision}
          </span>
          <Button onClick={exportJson}>
            <Download size={16} /> Exportar dados
          </Button>
        </div>
      </header>
      <nav className="adm-tabs" aria-label="Seções administrativas">
        {TABS.map(item => {
          const Icon = item.icon;
          return (
            <button
              className={`adm-tab${tab === item.id ? " is-active" : ""}`}
              key={item.id}
              onClick={() => setTab(item.id)}
            >
              <Icon size={17} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      {error ? (
        <div className="adm-feedback adm-feedback-error">
          <AlertTriangle size={17} />
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Fechar erro">
            ×
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="adm-feedback adm-feedback-success">
          <CheckCircle2 size={17} />
          <span>{notice}</span>
        </div>
      ) : null}
      {saving ? (
        <div className="adm-saving-bar">
          <Loader2 className="adm-spin" size={15} /> Salvando alterações…
        </div>
      ) : null}
      <main className="adm-content">{renderTab()}</main>
      {editor && current ? (
        <EditorDialog
          key={`${editor.kind}-${editor.id || "new"}`}
          kind={editor.kind}
          initial={current}
          state={state}
          saving={saving}
          serverError={error}
          uploading={uploading}
          replayUploading={uploadReplay.isPending}
          onUpload={uploadLogo}
          onReplayUpload={uploadMatchReplay}
          onSave={saveEditor}
          onClose={() => setEditor(null)}
          focusScore={editor.focusScore}
        />
      ) : null}
      <AlertDialog
        open={Boolean(deleting && !deleting.blocked)}
        onOpenChange={open => !open && setDeleting(null)}
      >
        <AlertDialogContent className="adm-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.text} Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="adm-alert-action"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={Boolean(deleting?.blocked)}
        onOpenChange={open => !open && setDeleting(null)}
      >
        <DialogContent className="adm-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="adm-dialog-title">
              <ShieldAlert size={19} /> Exclusão bloqueada
            </DialogTitle>
            <DialogDescription>{deleting?.blockReason}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleting(null)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
