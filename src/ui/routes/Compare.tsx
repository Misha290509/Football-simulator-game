import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { AttributeRadar } from '../components/AttributeRadar';
import { ageOf, fullName, formatMoney, formatWage } from '../format';
import { marketView, eliteKnownIds, clubScoutRating, type MarketView } from '../../engine/marketScout';
import { TECHNICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, GOALKEEPING_KEYS } from '../../types/attributes';
import type { Player } from '../../types/player';

const ATTRIBUTE_GROUPS = [
  { title: 'Technical', gk: 'technical', group: TECHNICAL_KEYS },
  { title: 'Mental', gk: 'mental', group: MENTAL_KEYS },
  { title: 'Physical', gk: 'physical', group: PHYSICAL_KEYS },
  { title: 'Goalkeeping', gk: 'goalkeeping', group: GOALKEEPING_KEYS },
] as const;

const prettify = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

/** Career totals across every recorded season (§ #64). */
function career(p: Player): { apps: number; goals: number; assists: number } {
  return p.stats.reduce((m, s) => ({ apps: m.apps + s.appearances, goals: m.goals + s.goals, assists: m.assists + s.assists }), { apps: 0, goals: 0, assists: 0 });
}

export function Compare() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta)!;
  const players = useGameStore((s) => s.players);
  const clubs = useGameStore((s) => s.clubs);
  const season = useGameStore((s) => s.currentSeason());
  const year = season?.year ?? meta.startYear;
  const [params] = useSearchParams();

  const managerClub = useGameStore((s) => s.managerClub());
  const eliteIds = useMemo(() => eliteKnownIds(players, 50), [players]);
  const scoutRating = clubScoutRating(managerClub?.staff);
  const viewOf = (p: Player): MarketView => marketView(p, { managerClubId: meta.managerClubId, eliteIds, report: meta.scoutReports?.[p.id], scoutRating });

  const [aId, setAId] = useState(params.get('a') ?? '');
  const [bId, setBId] = useState(params.get('b') ?? '');
  const a = aId ? players[aId] : undefined;
  const b = bId ? players[bId] : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Compare players</h1>
        <button className="btn-ghost" onClick={() => navigate(-1)}>← Back</button>
      </div>
      <p className="text-xs text-slate-500">Search for any player in the world. Full attributes show for your own players, the global elite, and anyone you've scouted; others show what your scouts have filed.</p>

      <div className="grid md:grid-cols-2 gap-4">
        <PlayerSearch label="Player A" players={players} clubs={clubs} year={year} selected={a} onSelect={setAId} />
        <PlayerSearch label="Player B" players={players} clubs={clubs} year={year} selected={b} onSelect={setBId} />
      </div>

      {a && b ? (
        <Comparison a={a} b={b} va={viewOf(a)} vb={viewOf(b)} clubs={clubs} year={year} />
      ) : (
        <div className="card p-6 text-center text-slate-500">Pick two players to compare.</div>
      )}
    </div>
  );
}

function PlayerSearch({ label, players, clubs, year, selected, onSelect }: {
  label: string; players: Record<string, Player>; clubs: Record<string, import('../../types/club').Club>;
  year: number; selected?: Player; onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return Object.values(players)
      .filter((p) => `${p.name.first} ${p.name.last}`.toLowerCase().includes(s))
      .sort((x, y) => y.overall - x.overall)
      .slice(0, 12);
  }, [q, players]);

  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">{label}</div>
      {selected && (
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="font-semibold">{fullName(selected)} <span className="text-slate-500">— {selected.position} · {selected.contract.clubId ? clubs[selected.contract.clubId]?.shortName : 'Free'}</span></span>
          <button className="btn-ghost text-xs py-0.5" onClick={() => { onSelect(''); setQ(''); }}>Change</button>
        </div>
      )}
      <input className="w-full bg-surface-700 border border-surface-600 rounded px-3 py-1.5 text-sm" placeholder="Search any player…" value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded border border-surface-700 divide-y divide-surface-700">
          {results.map((p) => (
            <button key={p.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-700 flex justify-between" onClick={() => { onSelect(p.id); setQ(''); }}>
              <span>{fullName(p)} <span className="text-slate-500">{p.position}</span></span>
              <span className="text-slate-500">{p.contract.clubId ? clubs[p.contract.clubId]?.shortName : 'Free'} · {ageOf(p, year)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Comparison({ a, b, va, vb, clubs, year }: {
  a: Player; b: Player; va: MarketView; vb: MarketView;
  clubs: Record<string, import('../../types/club').Club>; year: number;
}) {
  const bothFull = va.exact && vb.exact;
  const shown = (v: MarketView, key: 'ovr' | 'pot') => v.exact ? v[key] : `${v[key]} ~${v.stars}★`;

  return (
    <>
      {bothFull ? (
        <div className="card p-4"><AttributeRadar attributes={a.attributes} compare={b.attributes} labels={[a.name.last, b.name.last]} /></div>
      ) : (
        <div className="card p-3 text-xs text-slate-400">The full attribute breakdown is certain only for your own players and the global elite — {!va.exact ? a.name.last : b.name.last}{!va.exact && !vb.exact ? ` and ${b.name.last}` : ''}'s figures below are scouting estimates.</div>
      )}

      <div className="card p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-slate-500"><th className="text-left"></th><th className="text-center py-1">{fullName(a)}</th><th className="text-center">{fullName(b)}</th></tr></thead>
          <tbody>
            <Row label="Club" a={a.contract.clubId ? clubs[a.contract.clubId]?.shortName ?? '—' : 'Free'} b={b.contract.clubId ? clubs[b.contract.clubId]?.shortName ?? '—' : 'Free'} />
            <Row label="Position" a={a.position} b={b.position} />
            <Row label="Age" a={ageOf(a, year)} b={ageOf(b, year)} hi={num(-ageOf(a, year), -ageOf(b, year))} />
            <Row label="OVR" a={shown(va, 'ovr')} b={shown(vb, 'ovr')} hi={num(va.ovr, vb.ovr)} />
            <Row label="Potential" a={shown(va, 'pot')} b={shown(vb, 'pot')} hi={num(va.pot, vb.pot)} />
            <Row label="Value" a={formatMoney(va.value)} b={formatMoney(vb.value)} hi={num(va.value, vb.value)} />
            <Row label="Wage" a={formatWage(a.contract.wage)} b={formatWage(b.contract.wage)} />
            {(() => { const ca = career(a), cb = career(b); return (
              <>
                <Row label="Career apps" a={ca.apps} b={cb.apps} hi={num(ca.apps, cb.apps)} />
                <Row label="Career goals" a={ca.goals} b={cb.goals} hi={num(ca.goals, cb.goals)} />
                <Row label="Career assists" a={ca.assists} b={cb.assists} hi={num(ca.assists, cb.assists)} />
                <Row label="Goals / game" a={ca.apps ? (ca.goals / ca.apps).toFixed(2) : '—'} b={cb.apps ? (cb.goals / cb.apps).toFixed(2) : '—'} hi={num(ca.apps ? ca.goals / ca.apps : 0, cb.apps ? cb.goals / cb.apps : 0)} />
              </>
            ); })()}
            <Row label="Height" a={`${a.height_cm}cm`} b={`${b.height_cm}cm`} />
            <Row label="Preferred foot" a={a.preferredFoot} b={b.preferredFoot} />
          </tbody>
        </table>
      </div>

      {bothFull && ATTRIBUTE_GROUPS.map(({ title, gk, group }) => (
        <div key={title} className="card p-4 overflow-x-auto">
          <h3 className="text-sm font-semibold text-slate-400 mb-2">{title}</h3>
          <table className="w-full text-sm">
            <tbody>
              {group.map((key) => {
                const av = Math.round((a.attributes[gk] as Record<string, number>)[key]);
                const bv = Math.round((b.attributes[gk] as Record<string, number>)[key]);
                return <NumRow key={key} label={prettify(key)} a={av} b={bv} />;
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

const num = (a: number, b: number) => (a === b ? 0 : a > b ? -1 : 1);

function Row({ label, a, b, hi = 0 }: { label: string; a: string | number; b: string | number; hi?: number }) {
  return (
    <tr className="border-b border-surface-700/50 last:border-0">
      <td className="text-slate-500 py-1">{label}</td>
      <td className={`text-center ${hi === -1 ? 'text-emerald-400 font-semibold' : ''}`}>{a}</td>
      <td className={`text-center ${hi === 1 ? 'text-emerald-400 font-semibold' : ''}`}>{b}</td>
    </tr>
  );
}
function NumRow({ label, a, b }: { label: string; a: number; b: number }) {
  const hi = num(a, b);
  return (
    <tr className="border-b border-surface-700/50 last:border-0">
      <td className="text-slate-500 py-0.5">{label}</td>
      <td className={`text-center font-mono ${hi === -1 ? 'text-emerald-400 font-semibold' : ''}`}>{a}</td>
      <td className={`text-center font-mono ${hi === 1 ? 'text-emerald-400 font-semibold' : ''}`}>{b}</td>
    </tr>
  );
}
