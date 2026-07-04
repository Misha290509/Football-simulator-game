import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { Rating } from '../components/Rating';
import { fullName, formatMoney } from '../format';

export function Sandbox() {
  const navigate = useNavigate();
  const club = useGameStore((s) => s.managerClub())!;
  const players = useGameStore((s) => s.getClubPlayers(club.id));
  const meta = useGameStore((s) => s.meta);
  const setGodMode = useGameStore((s) => s.setGodMode);
  const addFunds = useGameStore((s) => s.godAddFunds);
  const healSquad = useGameStore((s) => s.godHealSquad);
  const boost = useGameStore((s) => s.godBoostPlayer);
  const [toast, setToast] = useState<string | null>(null);

  const enabled = !!meta?.godModeEnabled;
  const everUsed = !!meta?.godModeUsed;

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const sorted = [...players].sort((a, b) => b.overall - a.overall);

  const enable = async () => {
    const ok = window.confirm(
      'Are you sure you want to turn on God Mode?\n\n' +
      'This unlocks sandbox tools (add funds, heal your squad, boost ratings, force signings). ' +
      'Once used, this save will be permanently marked as having used God Mode — that record can never be removed.',
    );
    if (!ok) return;
    await setGodMode(true);
    flash('God Mode enabled.');
  };

  const disable = async () => {
    await setGodMode(false);
    flash('God Mode disabled.');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-white">God Mode</h1>
        {enabled && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/40">
            ON
          </span>
        )}
      </div>
      <p className="text-sm text-slate-500">
        Sandbox tools for {club.name}. Changes apply immediately and persist to the save.
      </p>

      {everUsed && (
        <div className="card p-3 border-amber-500/40 bg-amber-500/5 text-sm text-amber-300">
          ⚠ This save has used God Mode. This is a permanent record and cannot be undone.
        </div>
      )}

      {!enabled ? (
        <div className="card p-6 text-center space-y-3">
          <p className="text-sm text-slate-400">
            God Mode is currently <strong className="text-white">off</strong>. Turn it on to unlock the sandbox tools.
          </p>
          <button className="btn-primary" onClick={enable}>Enable God Mode</button>
        </div>
      ) : (
        <>
          <div className="card p-4 flex flex-wrap gap-2 items-center">
            <button className="btn-primary" onClick={async () => { await addFunds(50_000_000); flash('+£50M added.'); }}>
              + £50M funds
            </button>
            <button className="btn-primary" onClick={async () => { await addFunds(250_000_000); flash('+£250M added.'); }}>
              + £250M funds
            </button>
            <button className="btn-ghost" onClick={async () => { await healSquad(); flash('Squad healed & rested.'); }}>
              Heal &amp; rest squad
            </button>
            <button className="btn-ghost ml-auto" onClick={disable}>Turn off God Mode</button>
            <span className="w-full text-right text-sm text-slate-400">Balance: {formatMoney(club.finances.balance)}</span>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-3">Boost players</h2>
            <div className="space-y-1">
              {sorted.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-1 border-b border-surface-700 last:border-0 text-sm">
                  <button className="text-left flex-1 hover:underline" onClick={() => navigate(`/player/${p.id}`)}>
                    <span className="font-mono text-slate-500 w-8 inline-block">{p.position}</span>
                    {fullName(p)}
                  </button>
                  <div className="flex items-center gap-3">
                    <Rating value={p.overall} />
                    <button className="btn-ghost text-xs px-2 py-0.5" onClick={() => boost(p.id, 1)}>+1</button>
                    <button className="btn-ghost text-xs px-2 py-0.5" onClick={() => boost(p.id, 5)}>+5</button>
                    <button className="btn-ghost text-xs px-2 py-0.5" onClick={() => boost(p.id, -5)}>−5</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-600">
            Tip: open any rival player's profile and use “Force sign (free)” to add them instantly.
          </p>
        </>
      )}

      {toast && <div className="fixed bottom-6 right-6 card px-4 py-3 text-sm shadow-lg border-accent">{toast}</div>}
    </div>
  );
}
