import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf } from '../../game/playerCareer';
import { MANAGER_STYLE_LABEL } from '../../game/playerProgression';
import { fullName } from '../format';

/**
 * The Relationships hub — the whole human web of a career in one place: the
 * manager who picks you, the agent who works the phones, the mentor in your
 * corner, the rival for your shirt, and your country. Read-only; the choices
 * that move these bonds happen in the flow (conversations, press, matches).
 */
export function PlayerRelationships() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta);
  const players = useGameStore((s) => s.players);
  const career = playerCareerOf(meta);
  const p = career ? players[career.playerId] : undefined;

  if (!meta || !career || !p) {
    return (
      <div className="p-4">
        <p className="text-slate-400">No active player career.</p>
        <button className="btn-ghost mt-2" onClick={() => navigate('/my-player')}>Back</button>
      </div>
    );
  }

  const rival = career.rival ? players[career.rival.playerId] : undefined;
  const mentor = career.mentor;
  const agent = career.agent;
  const intl = career.international;

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Relationships</h1>
        <span className="text-xs text-slate-500">The people who shape your career</span>
      </div>

      {/* Manager */}
      <div className="card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">🎩 The manager</h2>
          <span className="text-[11px] text-slate-500">{MANAGER_STYLE_LABEL[career.managerStyle ?? 'BALANCED']}</span>
        </div>
        <Meter label="Trust" value={career.managerTrust ?? 50} tone="sky" />
        <Meter label="Relationship" value={career.clubRelationship ?? 50} tone="emerald" />
        {(career.promises ?? []).length > 0 && (
          <div className="text-[11px] text-amber-300 pt-1">
            {(career.promises ?? []).length} open promise{(career.promises ?? []).length === 1 ? '' : 's'} riding on his word.
          </div>
        )}
      </div>

      {/* Mentor */}
      <div className="card p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-300">🤝 Your mentor</h2>
        {mentor ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-200">{mentor.departed ? '🕊️ ' : ''}{mentor.name}</span>
              <span className="text-[11px] text-slate-500">{mentor.departed ? 'moved on' : `since ${mentor.since}`}{mentor.words ? ` · ${mentor.words} word${mentor.words === 1 ? '' : 's'}` : ''}</span>
            </div>
            <Meter label="Bond" value={mentor.bond} tone="amber" />
            <p className="text-[11px] text-slate-500">
              {mentor.departed ? 'A bond you carry with you — one day you’ll pass it on.'
                : mentor.bond >= 85 ? 'Like family now — he’d run through a wall for you.'
                : mentor.bond >= 65 ? 'A trusted voice when it gets hard.'
                : 'Still finding your feet together.'}
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-500">No mentor yet. Early in a career, a senior team-mate may take you under his wing.</p>
        )}
      </div>

      {/* Dressing room */}
      <div className="card p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-300">👥 The dressing room</h2>
        <Meter label="Standing" value={career.dressingRoom?.standing ?? 50} tone="sky" />
        {(career.dressingRoom?.bonds ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(career.dressingRoom!.bonds).map((b) => (
              <span key={b.playerId} className={`text-[11px] px-2 py-0.5 rounded-full border ${b.kind === 'ALLY' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25' : 'bg-rose-500/10 text-rose-300 border-rose-500/25'}`}>
                {b.kind === 'ALLY' ? '🤝' : '⚡'} {b.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">Still settling in — friendships form with time and minutes.</p>
        )}
        <p className="text-[11px] text-slate-500">
          {(career.dressingRoom?.standing ?? 50) >= 78 ? 'One of the leaders in there — your voice carries.'
            : (career.dressingRoom?.standing ?? 50) >= 55 ? 'Well regarded by the group.'
            : (career.dressingRoom?.standing ?? 50) < 40 ? 'Still winning the room over.'
            : 'Finding your place among the lads.'}
        </p>
      </div>

      {/* Rival */}
      <div className="card p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-300">⚔️ Rival for the shirt</h2>
        {rival && career.rival ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-200 truncate">{fullName(rival)} <span className="text-slate-500">({rival.position})</span></span>
              <span className="font-mono text-slate-400">{rival.overall} OVR</span>
            </div>
            <SignedMeter value={career.rival.relationship ?? 0} left="Bitter" right="Respect" />
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>{career.rival.sidelined ? '🚑 He’s sidelined — the shirt is open.' : 'Battle on for the starting spot.'}</span>
              {typeof career.rival.edge === 'number' && career.rival.edge !== 0 && (
                <span>Head-to-head: you’re {career.rival.edge > 0 ? 'ahead' : 'behind'} by {Math.abs(career.rival.edge)}.</span>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500">No direct rival right now — you’re the clear pick in your position.</p>
        )}
      </div>

      {/* Agent */}
      <div className="card p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-300">📞 Your agent</h2>
        {agent ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-200">{agent.name}</span>
              <span className="text-[11px] text-slate-500">{agent.commissionPct}% commission</span>
            </div>
            <Meter label="Relationship" value={agent.relationship} tone="violet" />
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <Mini label="Negotiation" value={agent.negotiation} />
              <Mini label="Network" value={agent.network} />
              <Mini label="Media" value={agent.mediaSavvy} />
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500">No agent signed. Hire one from the Off-Pitch screen to work the market for you.</p>
        )}
      </div>

      {/* Country */}
      <div className="card p-4 space-y-1">
        <h2 className="text-sm font-semibold text-slate-300">🌍 Your country</h2>
        {intl?.capped ? (
          <p className="text-sm text-slate-300">{intl.caps} cap{intl.caps === 1 ? '' : 's'}{intl.intlGoals ? ` · ${intl.intlGoals} goal${intl.intlGoals === 1 ? '' : 's'}` : ''} — a full international.</p>
        ) : (
          <p className="text-xs text-slate-500">Uncapped. Keep performing and the call will come.</p>
        )}
      </div>

      {/* Public */}
      <div className="card p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-300">📣 The public</h2>
        <Meter label="Fan rating" value={career.fanRating ?? 50} tone="rose" />
        <div className="text-[11px] text-slate-500">{(career.following ?? 0).toLocaleString()} following</div>
      </div>

      <button className="btn-ghost w-full" onClick={() => navigate('/my-player')}>Back to My Player</button>
    </div>
  );
}

const TONE: Record<string, string> = {
  sky: 'bg-sky-400', emerald: 'bg-emerald-400', amber: 'bg-amber-400', violet: 'bg-violet-400', rose: 'bg-rose-400',
};

function Meter({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONE }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
        <span>{label}</span><span className="tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 rounded bg-surface-700 overflow-hidden">
        <div className={`h-full ${TONE[tone]}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

/** A −100…+100 meter centred at zero (rival warmth). */
function SignedMeter({ value, left, right }: { value: number; left: string; right: string }) {
  const pct = Math.max(0, Math.min(100, (value + 100) / 2));
  const warm = value >= 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5"><span>{left}</span><span>{right}</span></div>
      <div className="relative h-1.5 rounded bg-surface-700 overflow-hidden">
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-surface-500" />
        <div className={`h-full ${warm ? 'bg-emerald-400 ml-[50%]' : 'bg-rose-400'}`}
          style={warm ? { width: `${pct - 50}%` } : { width: `${50 - pct}%`, marginLeft: `${pct}%` }} />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return <div className="card p-1.5"><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div><div className="text-sm font-semibold text-white tabular-nums">{Math.round(value)}</div></div>;
}
