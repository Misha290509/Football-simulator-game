import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useGameStore } from '../../state/store';
import { formatMoney, formatWage } from '../format';
import { weeklyWageBill } from '../../game/transfers';

export function Finances() {
  const club = useGameStore((s) => s.managerClub())!;
  const players = useGameStore((s) => s.getClubPlayers(club.id));
  const f = club.finances;
  const bill = weeklyWageBill(players);
  const history = club.financeHistory ?? [];

  const stat = (label: string, value: string, sub?: string) => (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="page-title">Finances</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stat('Bank balance', formatMoney(f.balance))}
        {stat('Transfer budget', formatMoney(f.transferBudget))}
        {stat('Wage budget', formatWage(f.wageBudget))}
        {stat('Wages committed', formatWage(bill), `${Math.round((bill / f.wageBudget) * 100)}% of budget`)}
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Balance over time</h2>
        {history.length < 2 ? (
          <p className="text-sm text-slate-500">
            Finance history builds up after each completed season.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: 10 }}>
              <defs>
                <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3ba776" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#3ba776" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(v) => `£${(v / 1_000_000).toFixed(0)}M`}
                width={50}
              />
              <Tooltip
                contentStyle={{ background: '#11161d', border: '1px solid #2f3a48', borderRadius: 6 }}
                formatter={(v: number) => formatMoney(v)}
              />
              <Area type="monotone" dataKey="balance" stroke="#4cc78f" fill="url(#bal)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {history.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">Last season</h2>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-slate-500">Income</div>
              <div className="text-emerald-400 font-semibold">{formatMoney(history[history.length - 1].income)}</div>
            </div>
            <div>
              <div className="text-slate-500">Expenses</div>
              <div className="text-red-400 font-semibold">{formatMoney(history[history.length - 1].expenses)}</div>
            </div>
            <div>
              <div className="text-slate-500">Net</div>
              <div className="font-semibold">
                {formatMoney(history[history.length - 1].income - history[history.length - 1].expenses)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
