import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { getActiveDataset, isRealDataset } from '../../data/activeDataset';
import type { Dataset } from '../../types/dataset';
import { CrestBadge } from '../components/Rating';

const START_YEAR = 2025;
const SEASON_LABEL = `${START_YEAR}/${((START_YEAR + 1) % 100).toString().padStart(2, '0')}`;

export function NewGame() {
  const navigate = useNavigate();
  const newGame = useGameStore((s) => s.newGame);

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [countryId, setCountryId] = useState<string>('');
  const [managerName, setManagerName] = useState('');
  const [selectedClub, setSelectedClub] = useState<string | null>(null);
  const [seedText, setSeedText] = useState('');
  const [difficulty, setDifficulty] = useState<'RELAXED' | 'NORMAL' | 'HARD'>('NORMAL');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getActiveDataset().then((d) => {
      setDataset(d);
      setCountryId(d.countries[0]?.id ?? '');
    });
  }, []);

  const country = useMemo(
    () => dataset?.countries.find((c) => c.id === countryId),
    [dataset, countryId],
  );

  if (!dataset || !country) {
    return <div className="p-6 text-slate-400">Loading dataset…</div>;
  }

  const canStart = managerName.trim().length > 0 && selectedClub !== null && !busy;

  const start = async () => {
    if (!canStart || !selectedClub) return;
    setBusy(true);
    try {
      const seed = seedText.trim() ? Number(seedText) || hashStr(seedText) : undefined;
      await newGame({
        saveName: `${managerName.trim()} — ${selectedClub}`,
        managerName: managerName.trim(),
        dataset,
        managerClubId: `club_${countryId}_${selectedClub}`,
        startYear: START_YEAR,
        seed,
        difficulty,
      });
      navigate('/dashboard');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">New Game</h1>
        <button className="btn-ghost" onClick={() => navigate('/')}>Cancel</button>
      </div>

      <div className="card p-4 space-y-3">
        <label className="block text-sm">
          <span className="text-slate-400">Manager name</span>
          <input
            className="mt-1 w-full bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm"
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            placeholder="e.g. Alex Hunter"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-400">Country</span>
          <select
            className="mt-1 w-full bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm"
            value={countryId}
            onChange={(e) => { setCountryId(e.target.value); setSelectedClub(null); }}
          >
            {dataset.countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <div className="block text-sm">
          <span className="text-slate-400">Challenge</span>
          <div className="mt-1 flex gap-2">
            {(['RELAXED', 'NORMAL', 'HARD'] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={difficulty === d ? 'btn-primary flex-1 capitalize' : 'btn-ghost flex-1 capitalize'}
                onClick={() => setDifficulty(d)}
              >{d.toLowerCase()}</button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {difficulty === 'RELAXED' ? 'Bigger starting budget and a patient board.'
              : difficulty === 'HARD' ? 'Tighter budget and a demanding board — sackings come quicker.'
              : 'A balanced start.'}
          </p>
        </div>
        <label className="block text-sm">
          <span className="text-slate-400">Seed (optional, for reproducible worlds)</span>
          <input
            className="mt-1 w-full bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm font-mono"
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            placeholder="leave blank for random"
          />
        </label>
        <div className="text-xs text-slate-500">
          Dataset: <strong>{dataset.name}</strong> · Season {SEASON_LABEL}
          {isRealDataset(dataset) && <span className="ml-2 text-emerald-400">✓ real players</span>}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Choose your club — {country.name}</h2>
        {country.leagues.map((lg) => (
          <div key={lg.tier} className="mb-4">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">{lg.name}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {lg.clubs.map((c) => (
                <button
                  key={c.abbrev}
                  onClick={() => setSelectedClub(c.abbrev)}
                  className={`flex items-center gap-2 px-2 py-2 rounded-md border text-left ${
                    selectedClub === c.abbrev
                      ? 'border-accent bg-accent/10'
                      : 'border-surface-600 hover:bg-surface-700'
                  }`}
                >
                  <CrestBadge abbrev={c.abbrev} color={c.primaryColor ?? '#3ba776'} size={24} />
                  <span className="text-sm truncate">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button className="btn-primary w-full py-3" disabled={!canStart} onClick={start}>
        {busy ? 'Building world…' : 'Start Career'}
      </button>
    </div>
  );
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
