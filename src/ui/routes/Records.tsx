import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { fullName } from '../format';
import { ACHIEVEMENTS } from '../../game/achievements';
import { awardMeta, isIndividualAward, INDIVIDUAL_AWARD_ORDER } from '../../game/awardMeta';
import type { Award } from '../../types/league';

type Tab = 'race' | 'leaders' | 'awards' | 'honours' | 'achievements';
const TAB_LABEL: Record<Tab, string> = {
  race: 'Golden Boot', leaders: 'Career', awards: 'Awards', honours: 'Honours', achievements: 'Achievements',
};

interface RaceRow { id: string; name: string; clubId?: string; position: string; goals: number; apps: number; mine: boolean }

export function Records() {
  const meta = useGameStore((s) => s.meta)!;
  const players = useGameStore((s) => s.players);
  const clubs = useGameStore((s) => s.clubs);
  const currentSeason = useGameStore((s) => s.currentSeason);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('race');

  const name = (id?: string) => (id && clubs[id] ? clubs[id].shortName : id ?? '—');
  const pname = (id?: string) => (id && players[id] ? fullName(players[id]) : id ?? 'Unknown');

  // --- Golden Boot race: live top scorers this season -----------------------
  // Domestic-league goals only (as with the real Golden Shoe): the manager's own
  // league, and the worldwide race across every league. Uses the running
  // in-season stats that refresh every matchday.
  const race = useMemo(() => {
    const season = currentSeason();
    if (!season) return null;
    const sid = season.id;
    const leagueIds = new Set(Object.keys(meta.competitions ?? {}));
    const myLeague = Object.values(meta.competitions ?? {}).find((c) => c.clubIds.includes(meta.managerClubId));

    const league: RaceRow[] = [];
    const global: RaceRow[] = [];
    for (const p of Object.values(players)) {
      let lg = 0, lapps = 0, gg = 0, gapps = 0;
      for (const s of p.stats) {
        if (s.seasonId !== sid || !leagueIds.has(s.competitionId)) continue;
        gg += s.goals; gapps += s.appearances;
        if (myLeague && s.competitionId === myLeague.id) { lg += s.goals; lapps += s.appearances; }
      }
      const clubId = p.contract.clubId ?? undefined;
      const mine = clubId === meta.managerClubId;
      if (gg > 0) global.push({ id: p.id, name: fullName(p), clubId, position: p.position, goals: gg, apps: gapps, mine });
      if (lg > 0) league.push({ id: p.id, name: fullName(p), clubId, position: p.position, goals: lg, apps: lapps, mine });
    }
    const cmp = (a: RaceRow, b: RaceRow) => b.goals - a.goals || a.apps - b.apps;
    return {
      seasonLabel: season.label ?? String(season.year),
      leagueName: myLeague?.name ?? 'Your league',
      league: league.sort(cmp).slice(0, 12),
      global: global.sort(cmp).slice(0, 12),
    };
  }, [players, meta, currentSeason]);

  // Career leaders across active players (sum of their archived season stats).
  const leaders = useMemo(() => {
    const rows = Object.values(players).map((p) => {
      let goals = 0, apps = 0, assists = 0;
      for (const s of p.stats) { goals += s.goals; apps += s.appearances; assists += s.assists; }
      return { id: p.id, name: fullName(p), goals, apps, assists };
    });
    return {
      scorers: [...rows].filter((r) => r.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 15),
      appearances: [...rows].filter((r) => r.apps > 0).sort((a, b) => b.apps - a.apps).slice(0, 15),
    };
  }, [players]);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Records &amp; History</h1>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'btn-primary py-1 px-3' : 'btn-ghost py-1 px-3'} onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>
        ))}
      </div>

      {tab === 'race' && (
        race ? (
          <div className="grid md:grid-cols-2 gap-4">
            <RaceCard
              title={`${race.leagueName} Golden Boot`}
              subtitle={`${race.seasonLabel} — leading scorers in your league`}
              rows={race.league} name={name} navigate={navigate}
            />
            <RaceCard
              title="Global Golden Boot"
              subtitle={`${race.seasonLabel} — the worldwide race across every league`}
              rows={race.global} name={name} navigate={navigate}
            />
          </div>
        ) : (
          <div className="card p-4 text-sm text-slate-500">No season in progress.</div>
        )
      )}

      {tab === 'leaders' && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-2">Career top scorers</h2>
            {leaders.scorers.length === 0 && <p className="text-xs text-slate-500">No completed seasons yet.</p>}
            {leaders.scorers.map((r, i) => (
              <button key={r.id} className="w-full flex items-center justify-between text-sm py-0.5 hover:text-white" onClick={() => navigate(`/player/${r.id}`)}>
                <span><span className="font-mono text-slate-500 mr-2">{i + 1}</span>{r.name}</span>
                <span className="font-mono text-accent-400">{r.goals} <span className="text-slate-500 text-xs">gls</span></span>
              </button>
            ))}
          </div>
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-2">Most appearances</h2>
            {leaders.appearances.map((r, i) => (
              <button key={r.id} className="w-full flex items-center justify-between text-sm py-0.5 hover:text-white" onClick={() => navigate(`/player/${r.id}`)}>
                <span><span className="font-mono text-slate-500 mr-2">{i + 1}</span>{r.name}</span>
                <span className="font-mono text-slate-300">{r.apps} <span className="text-slate-500 text-xs">apps</span></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'awards' && <AwardsTab meta={meta} pname={pname} navigate={navigate} />}

      {tab === 'honours' && <HonoursTab meta={meta} name={name} />}

      {tab === 'achievements' && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">Achievements ({Object.keys(meta.achievements ?? {}).length}/{ACHIEVEMENTS.length})</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {ACHIEVEMENTS.map((a) => {
              const year = meta.achievements?.[a.id];
              return (
                <div key={a.id} className={`rounded p-2 border ${year ? 'border-amber-500/40 bg-amber-500/5' : 'border-surface-600 opacity-70'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{year ? '🏅' : '🔒'} {a.name}</span>
                    {year && <span className="text-xs text-amber-400">{year}</span>}
                  </div>
                  <p className="text-xs text-slate-400">{a.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Golden Boot race card ---------------------------------------------------
function RaceCard({ title, subtitle, rows, name, navigate }: {
  title: string; subtitle: string; rows: RaceRow[];
  name: (id?: string) => string; navigate: (to: string) => void;
}) {
  const lead = rows[0]?.goals ?? 0;
  return (
    <div className="card p-4">
      <div className="mb-3">
        <h2 className="font-semibold flex items-center gap-2"><span>👟</span>{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {rows.length === 0 && <p className="text-xs text-slate-500">No goals scored yet this season.</p>}
      <div className="space-y-1">
        {rows.map((r, i) => (
          <button
            key={r.id}
            className={`w-full flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-surface-700/60 ${r.mine ? 'bg-accent-500/10 ring-1 ring-accent-500/30' : ''}`}
            onClick={() => navigate(`/player/${r.id}`)}
          >
            <span className={`font-mono w-5 text-right ${i === 0 ? 'text-amber-400' : 'text-slate-500'}`}>{i + 1}</span>
            <span className="flex-1 min-w-0 text-left truncate">
              <span className={r.mine ? 'text-accent-300' : 'text-slate-200'}>{r.name}</span>
              <span className="text-slate-500 text-xs ml-1.5">{r.position} · {name(r.clubId)}</span>
            </span>
            <span className="text-slate-500 text-xs w-10 text-right">{r.apps} app</span>
            <span className="font-mono text-accent-400 w-8 text-right">{r.goals}</span>
            {/* Race bar relative to the leader. */}
            <span className="hidden sm:block w-16 h-1.5 rounded bg-surface-700 overflow-hidden">
              <span className="block h-full bg-accent-500/70" style={{ width: `${lead ? Math.round((r.goals / lead) * 100) : 0}%` }} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Awards tab (reorganized): per-season, prestige-ordered ------------------
const AWARD_RANK = new Map(INDIVIDUAL_AWARD_ORDER.map((t, i) => [t, i]));

function AwardsTab({ meta, pname, navigate }: {
  meta: { history?: { seasonId: string; label: string; awards: Award[] }[] };
  pname: (id?: string) => string; navigate: (to: string) => void;
}) {
  const seasons = [...(meta.history ?? [])]
    .filter((h) => h.awards.some((a) => isIndividualAward(a.type)))
    .reverse();

  if (seasons.length === 0) {
    return <div className="card p-4 text-sm text-slate-500">No individual awards yet — finish a season to see the Ballon d'Or, Golden Boots and more.</div>;
  }

  return (
    <div className="space-y-4">
      {seasons.map((h) => {
        const indiv = h.awards.filter((a) => isIndividualAward(a.type));
        const xi = indiv.filter((a) => a.type === 'TEAM_OF_SEASON');
        const solo = indiv
          .filter((a) => a.type !== 'TEAM_OF_SEASON')
          .sort((a, b) => (AWARD_RANK.get(a.type) ?? 99) - (AWARD_RANK.get(b.type) ?? 99));
        const headline = solo[0];
        const rest = headline ? solo.slice(1) : solo;
        return (
          <div key={h.seasonId} className="card p-4">
            <h2 className="text-sm font-semibold text-white mb-3">{h.label} <span className="text-slate-500 font-normal">· individual awards</span></h2>

            {headline && (
              <button
                className="w-full flex items-center gap-3 mb-3 p-3 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 hover:ring-amber-500/60 text-left"
                onClick={() => headline.playerId && navigate(`/player/${headline.playerId}`)}
              >
                <span className="text-2xl">{awardMeta(headline.type).emoji}</span>
                <span className="min-w-0">
                  <span className="block text-xs uppercase tracking-wide text-amber-400/90">{headline.label}</span>
                  <span className="block font-semibold text-white truncate">
                    {pname(headline.playerId)}
                    {headline.note ? <span className="text-slate-400 text-xs font-normal ml-2">{headline.note}</span> : null}
                  </span>
                </span>
              </button>
            )}

            {rest.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                {rest.map((a, i) => <AwardRow key={i} a={a} pname={pname} navigate={navigate} />)}
              </div>
            )}

            {xi.length > 0 && (
              <div className="mt-3 pt-3 border-t border-surface-700">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">🧩 Team of the Season</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {xi.map((a, i) => (
                    <button key={i} className="hover:text-white" onClick={() => a.playerId && navigate(`/player/${a.playerId}`)}>
                      <span className="font-mono text-slate-500 mr-1">{a.slot}</span>{pname(a.playerId)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Honours tab (reorganized) ----------------------------------------------
function HonoursTab({ meta, name }: {
  meta: {
    history?: { seasonId: string; label: string; awards: Award[] }[];
    continentalHistory?: { id: string; name: string; year: number; clubId: string }[];
    internationalHistory?: { year: number; nation: string }[];
  };
  name: (id?: string) => string;
}) {
  const seasons = [...(meta.history ?? [])]
    .map((h) => ({ h, champs: h.awards.filter((a) => a.type === 'LEAGUE_CHAMPION' || a.type === 'DOMESTIC_CUP' || a.type === 'CONTINENTAL') }))
    .filter((x) => x.champs.length > 0)
    .reverse();

  const hasAnything = seasons.length > 0 || (meta.continentalHistory?.length ?? 0) > 0 || (meta.internationalHistory?.length ?? 0) > 0;
  if (!hasAnything) {
    return <div className="card p-4 text-sm text-slate-500">No seasons completed yet — trophies won across the world will be recorded here.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Season roll of honour</h2>
        {seasons.length === 0 && <p className="text-xs text-slate-500">No domestic or continental titles recorded yet.</p>}
        <div className="space-y-3">
          {seasons.map(({ h, champs }) => (
            <div key={h.seasonId} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
              <span className="text-slate-500 font-mono text-sm shrink-0 w-24">{h.label}</span>
              <div className="flex flex-wrap gap-x-2 gap-y-1">
                {champs.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-surface-700 rounded px-2 py-0.5 text-xs">
                    <span>{awardMeta(a.type).emoji}</span>
                    <span className="text-slate-400">{a.label}:</span>
                    <span className="text-white">{name(a.clubId)}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {(meta.continentalHistory?.length ?? 0) > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">European honours</h2>
          <div className="flex flex-wrap gap-2">
            {[...(meta.continentalHistory ?? [])].reverse().map((h, i) => (
              <div key={i} className="bg-surface-700 rounded px-3 py-1 text-sm"><span className="text-amber-400">🏆</span> {h.year} {h.name}: {name(h.clubId)}</div>
            ))}
          </div>
        </div>
      )}

      {(meta.internationalHistory?.length ?? 0) > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">World Cup winners</h2>
          <div className="flex flex-wrap gap-2">
            {[...(meta.internationalHistory ?? [])].reverse().map((h) => (
              <div key={h.year} className="bg-surface-700 rounded px-3 py-1 text-sm"><span className="text-amber-400">🌍</span> {h.year} — {h.nation}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AwardRow({ a, pname, navigate }: { a: Award; pname: (id?: string) => string; navigate: (to: string) => void }) {
  const meta = awardMeta(a.type);
  return (
    <button className="flex items-center justify-between text-sm py-0.5 hover:text-white text-left" onClick={() => a.playerId && navigate(`/player/${a.playerId}`)}>
      <span className="truncate"><span className="mr-1.5">{meta.emoji}</span><span className="text-slate-400">{a.label}</span></span>
      <span className="text-white ml-3 shrink-0">{pname(a.playerId)}{a.note ? <span className="text-slate-500 text-xs ml-1">({a.note})</span> : null}</span>
    </button>
  );
}
