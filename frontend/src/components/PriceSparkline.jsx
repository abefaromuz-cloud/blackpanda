import { LineChart, Line, ResponsiveContainer } from 'recharts';

// Маленький график без осей — просто линия тренда цены. trend: 'up' | 'down' | 'flat'
export default function PriceSparkline({ points, trend, width = 60, height = 24 }) {
  if (!Array.isArray(points)) return null;
  const clean = points.map(v => Number(v)).filter(v => Number.isFinite(v));
  if (clean.length < 2) return null;
  const data = clean.map((v, i) => ({ i, v }));
  const color = trend === 'up' ? '#22c55e' : trend === 'down' ? '#f43f5e' : '#71717a';
  const icon = trend === 'up' ? '📈' : trend === 'down' ? '📉' : '';

  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span style={{ width, height, display: 'inline-block' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </span>
      {icon && <span className="text-xs">{icon}</span>}
    </span>
  );
}
