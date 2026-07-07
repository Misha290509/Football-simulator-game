import { useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useGameStore, lastSaveId } from '../../state/store';
import { exportSave, importSave } from '../../db/db';

export function MainMenu() {
  const navigate = useNavigate();
  const savesList = useGameStore((s) => s.savesList);
  const refresh = useGameStore((s) => s.refreshSavesList);
  const load = useGameStore((s) => s.load);
  const remove = useGameStore((s) => s.remove);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openSave = async (id: string) => {
    if (await load(id)) navigate('/dashboard');
  };

  const doExport = async (id: string, name: string) => {
    const json = await exportSave(id);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^\w]+/g, '_')}.fgm.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File) => {
    const text = await file.text();
    await importSave(text);
    await refresh();
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6 relative overflow-hidden">
      {/* Faint pitch markings behind the title — pure decoration. */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.05]" aria-hidden>
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[38rem] h-[38rem] rounded-full border-2 border-white" />
      </div>
      <div className="w-full max-w-lg space-y-6 relative">
        <div className="text-center">
          <div className="font-display font-semibold uppercase tracking-widest text-[11px] text-accent-400 mb-2">
            Season 2025/26
          </div>
          <h1 className="font-display font-bold uppercase tracking-wide text-5xl sm:text-6xl text-white leading-none">
            Football <span className="text-accent-400">GM</span>
          </h1>
          <p className="text-slate-400 mt-3">
            Take a club. Build a dynasty.
          </p>
        </div>

        {(() => {
          // Continue = the last-played save if it still exists, else the newest.
          const cont = savesList.find((s) => s.id === lastSaveId()) ?? savesList[0];
          return cont ? (
            <button className="btn-primary w-full py-3 text-base" onClick={() => openSave(cont.id)}>
              ▶ Continue — {cont.name}
            </button>
          ) : null;
        })()}

        <div className="flex gap-2">
          <button className={`${savesList.length ? 'btn-ghost' : 'btn-primary'} flex-1 py-3 text-base`} onClick={() => navigate('/new')}>
            + New Game
          </button>
          <button className="btn-ghost py-3" onClick={() => fileInput.current?.click()}>
            Import save
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = '';
            }}
          />
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">Saved Careers</h2>
          {savesList.length === 0 ? (
            <p className="text-slate-500 text-sm">No saves yet. Start a new game.</p>
          ) : (
            <ul className="space-y-2">
              {savesList.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between bg-surface-700 rounded-md px-3 py-2"
                >
                  <button
                    className="text-left flex-1"
                    onClick={() => openSave(s.id)}
                  >
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-slate-500">
                      {s.managerName} · {new Date(s.createdAt).toLocaleDateString()}
                    </div>
                  </button>
                  <button
                    className="text-slate-400 hover:text-slate-200 text-xs px-2"
                    onClick={() => doExport(s.id, s.name)}
                  >
                    Export
                  </button>
                  <button
                    className="text-red-400 hover:text-red-300 text-xs px-2"
                    onClick={() => remove(s.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-slate-600 text-center">
          Runs entirely in your browser — saves stay on this device. Add to
          your home screen to play it like an app.
        </p>
      </div>
    </div>
  );
}
