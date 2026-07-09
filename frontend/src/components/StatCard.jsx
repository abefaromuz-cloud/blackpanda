const colorMap = {
  text: 'text-text', green: 'text-green', red: 'text-red', yellow: 'text-yellow', accent2: 'text-accent2', purple: 'text-purple',
};

export default function StatCard({ label, value, sub, color = 'text' }) {
  return (
    <div className="card">
      <div className="text-[10px] text-text3 font-bold uppercase tracking-wide mb-2">{label}</div>
      <div className={`text-2xl font-black font-mono ${colorMap[color] || colorMap.text}`}>{value}</div>
      {sub && <div className="text-xs text-text3 mt-1">{sub}</div>}
    </div>
  );
}
