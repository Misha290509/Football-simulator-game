import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf } from '../../game/playerCareer';
import { availablePaths, PATH_BY_ID, childSummary, type EpiloguePath } from '../../game/afterCareer';
import { fullName } from '../format';

/**
 * The life after football — the part career modes usually throw away. Pick a
 * path, then live it a year at a time: the beats, the statue, the Hall of Fame,
 * and a son with the worst surname in the game to carry.
 */
export function AfterCareer() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta);
  const players = useGameStore((s) => s.players);
  const season = useGameStore((s) => s.currentSeason());
  const chooseEpilogue = useGameStore((s) => s.chooseEpilogue);
  const advanceEpilogue = useGameStore((s) => s.advanceEpilogue);
  const career = playerCareerOf(meta) ?? meta?.playerCareer;
  const p = career ? players[career.playerId] : undefined;
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!meta || !career || !p) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-slate-400">This save isn’t a player career.</p>
        <button className="btn-primary" onClick={() => navigate('/dashboard')}>Go to dashboard</button>
      </div>
    );
  }

  if (!career.retirement?.retiredDay) {
    return (
      <div className="p-6 space-y-3 max-w-2xl mx-auto">
        <h1 className="text-xl font-bold">After football</h1>
        <p className="text-slate-400 text-sm">
          You are still playing. This screen opens the day you stop — and there is a great deal more of it than
          most people expect.
        </p>
        <button className="btn-ghost" onClick={() => navigate('/legacy')}>Go to Legacy</button>
      </div>
    );
  }

  const ep = career.epilogue;
  const baseYear = season?.year ?? meta.startYear;
  const year = ep ? ep.since + ep.years : baseYear;
  const paths = availablePaths(career);

  const pick = async (path: EpiloguePath) => {
    setBusy(true);
    setToast(await chooseEpilogue(path));
    setBusy(false);
  };
  const step = async () => {
    setBusy(true);
    setToast(await advanceEpilogue());
    setBusy(false);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold">After football</h1>
        <p className="text-xs text-slate-500">{fullName(p)} · retired</p>
      </div>

      {!ep && (
        <>
          <p className="text-sm text-slate-300">
            The boots are hung up and the phone is still ringing. What happens now is the longest part of a
            footballer’s life, and almost nobody prepares for it.
          </p>
          <div className="space-y-2">
            {paths.map((id) => {
              const info = PATH_BY_ID[id];
              return (
                <button
                  key={id}
                  disabled={busy}
                  className="card p-4 w-full text-left hover:border-emerald-500/40 disabled:opacity-50"
                  onClick={() => void pick(id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-200">{info.label}</span>
                    <span className="text-[11px] text-slate-500 whitespace-nowrap">
                      {info.income > 0 ? `£${Math.round(info.income / 1000)}k/yr` : 'no income'}
                      {info.inGame ? ' · in the game' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{info.blurb}</p>
                </button>
              );
            })}
          </div>
        </>
      )}

      {ep && (
        <>
          <div className="card p-4 space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">{PATH_BY_ID[ep.path].label}</h2>
              <span className="text-[11px] text-slate-500">{ep.years} year{ep.years === 1 ? '' : 's'} · {year}</span>
            </div>
            <p className="text-xs text-slate-400">{PATH_BY_ID[ep.path].blurb}</p>
            {ep.earned > 0 && (
              <p className="text-[11px] text-slate-500">£{Math.round(ep.earned / 1000).toLocaleString()}k earned since he stopped playing.</p>
            )}
          </div>

          {career.statue && (
            <div className="card p-3 border border-amber-500/30 bg-amber-500/5 text-sm text-amber-200">
              🗿 A statue of him stands outside {career.statue.clubName}, unveiled in {career.statue.year}.
            </div>
          )}

          {career.hallOfFame && (
            <div className="card p-3 border border-violet-500/30 bg-violet-500/5 text-sm text-violet-200">
              🏛️ Hall of Fame, {career.hallOfFame.year}
              {career.hallOfFame.inductedBy ? ` — inducted by ${career.hallOfFame.inductedBy}.` : '.'}
            </div>
          )}

          {career.child && (
            <div className="card p-4 space-y-1">
              <h2 className="text-sm font-semibold text-slate-300">👦 {career.child.name}</h2>
              <p className="text-xs text-slate-400">{childSummary(career.child, year)}</p>
            </div>
          )}

          <button className="btn-primary w-full" disabled={busy} onClick={() => void step()}>
            {busy ? 'A year passes…' : 'Live another year'}
          </button>
          <p className="text-[11px] text-slate-500 text-center">
            Everything that happens goes to your inbox, as it always did.
          </p>
        </>
      )}

      {toast && <div className="card p-3 text-sm text-emerald-300 border border-emerald-500/30">{toast}</div>}

      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={() => navigate('/inbox')}>Inbox</button>
        <button className="btn-ghost flex-1" onClick={() => navigate('/legacy')}>Legacy</button>
      </div>
    </div>
  );
}
