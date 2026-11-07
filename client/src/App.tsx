import { useEffect, useState } from "react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  GitBranch,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Medal,
  Menu,
  ClipboardPenLine,
  Search,
  Settings2,
  Shield,
  Star,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { Link, Route, Switch, useLocation } from "wouter";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import { trpc } from "./lib/trpc";
import Home from "./pages/Home";
import Championships from "./pages/Championships";
import Registration from "./pages/Registration";
import Matches from "./pages/Matches";
import Bracket from "./pages/Bracket";
import Standings from "./pages/Standings";
import Teams, { TeamDetail } from "./pages/Teams";
import Rules from "./pages/Rules";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import EventRegistration from "./pages/EventRegistration";
import Museum from "./pages/Museum";
import { MatchDetails, TeamBadge } from "./components/copa/ui";
import type { Match } from "../../shared/championship";
import "./registration.css";

const navigation = [
  { path: "/", label: "Visão geral", Icon: LayoutDashboard },
  { path: "/campeonatos", label: "Competições", Icon: Medal },
  { path: "/inscricoes", label: "Inscrições", Icon: ClipboardPenLine },
  { path: "/partidas", label: "Partidas", Icon: CalendarDays },
  { path: "/chaveamento", label: "Chaveamento", Icon: GitBranch },
  { path: "/classificacao", label: "Classificação", Icon: Trophy },
  { path: "/equipes", label: "Equipes e jogadores", Icon: Users },
  { path: "/regulamento", label: "Regulamento", Icon: BookOpen },
  { path: "/museu", label: "Museu da SCP", Icon: Medal },
];
function ChampionshipSite() {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false),
    [search, setSearch] = useState(""),
    [notifications, setNotifications] = useState(false),
    [matchId, setMatchId] = useState<string | null>(null);
  const [followed, setFollowed] = useState(
    () => localStorage.getItem("copapulse-followed") === "true"
  );
  const [readNews, setReadNews] = useState(
    () => localStorage.getItem("copapulse-read-news") || ""
  );
  const championship = trpc.tournament.get.useQuery(undefined, {
    refetchInterval: 20000,
    retry: 1,
  });
  const { user, logout } = useAuth();
  const utils = trpc.useUtils();
  const state = championship.data?.state;
  useEffect(() => {
    setMobileOpen(false);
    setSearch("");
    setMatchId(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location]);
  useEffect(() => {
    document.title = `${navigation.find(n => n.path === location)?.label || (location === "/admin" ? "Administração" : "Campeonato")} · ${state?.config.name || "Super Copa Pionner"}`;
  }, [location, state?.config.name]);
  function openMatch(match: Match) {
    setMatchId(match.id);
  }
  const completed =
    state?.matches.filter(m => m.status === "finished").length || 0;
  const selectedNav =
    navigation.find(n => n.path === location) ||
    navigation.find(n => location.startsWith(n.path) && n.path !== "/");
  const newsKey = state?.announcements.map(a => a.id + a.date).join("|") || "";
  return (
    <div className="site-shell">
      {mobileOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Fechar navegação"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <Link href="/" className="brand championship-brand">
          <span className="brand-mark official-brand-mark">
            <img
              src={state?.config.logoUrl || "/favicon-pionner.png"}
              alt="Logo Super Copa Pionner"
            />
          </span>
          <span className="official-brand-name">
            {state?.config.name || "Super Copa Pionner"}
            <small>O CAMPEONATO É NOSSO.</small>
          </span>
        </Link>
        <div className="sidebar-label">CAMPEONATO</div>
        <nav className="main-nav">
          {navigation.map(({ path, label, Icon }) => (
            <Link
              href={path}
              key={path}
              className={`nav-item ${location === path || (path === "/equipes" && location.startsWith("/equipes/")) ? "active" : ""}`}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {path === "/partidas" &&
                !!state?.matches.some(m => m.status === "live") && (
                  <i className="nav-live" />
                )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-cup">
          <span className="cup-outline">
            <Trophy size={29} strokeWidth={1.3} />
          </span>
          <p>
            Uma copa.
            <br />
            <strong>Muitas histórias.</strong>
          </p>
          <span className="cup-phase">
            {state?.phases.find(p => p.id === state.config.currentPhaseId)
              ?.name || "Preparando a competição"}
          </span>
          <div className="cup-progress">
            <span
              style={{
                width: `${state?.matches.length ? (completed / state.matches.length) * 100 : 0}%`,
              }}
            />
          </div>
          <small>
            {completed} de {state?.matches.length || 0} partidas realizadas
          </small>
          <Link href="/chaveamento">
            O caminho até a taça
            <ChevronRight size={13} />
          </Link>
        </div>
        <div className="sidebar-bottom">
          <Link
            href="/admin"
            className={`nav-item admin-nav ${location === "/admin" ? "active" : ""}`}
          >
            <Settings2 size={18} />
            <span>
              {user?.role === "admin"
                ? "Painel administrativo"
                : "Acesso administrativo"}
            </span>
            <span className="admin-lock">
              <Shield size={12} />
            </span>
          </Link>
          <div className="sidebar-profile">
            <span className="profile-avatar">
              {user?.name?.charAt(0).toUpperCase() || "V"}
            </span>
            <span>
              <strong>{user?.name || "Visitante"}</strong>
              <small>
                {user?.role === "admin"
                  ? "Organização da copa"
                  : "Na torcida pelo campeonato"}
              </small>
            </span>
            {user && (
              <button
                className="icon-btn"
                title="Sair da conta"
                aria-label="Sair da conta"
                onClick={() =>
                  logout().catch(() =>
                    toast.error("Não foi possível sair. Tente novamente.")
                  )
                }
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-btn mobile-menu"
              aria-label="Abrir navegação"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span className="tournament-mark">
              {state?.config.logoUrl ? (
                <img src={state.config.logoUrl} alt="Logo do campeonato" />
              ) : (
                <Trophy size={18} />
              )}
            </span>
            <div className="tournament-title">
              <strong>{state?.config.name || "Super Copa Pionner"}</strong>
              <span>
                {state?.config.edition || "2026"} <i /> Campeonato oficial
              </span>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="global-search">
              <Search size={16} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar no campeonato..."
                aria-label="Buscar equipes no campeonato"
              />
              <kbd>/</kbd>
              {search && (
                <div className="search-popover">
                  <p>Equipes encontradas</p>
                  {state?.teams
                    .filter(t =>
                      `${t.name} ${t.city}`
                        .toLowerCase()
                        .includes(search.toLowerCase())
                    )
                    .slice(0, 6)
                    .map(t => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setSearch("");
                          setLocation(`/equipes/${t.id}`);
                        }}
                      >
                        <TeamBadge team={t} size="small" />
                        <span>
                          {t.name}
                          <small>Grupo {t.group}</small>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    ))}
                  {!state?.teams.some(t =>
                    `${t.name} ${t.city}`
                      .toLowerCase()
                      .includes(search.toLowerCase())
                  ) && (
                    <span className="search-empty">
                      Nenhuma equipe encontrada.
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="notification-wrap">
              <button
                className={`icon-btn notification-button ${notifications ? "selected" : ""}`}
                aria-label="Ver comunicados do campeonato"
                aria-expanded={notifications}
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={19} />
                {newsKey !== readNews && !!newsKey && <i />}
              </button>
              {notifications && (
                <div className="notifications-popover">
                  <div>
                    <h3>Comunicados</h3>
                    <button
                      className="icon-btn"
                      aria-label="Fechar comunicados"
                      onClick={() => setNotifications(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {state?.announcements.map(a => (
                    <article key={a.id}>
                      <strong>{a.title}</strong>
                      <p>{a.text}</p>
                    </article>
                  ))}
                  {!state?.announcements.length && (
                    <p className="empty-inline">Nenhum comunicado publicado.</p>
                  )}
                  <button
                    className="text-link"
                    onClick={() => {
                      setReadNews(newsKey);
                      localStorage.setItem("copapulse-read-news", newsKey);
                      toast.success("Comunicados marcados como lidos.");
                    }}
                  >
                    Marcar como lidos
                  </button>
                </div>
              )}
            </div>
            <span className="topbar-divider" />
            <button
              className={`btn btn-primary follow-button ${followed ? "is-followed" : ""}`}
              onClick={() => {
                setFollowed(!followed);
                localStorage.setItem("copapulse-followed", String(!followed));
                toast.success(
                  !followed
                    ? "Copa marcada para acompanhar neste dispositivo."
                    : "Copa removida dos seus acompanhamentos."
                );
              }}
            >
              <Star size={15} fill={followed ? "currentColor" : "none"} />
              <span>{followed ? "Acompanhando" : "Acompanhar copa"}</span>
            </button>
          </div>
        </header>
        <main className="main-content">
          <div className="breadcrumb">
            <span>Campeonato</span>
            <ChevronRight size={12} />
            <strong>
              {location === "/admin"
                ? "Administração"
                : selectedNav?.label || "Equipe"}
            </strong>
            {state?.config.demo && (
              <span className="demo-label">DADOS DEMONSTRATIVOS</span>
            )}
          </div>
          {championship.isLoading ? (
            <div className="loading-state">
              <LoaderCircle size={31} className="animate-spin" />
              <h2>Preparando o campo...</h2>
              <p>Carregando o campeonato.</p>
            </div>
          ) : championship.error || !state || !championship.data ? (
            <div className="empty-state error-state">
              <Shield size={38} />
              <h2>Não conseguimos carregar a copa.</h2>
              <p>Tente novamente em alguns instantes.</p>
              <button
                className="btn btn-primary"
                onClick={() => championship.refetch()}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              <Switch>
                <Route path="/">
                  <Home state={state} onOpen={openMatch} />
                </Route>
                <Route path="/campeonatos">
                  <Championships state={state} />
                </Route>
                <Route path="/museu">
                  <Museum />
                </Route>
                <Route path="/inscricoes">
                  <Registration
                    entryFee={state.config.entryFee}
                    paymentDeadline={state.config.paymentDeadline}
                    registrationDeadline={state.config.registrationDeadline}
                    pixKey={state.config.pixKey}
                    pixReceiver={state.config.pixReceiver}
                  />
                </Route>
                <Route path="/inscricoes/nova">
                  {window.location.search.includes("competitionId=") ? (
                    <EventRegistration />
                  ) : (
                    <Registration
                      entryFee={state.config.entryFee}
                      paymentDeadline={state.config.paymentDeadline}
                      registrationDeadline={state.config.registrationDeadline}
                      pixKey={state.config.pixKey}
                      pixReceiver={state.config.pixReceiver}
                    />
                  )}
                </Route>
                <Route path="/partidas">
                  <Matches state={state} onOpen={openMatch} />
                </Route>
                <Route path="/chaveamento">
                  <Bracket state={state} onOpen={openMatch} />
                </Route>
                <Route path="/classificacao">
                  <Standings state={state} />
                </Route>
                <Route path="/equipes">
                  <Teams state={state} />
                </Route>
                <Route path="/equipes/:id">
                  {params => (
                    <TeamDetail
                      state={state}
                      id={params.id}
                      onOpen={openMatch}
                    />
                  )}
                </Route>
                <Route path="/regulamento">
                  <Rules state={state} />
                </Route>
                <Route path="/admin">
                  <Admin
                    snapshot={championship.data}
                    onRefresh={() => {
                      void utils.tournament.get.invalidate();
                    }}
                  />
                </Route>
                <Route path="/404" component={NotFound} />
                <Route component={NotFound} />
              </Switch>
              <MatchDetails
                state={state}
                match={state.matches.find(m => m.id === matchId) || null}
                onClose={() => setMatchId(null)}
              />
            </>
          )}
          <footer className="site-footer">
            <span>
              <Trophy size={13} />
              {state?.config.name || "Super Copa Pionner"} <span>·</span> Feito
              para quem vive o jogo.
            </span>
            <span>
              Horários de Brasília <i /> <span className="sync-dot" />
              Atualização a cada 20s
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="bottom-right" />
          <AppRoutes />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function AppRoutes() {
  const [location] = useLocation();
  return location === "/login" ? <Login /> : <ChampionshipSite />;
}
