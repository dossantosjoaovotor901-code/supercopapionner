import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Goal,
  MapPin,
  Search,
  Shield,
  Star,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import type { Championship, Match } from "../../../shared/championship";
import { standings } from "../../../shared/championship";
import {
  MatchCard,
  PageHeading,
  SectionHeader,
  TeamBadge,
} from "@/components/copa/ui";
import NotFound from "./NotFound";

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("copapulse-favorites") || "[]");
    } catch {
      return [];
    }
  });
  function toggle(id: string) {
    setFavorites(prev => {
      const next = prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id];
      localStorage.setItem("copapulse-favorites", JSON.stringify(next));
      return next;
    });
  }
  return { favorites, toggle };
}
export default function Teams({ state }: { state: Championship }) {
  const [query, setQuery] = useState(""),
    [group, setGroup] = useState("all"),
    [onlyFav, setOnlyFav] = useState(false);
  const { favorites, toggle } = useFavorites();
  const groups = Array.from(
    new Set(state.teams.map(t => t.group).filter(Boolean))
  ).sort();
  const teams = state.teams.filter(
    t =>
      (group === "all" || t.group === group) &&
      (!onlyFav || favorites.includes(t.id)) &&
      `${t.name} ${t.city}`.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <>
      <PageHeading
        title="Quem faz a copa acontecer."
        subtitle="Conheça as equipes, descubra os elencos e acompanhe seus favoritos."
      />
      <div className="filter-bar">
        <div className="segmented-control">
          <button
            className={!onlyFav ? "active" : ""}
            onClick={() => setOnlyFav(false)}
          >
            Todas as equipes <span>{state.teams.length}</span>
          </button>
          <button
            className={onlyFav ? "active" : ""}
            onClick={() => setOnlyFav(true)}
          >
            <Star size={14} />
            Meus favoritos
          </button>
        </div>
        <div className="filter-controls">
          <label className="select-wrap">
            <select
              aria-label="Filtrar equipes por grupo"
              value={group}
              onChange={e => setGroup(e.target.value)}
            >
              <option value="all">Todos os grupos</option>
              {groups.map(g => (
                <option key={g} value={g}>
                  Grupo {g}
                </option>
              ))}
            </select>
          </label>
          <label className="search-input">
            <Search size={15} />
            <input
              placeholder="Buscar equipe ou cidade"
              aria-label="Buscar equipe"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
        </div>
      </div>
      <p className="results-count">
        {teams.length} equipes <span>· Favoritos salvos neste dispositivo</span>
      </p>
      <div className="teams-grid">
        {teams.map(team => {
          const players = state.players.filter(p => p.teamId === team.id);
          return (
            <article className="team-card panel" key={team.id}>
              <div
                className="team-card-cover"
                style={{ "--team-color": team.color } as React.CSSProperties}
              >
                <span className="group-tag">Grupo {team.group || "—"}</span>
                <button
                  aria-label={
                    favorites.includes(team.id)
                      ? `Remover ${team.name} dos favoritos`
                      : `Favoritar ${team.name}`
                  }
                  className={`favorite-btn ${favorites.includes(team.id) ? "is-favorite" : ""}`}
                  onClick={() => toggle(team.id)}
                >
                  <Star
                    size={17}
                    fill={favorites.includes(team.id) ? "currentColor" : "none"}
                  />
                </button>
              </div>
              <div className="team-card-body">
                <TeamBadge team={team} size="large" />
                <h2>{team.name}</h2>
                <p>
                  <MapPin size={12} />
                  {team.city || "Cidade não informada"}
                </p>
                <div className="team-card-stats">
                  <span>
                    <Users size={14} />
                    <strong>{players.length}</strong> jogadores
                  </span>
                  <span>
                    <Goal size={14} />
                    <strong>
                      {state.matches
                        .filter(
                          m =>
                            m.status !== "scheduled" &&
                            (m.homeId === team.id || m.awayId === team.id)
                        )
                        .reduce(
                          (n, m) =>
                            n +
                            (m.homeId === team.id ? m.homeScore : m.awayScore),
                          0
                        )}
                    </strong>{" "}
                    gols
                  </span>
                </div>
                <Link
                  className="team-profile-link"
                  href={`/equipes/${team.id}`}
                >
                  Conhecer equipe
                  <ArrowRight size={14} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      {!teams.length && (
        <div className="empty-state">
          <Shield size={38} />
          <h2>
            {onlyFav
              ? "Sua torcida tem lugar aqui."
              : "Nenhuma equipe encontrada."}
          </h2>
          <p>
            {onlyFav
              ? "Marque a estrela de uma equipe para acompanhar seus favoritos."
              : "Tente outra busca ou grupo."}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setOnlyFav(false);
              setQuery("");
              setGroup("all");
            }}
          >
            Ver todas as equipes
          </button>
        </div>
      )}
    </>
  );
}
export function TeamDetail({
  state,
  id,
  onOpen,
}: {
  state: Championship;
  id: string;
  onOpen: (m: Match) => void;
}) {
  const team = state.teams.find(t => t.id === id),
    { favorites, toggle } = useFavorites();
  if (!team) return <NotFound />;
  const players = state.players.filter(p => p.teamId === team.id),
    games = state.matches
      .filter(m => m.homeId === id || m.awayId === id)
      .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const stats = standings(state, team.group).find(s => s.team.id === id);
  return (
    <>
      <Link className="text-link back-link" href="/equipes">
        <ArrowLeft size={14} />
        Voltar para equipes
      </Link>
      <div className="team-profile-hero panel">
        <TeamBadge team={team} size="hero" />
        <div>
          <p className="eyebrow">
            GRUPO {team.group || "—"} · {team.shortName}
          </p>
          <h1>{team.name}</h1>
          <p>
            <MapPin size={14} />
            {team.city || "Cidade não informada"}
          </p>
        </div>
        <button
          className={`btn ${favorites.includes(id) ? "btn-primary" : "btn-secondary"}`}
          onClick={() => toggle(id)}
        >
          <Star
            size={15}
            fill={favorites.includes(id) ? "currentColor" : "none"}
          />
          {favorites.includes(id) ? "Favoritada" : "Favoritar equipe"}
        </button>
      </div>
      <div className="team-profile-stats">
        {[
          ["Pontos no grupo", stats?.points || 0],
          ["Vitórias no grupo", stats?.won || 0],
          ["Gols no grupo", stats?.gf || 0],
          ["Jogadores", players.length],
        ].map(([label, value]) => (
          <div className="stat-card" key={label}>
            <strong>{value}</strong>
            <span className="stat-label">{label}</span>
          </div>
        ))}
      </div>
      <SectionHeader title="Os protagonistas" eyebrow="ELENCO" />
      <div className="players-grid">
        {players.map(p => (
          <article className="player-card panel" key={p.id}>
            <span
              className="player-shirt"
              style={{ "--team-color": team.color } as React.CSSProperties}
            >
              {p.number}
            </span>
            <span className="player-position">{p.position}</span>
            <h3>{p.name}</h3>
            <p>{p.nickname || team.name}</p>
            <div>
              <span>
                <strong>{p.goals}</strong> gols
              </span>
              <span>
                <strong>{p.assists}</strong> assistências
              </span>
            </div>
          </article>
        ))}
      </div>
      {!players.length && (
        <p className="empty-inline">
          O elenco ainda não foi cadastrado pela organização.
        </p>
      )}
      <section className="match-day">
        <SectionHeader title="A jornada em campo" />
        <div className="match-grid">
          {games.map(m => (
            <MatchCard key={m.id} state={state} match={m} onOpen={onOpen} />
          ))}
        </div>
        {!games.length && (
          <p className="empty-inline">
            Nenhuma partida cadastrada para esta equipe.
          </p>
        )}
      </section>
    </>
  );
}
