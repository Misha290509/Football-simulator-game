import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { getActiveDataset, isRealDataset } from '../../data/activeDataset';
import type { Dataset } from '../../types/dataset';
import type { Position } from '../../types/attributes';
import type { Foot } from '../../types/player';
import { CrestBadge } from '../components/Rating';
import { CHALLENGES, challengeById, pickChallengeClub } from '../../game/challenges';
import { PLAYER_ARCHETYPES } from '../../game/playerCareer';
import { YOUTH_POSITIONS } from '../../engine/academy';
import { POSITION_LABEL } from '../../engine/lineup';
import { SkillPointsEditor, type SkillState } from './SkillPointsEditor';
import { recommendedBuild, floorMentality, targetOvrFor, attrCapFor } from '../../game/skillPoints';
import { CELEBRATIONS, RITUALS, MAX_RITUALS } from '../../game/playerIdentity';
import { DIFFICULTY_PRESETS, CHALLENGES as PLAYER_CHALLENGES, type Difficulty as PlayerDifficulty, type ChallengeId as PlayerChallengeId } from '../../game/metaGame';

const START_YEAR = 2025;
const SEASON_LABEL = `${START_YEAR}/${((START_YEAR + 1) % 100).toString().padStart(2, '0')}`;

type Mode = 'MANAGER' | 'PLAYER';

export function NewGame() {
  const navigate = useNavigate();
  const newGame = useGameStore((s) => s.newGame);
  const newPlayerCareer = useGameStore((s) => s.newPlayerCareer);

  const [mode, setMode] = useState<Mode>('MANAGER');
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [countryId, setCountryId] = useState<string>('');
  const [managerName, setManagerName] = useState('');
  const [selectedClub, setSelectedClub] = useState<string | null>(null);
  const [seedText, setSeedText] = useState('');
  const [difficulty, setDifficulty] = useState<'RELAXED' | 'NORMAL' | 'HARD'>('NORMAL');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [customOn, setCustomOn] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customAbbrev, setCustomAbbrev] = useState('');
  const [customColor, setCustomColor] = useState('#1e88e5');
  const [busy, setBusy] = useState(false);

  // Player-mode identity.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState<Position>('ST');
  const [foot, setFoot] = useState<Foot>('R');
  const [archetype, setArchetype] = useState<string>(PLAYER_ARCHETYPES[0].id);
  const [skill, setSkill] = useState<SkillState | null>(null);
  // Backstory
  const [hometown, setHometown] = useState('');
  const [nationality, setNationality] = useState('');
  const [boyhoodClub, setBoyhoodClub] = useState('');
  const [celebration, setCelebration] = useState('knee_slide');
  const [rituals, setRituals] = useState<string[]>([]);
  const [pcDifficulty, setPcDifficulty] = useState<PlayerDifficulty>('REALISTIC');
  const [pcChallenge, setPcChallenge] = useState<PlayerChallengeId | null>(null);

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

  // Reputation of the selected club — anchors the skill-point budget/start OVR.
  const selectedClubRep = useMemo(() => {
    if (!dataset || !selectedClub) return 65;
    const ctry = dataset.countries.find((c) => c.id === countryId);
    for (const lg of ctry?.leagues ?? []) {
      const c = lg.clubs.find((x) => x.abbrev === selectedClub);
      if (c) return c.reputation;
    }
    return 65;
  }, [dataset, countryId, selectedClub]);

  // (Re)seed the allocation with the recommended build whenever the basis
  // (position / archetype / club) changes; keep any mentality choices.
  useEffect(() => {
    if (mode !== 'PLAYER') return;
    setSkill((s) => ({
      attributes: recommendedBuild(position, targetOvrFor(archetype, selectedClubRep), attrCapFor(archetype)),
      mentality: s?.mentality ?? floorMentality(),
    }));
  }, [mode, position, archetype, selectedClubRep]);

  if (!dataset || !country) {
    return <div className="p-6 text-slate-400">Loading dataset…</div>;
  }

  const isPlayer = mode === 'PLAYER';

  // A picked challenge (manager mode only) pins country, club and difficulty.
  const challenge = !isPlayer ? challengeById(challengeId ?? undefined) : undefined;
  const challengeClub = challenge ? pickChallengeClub(challenge, dataset) : null;
  const effAbbrev = challenge ? challengeClub?.abbrev ?? null : selectedClub;
  const effCountryId = challenge ? challenge.countryId : countryId;

  const canStart = isPlayer
    ? firstName.trim().length > 0 && lastName.trim().length > 0 && effAbbrev !== null && !busy
    : managerName.trim().length > 0 && effAbbrev !== null && !busy;

  const start = async () => {
    if (!canStart || !effAbbrev) return;
    setBusy(true);
    try {
      const seed = seedText.trim() ? Number(seedText) || hashStr(seedText) : undefined;
      const clubId = `club_${effCountryId}_${effAbbrev}`;
      if (isPlayer) {
        await newPlayerCareer({
          saveName: `${firstName.trim()} ${lastName.trim()} — ${effAbbrev}`,
          dataset,
          clubId,
          startYear: START_YEAR,
          seed,
          origin: 'CREATED',
          playerName: { first: firstName.trim(), last: lastName.trim() },
          position,
          preferredFoot: foot,
          archetype,
          customAttributes: skill?.attributes,
          mentality: skill?.mentality,
          nationality: nationality || undefined,
          hometown: hometown.trim() || undefined,
          boyhoodClub: boyhoodClub || undefined,
          celebration,
          rituals,
          challenge: pcChallenge,
          dials: DIFFICULTY_PRESETS[pcDifficulty].dials,
        });
        navigate('/my-player');
      } else {
        await newGame({
          saveName: `${managerName.trim()} — ${effAbbrev}`,
          managerName: managerName.trim(),
          dataset,
          managerClubId: clubId,
          startYear: START_YEAR,
          seed,
          difficulty: challenge ? challenge.difficulty : difficulty,
          challengeId: challenge?.id,
          customClub: customOn ? { name: customName, shortName: customName, abbrev: customAbbrev, primaryColor: customColor } : undefined,
        });
        navigate('/dashboard');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">New Game</h1>
        <button className="btn-ghost" onClick={() => navigate('/')}>Cancel</button>
      </div>

      {/* Career mode */}
      <div className="card p-4">
        <h2 className="section-title mb-1">Career mode</h2>
        <p className="text-xs text-slate-500 mb-3">Run a club as manager, or live the career of a single player.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('MANAGER')}
            className={`text-left p-3 rounded-lg border transition-colors ${mode === 'MANAGER' ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}
          >
            <div className="font-display font-semibold uppercase tracking-wide text-white">Manager</div>
            <div className="text-xs text-slate-400">Pick squads, sign players, chase trophies.</div>
          </button>
          <button
            type="button"
            onClick={() => setMode('PLAYER')}
            className={`text-left p-3 rounded-lg border transition-colors ${mode === 'PLAYER' ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}
          >
            <div className="font-display font-semibold uppercase tracking-wide text-white">Player</div>
            <div className="text-xs text-slate-400">Create a footballer and make your name.</div>
          </button>
        </div>
      </div>

      {/* Challenges — manager mode only */}
      {!isPlayer && (
        <div className="card p-4">
          <h2 className="section-title mb-1">Challenges</h2>
          <p className="text-xs text-slate-500 mb-3">Pre determined challanges to make it more exciting.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {CHALLENGES.map((c) => (
              <button
                key={c.id}
                onClick={() => setChallengeId(challengeId === c.id ? null : c.id)}
                className={`text-left p-3 rounded-lg border transition-colors ${challengeId === c.id ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}
              >
                <div className="font-display font-semibold uppercase tracking-wide text-white">{c.name}</div>
                <div className="text-xs text-accent-400 mb-1">{c.tagline}</div>
                <div className="text-xs text-slate-400">{c.brief}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1.5">
                  {c.difficulty.toLowerCase()} · {c.seasons} season{c.seasons > 1 ? 's' : ''}{c.rule === 'NO_SIGNINGS' ? ' · no signings' : ''}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card p-4 space-y-3">
        {isPlayer ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-slate-400">First name</span>
                <input className="mt-1 w-full bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Alex" />
              </label>
              <label className="block text-sm">
                <span className="text-slate-400">Last name</span>
                <input className="mt-1 w-full bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Hunter" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-slate-400">Position</span>
                <select className="mt-1 w-full bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm" value={position} onChange={(e) => setPosition(e.target.value as Position)}>
                  {YOUTH_POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABEL[p] ?? p}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-400">Preferred foot</span>
                <select className="mt-1 w-full bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm" value={foot} onChange={(e) => setFoot(e.target.value as Foot)}>
                  <option value="R">Right</option>
                  <option value="L">Left</option>
                  <option value="B">Both</option>
                </select>
              </label>
            </div>
            <div className="block text-sm">
              <span className="text-slate-400">Archetype</span>
              <div className="mt-1 grid sm:grid-cols-2 gap-2">
                {PLAYER_ARCHETYPES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setArchetype(a.id)}
                    className={`text-left p-2 rounded-md border text-sm ${archetype === a.id ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}
                  >
                    <div className="font-medium text-white">{a.id}</div>
                    <div className="text-xs text-slate-400">{a.blurb}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <label className="block text-sm">
            <span className="text-slate-400">Manager name</span>
            <input className="mt-1 w-full bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm" value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="e.g. Alex Hunter" />
          </label>
        )}

        {challenge && (
          <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm flex items-center gap-3">
            {challengeClub && <CrestBadge abbrev={challengeClub.abbrev} color={challengeClub.primaryColor ?? '#3ba776'} size={30} />}
            <div>
              <div className="font-semibold text-white">{challenge.name} — {challengeClub?.name ?? '…'}</div>
              <div className="text-xs text-slate-400">Club, country and difficulty are set by the challenge ({challenge.difficulty.toLowerCase()}).</div>
            </div>
          </div>
        )}
        {!challenge && (
          <label className="block text-sm">
            <span className="text-slate-400">Country</span>
            <select
              className="mt-1 w-full bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm"
              value={countryId}
              onChange={(e) => { setCountryId(e.target.value); setSelectedClub(null); }}
            >
              {dataset.countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        {!challenge && !isPlayer && (
          <div className="block text-sm">
            <span className="text-slate-400">Difficulty</span>
            <div className="mt-1 flex gap-2">
              {(['RELAXED', 'NORMAL', 'HARD'] as const).map((d) => (
                <button key={d} type="button" className={difficulty === d ? 'btn-primary flex-1 capitalize' : 'btn-ghost flex-1 capitalize'} onClick={() => setDifficulty(d)}>{d.toLowerCase()}</button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {difficulty === 'RELAXED' ? 'Bigger starting budget and a patient board.'
                : difficulty === 'HARD' ? 'Tighter budget and a demanding board — sackings come quicker.'
                : 'A balanced start.'}
            </p>
          </div>
        )}
        <label className="block text-sm">
          <span className="text-slate-400">Seed (optional, for reproducible worlds)</span>
          <input className="mt-1 w-full bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm font-mono" value={seedText} onChange={(e) => setSeedText(e.target.value)} placeholder="leave blank for random" />
        </label>
        {!challenge && (
          <div className="text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={customOn} onChange={(e) => setCustomOn(e.target.checked)} /><span className="text-slate-400">Rebrand my club (custom name &amp; colours)</span></label>
            {customOn && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input className="bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm w-48" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Club name" />
                <input className="bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm w-24" value={customAbbrev} onChange={(e) => setCustomAbbrev(e.target.value.toUpperCase().slice(0, 3))} placeholder="ABB" maxLength={3} />
                <input type="color" className="h-9 w-12 rounded border border-surface-600 bg-surface-700" value={customColor} onChange={(e) => setCustomColor(e.target.value)} title="Primary colour" />
                <span className="text-xs text-slate-500">Leave name blank to keep the club's own.</span>
              </div>
            )}
          </div>
        )}
        <div className="text-xs text-slate-500">
          Dataset: <strong>{dataset.name}</strong> · Season {SEASON_LABEL}
          {isRealDataset(dataset) && <span className="ml-2 text-emerald-400">✓ real players</span>}
        </div>
      </div>

      {!challenge && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">
            {isPlayer ? `Choose your club — ${country.name}` : `Choose your club — ${country.name}`}
          </h2>
          {isPlayer && <p className="text-xs text-slate-500 mb-3">You’ll start in this club’s academy, fighting for a place in the first team.</p>}
          {country.leagues.map((lg) => (
            <div key={lg.tier} className="mb-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">{lg.name}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {lg.clubs.map((c) => (
                  <button
                    key={c.abbrev}
                    onClick={() => setSelectedClub(c.abbrev)}
                    className={`flex items-center gap-2 px-2 py-2 rounded-md border text-left ${selectedClub === c.abbrev ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}
                  >
                    <CrestBadge abbrev={c.abbrev} color={c.primaryColor ?? '#3ba776'} size={24} />
                    <span className="text-sm truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Backstory — who he is beyond the numbers */}
      {isPlayer && effAbbrev && (
        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 mb-1">Your story</h2>
          <p className="text-xs text-slate-500">Where you're from and who you grew up supporting follow you for a whole career — come home one day, or sign for their rivals and never be forgiven.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="text-xs text-slate-400">Hometown</span>
              <input className="mt-1 w-full bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm" placeholder="e.g. Salford" value={hometown} onChange={(e) => setHometown(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-slate-400">Nationality</span>
              <select className="mt-1 w-full bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm" value={nationality} onChange={(e) => setNationality(e.target.value)}>
                <option value="">{country.name} (default)</option>
                {dataset.countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs text-slate-400">Boyhood club</span>
              <select className="mt-1 w-full bg-surface-700 border border-surface-600 rounded-md px-3 py-2 text-sm" value={boyhoodClub} onChange={(e) => setBoyhoodClub(e.target.value)}>
                <option value="">Your new club</option>
                {country.leagues.flatMap((lg) => lg.clubs).map((c) => <option key={c.abbrev} value={c.name}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1.5">Signature celebration</div>
            <div className="grid sm:grid-cols-3 gap-2">
              {CELEBRATIONS.map((c) => (
                <button key={c.id} type="button" onClick={() => setCelebration(c.id)}
                  className={`text-left p-2 rounded-lg border ${celebration === c.id ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}>
                  <div className="text-sm text-white">{c.emoji} {c.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{c.blurb}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1.5">Superstitions <span className="text-slate-600">(up to {MAX_RITUALS} — break the routine and you start a match off-rhythm)</span></div>
            <div className="flex flex-wrap gap-2">
              {RITUALS.map((r) => {
                const on = rituals.includes(r.id);
                return (
                  <button key={r.id} type="button" title={r.blurb}
                    onClick={() => setRituals((rs) => on ? rs.filter((x) => x !== r.id) : rs.length < MAX_RITUALS ? [...rs, r.id] : rs)}
                    className={`text-xs px-2.5 py-1.5 rounded-full border ${on ? 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-200' : 'border-surface-600 text-slate-400 hover:bg-surface-700'}`}>
                    {on ? '🧿 ' : ''}{r.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* How you want to play it — difficulty & a scenario */}
      {isPlayer && (
        <div className="card p-4 space-y-4">
          <div>
            <div className="text-xs text-slate-400 mb-1.5">Difficulty & realism</div>
            <div className="grid sm:grid-cols-3 gap-2">
              {(Object.keys(DIFFICULTY_PRESETS) as PlayerDifficulty[]).map((d) => (
                <button key={d} type="button" onClick={() => setPcDifficulty(d)}
                  className={`text-left p-2.5 rounded-md border text-sm ${pcDifficulty === d ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}>
                  <div className="font-medium">{DIFFICULTY_PRESETS[d].label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{DIFFICULTY_PRESETS[d].blurb}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1.5">
              Scenario <span className="text-slate-600">(optional — a deliberately hard hand with a stated goal)</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <button type="button" onClick={() => setPcChallenge(null)}
                className={`text-left p-2.5 rounded-md border text-sm ${pcChallenge === null ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}>
                <div className="font-medium">No scenario</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Just play. Let the career be whatever it turns out to be.</div>
              </button>
              {PLAYER_CHALLENGES.map((c) => (
                <button key={c.id} type="button" onClick={() => setPcChallenge(c.id)}
                  className={`text-left p-2.5 rounded-md border text-sm ${pcChallenge === c.id ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}>
                  <div className="font-medium">{c.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{c.blurb}</div>
                  <div className="text-[10px] text-emerald-300/80 mt-1">Goal: {c.goal}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Build your player — skill-point allocation */}
      {isPlayer && effAbbrev && skill && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-1">Build your player</h2>
          <p className="text-xs text-slate-500 mb-3">Spend your skill points — your archetype and club set the budget. This is <em>your</em> player: specialise for a higher rating, or spread out for versatility.</p>
          <SkillPointsEditor position={position} archetype={archetype} clubReputation={selectedClubRep} state={skill} onChange={setSkill} />
        </div>
      )}

      <button className="btn-primary w-full py-3" disabled={!canStart} onClick={start}>
        {busy ? 'Building world…' : isPlayer ? 'Start Player Career' : challenge ? `Start Challenge: ${challenge.name}` : 'Start Career'}
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
