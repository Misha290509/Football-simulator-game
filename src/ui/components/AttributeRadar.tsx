import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { Attributes } from '../../types/attributes';

/** Six summarized facets for a compact player radar. */
function facets(a: Attributes) {
  const avg = (vals: number[]) => Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  return [
    { facet: 'Shooting', value: avg([a.technical.finishing, a.technical.shotPower, a.technical.longShots, a.mental.positioning]) },
    { facet: 'Passing', value: avg([a.technical.shortPassing, a.technical.longPassing, a.mental.vision, a.technical.crossing]) },
    { facet: 'Dribbling', value: avg([a.technical.dribbling, a.technical.ballControl, a.physical.agility, a.physical.balance]) },
    { facet: 'Defending', value: avg([a.mental.standingTackle, a.mental.slidingTackle, a.mental.marking, a.mental.interceptions]) },
    { facet: 'Physical', value: avg([a.physical.strength, a.physical.stamina, a.physical.jumping, a.mental.aggression]) },
    { facet: 'Pace', value: avg([a.physical.acceleration, a.physical.sprintSpeed]) },
  ];
}

/**
 * Compact six-facet radar. Pass `compare` (+ optional `labels`) to overlay a
 * second player for side-by-side comparison.
 */
export function AttributeRadar({
  attributes,
  compare,
  labels,
}: {
  attributes: Attributes;
  compare?: Attributes;
  labels?: [string, string];
}) {
  const base = facets(attributes);
  const other = compare ? facets(compare) : null;
  const data = base.map((f, i) => (other ? { facet: f.facet, a: f.value, b: other[i].value } : { facet: f.facet, value: f.value }));
  return (
    <ResponsiveContainer width="100%" height={compare ? 300 : 240}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#2f3a48" />
        <PolarAngleAxis dataKey="facet" tick={{ fill: '#94a3b8', fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        {other ? (
          <>
            <Radar name={labels?.[0] ?? 'A'} dataKey="a" stroke="#4cc78f" fill="#3ba776" fillOpacity={0.4} />
            <Radar name={labels?.[1] ?? 'B'} dataKey="b" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </>
        ) : (
          <Radar dataKey="value" stroke="#4cc78f" fill="#3ba776" fillOpacity={0.45} />
        )}
      </RadarChart>
    </ResponsiveContainer>
  );
}
