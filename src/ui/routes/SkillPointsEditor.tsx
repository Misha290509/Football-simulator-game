import { useMemo } from 'react';
import type { Attributes, AttributeKey, Position } from '../../types/attributes';
import { TECHNICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, GOALKEEPING_KEYS, POSITION_GROUP } from '../../types/attributes';
import { attributeWeight, flattenAttributes } from '../../engine/ratings';
import {
  ATTR_FLOOR, costTo, pointsSpent, overallOf, recommendedBuild, floorAttributes,
  targetOvrFor, attrCapFor, type MentalityAlloc, MENTALITY_FLOOR, MENTALITY_CAP, MENTALITY_BUDGET, mentalitySpent,
} from '../../game/skillPoints';

const GROUP_KEYS = { technical: TECHNICAL_KEYS, mental: MENTAL_KEYS, physical: PHYSICAL_KEYS, goalkeeping: GOALKEEPING_KEYS } as const;
type Group = keyof typeof GROUP_KEYS;
const groupOf = (k: AttributeKey): Group =>
  (TECHNICAL_KEYS.includes(k) ? 'technical' : MENTAL_KEYS.includes(k) ? 'mental' : PHYSICAL_KEYS.includes(k) ? 'physical' : 'goalkeeping');

const LABEL: Partial<Record<string, string>> = {
  headingAccuracy: 'Heading', shortPassing: 'Short Pass', longPassing: 'Long Pass', fkAccuracy: 'Free Kicks',
  ballControl: 'Ball Control', shotPower: 'Shot Power', longShots: 'Long Shots', sprintSpeed: 'Sprint Speed',
  standingTackle: 'Standing Tackle', slidingTackle: 'Sliding Tackle', gkDiving: 'Diving', gkHandling: 'Handling',
  gkKicking: 'Kicking', gkPositioning: 'GK Positioning', gkReflexes: 'Reflexes',
};
const pretty = (k: string): string => LABEL[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

const setAttr = (a: Attributes, k: AttributeKey, v: number): Attributes => {
  const g = groupOf(k);
  return { ...a, [g]: { ...(a[g] as Record<string, number>), [k]: v } };
};

export interface SkillState { attributes: Attributes; mentality: MentalityAlloc }

export function SkillPointsEditor({
  position, archetype, clubReputation, state, onChange,
}: {
  position: Position; archetype: string; clubReputation: number;
  state: SkillState; onChange: (s: SkillState) => void;
}) {
  const cap = attrCapFor(archetype);
  const target = targetOvrFor(archetype, clubReputation);
  const budget = useMemo(() => Math.round(pointsSpent(recommendedBuild(position, target, cap)) * 1.06), [position, target, cap]);

  const flat = flattenAttributes(state.attributes);
  const spent = pointsSpent(state.attributes);
  const remaining = budget - spent;
  const ovr = overallOf(state.attributes, position);

  const groups: Group[] = POSITION_GROUP[position] === 'GK' ? ['goalkeeping', 'mental', 'physical'] : ['technical', 'mental', 'physical'];

  const setValue = (k: AttributeKey, next: number) => {
    const cur = flat[k] ?? ATTR_FLOOR;
    let v = Math.max(ATTR_FLOOR, Math.min(cap, Math.round(next)));
    // Clamp to what the remaining pool can afford (raising only).
    if (v > cur) {
      const affordable = budget - (spent - costTo(cur)); // budget freed of this attr's cost
      while (v > cur && costTo(v) > affordable) v--;
    }
    if (v !== cur) onChange({ ...state, attributes: setAttr(state.attributes, k, v) });
  };

  const setMentality = (k: keyof MentalityAlloc, next: number) => {
    const v = Math.max(MENTALITY_FLOOR, Math.min(MENTALITY_CAP, Math.round(next)));
    const cand = { ...state.mentality, [k]: v };
    if (mentalitySpent(cand) <= MENTALITY_BUDGET) onChange({ ...state, mentality: cand });
  };

  const mentRemaining = MENTALITY_BUDGET - mentalitySpent(state.mentality);

  return (
    <div className="space-y-4">
      {/* Header: pool + live OVR */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="uppercase tracking-wide text-slate-500">Skill points</span>
            <span className={`font-mono ${remaining < 0 ? 'text-rose-400' : 'text-slate-300'}`}>{remaining} left of {budget}</span>
          </div>
          <div className="h-2 rounded bg-surface-700 overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, (spent / budget) * 100))}%` }} />
          </div>
        </div>
        <div className="text-center shrink-0 w-16">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Start OVR</div>
          <div className="text-2xl font-bold text-white tabular-nums">{ovr}</div>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" className="btn-ghost text-xs" onClick={() => onChange({ ...state, attributes: recommendedBuild(position, target, cap) })}>Recommended build</button>
        <button type="button" className="btn-ghost text-xs" onClick={() => onChange({ ...state, attributes: floorAttributes() })}>Reset to zero</button>
      </div>
      <p className="text-[11px] text-slate-500">★ marks the attributes your position is rated on — investing there raises your OVR fastest. Points elsewhere buy versatility.</p>

      {/* Attribute groups */}
      {groups.map((g) => (
        <div key={g} className="card p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">{g}</div>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {GROUP_KEYS[g].map((k) => {
              const v = flat[k] ?? ATTR_FLOOR;
              const key = attributeWeight(position, k) > 0;
              return (
                <div key={k} className="flex items-center gap-2">
                  <span className={`text-xs w-28 shrink-0 truncate ${key ? 'text-amber-300' : 'text-slate-400'}`}>{key ? '★ ' : ''}{pretty(k)}</span>
                  <input type="range" min={ATTR_FLOOR} max={cap} value={v} onChange={(e) => setValue(k, Number(e.target.value))} className="flex-1 accent-accent" />
                  <span className="text-xs font-mono w-6 text-right text-slate-300">{v}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Mentality pool */}
      <div className="card p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide text-slate-400">Mentality</div>
          <span className="text-[11px] font-mono text-slate-400">{mentRemaining} left of {MENTALITY_BUDGET}</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
          {(['consistency', 'bigGame', 'professionalism', 'durability'] as (keyof MentalityAlloc)[]).map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-xs w-28 shrink-0 truncate text-slate-400">{k === 'bigGame' ? 'Big-Game' : pretty(k)}</span>
              <input type="range" min={MENTALITY_FLOOR} max={MENTALITY_CAP} value={state.mentality[k]} onChange={(e) => setMentality(k, Number(e.target.value))} className="flex-1 accent-fuchsia-400" />
              <span className="text-xs font-mono w-6 text-right text-slate-300">{state.mentality[k]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
