import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import type { DevelopmentPoint } from '../../types/player';

export function DevelopmentChart({ log }: { log: DevelopmentPoint[] }) {
  if (log.length < 2) {
    return <p className="text-sm text-slate-500">Development history builds up over seasons.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={log} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 11 }} />
        <YAxis domain={[40, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: '#11161d', border: '1px solid #2f3a48', borderRadius: 6 }}
          labelStyle={{ color: '#94a3b8' }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="pot" name="Potential" stroke="#64748b" strokeDasharray="4 3" dot={false} />
        <Line type="monotone" dataKey="ovr" name="Overall" stroke="#4cc78f" strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
