export default function StatCard({ icon, label, value, color = "#7c6fff" }) {
  return (
    <div className="stat-card" style={{ "--stat-color": color }}>
      <div className="stat-icon">{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
    </div>
  );
}
