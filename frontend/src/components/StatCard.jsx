export default function StatCard({ icon, label, value, color = "#7c6fff" }) {
  return (
    <div
      className="bg-[#16162a] border border-[#252545] rounded-2xl p-5 flex items-center gap-4 hover:border-[#353560] transition-all duration-200"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="text-3xl shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-[#8888aa] font-medium mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-[#e8e8f4]">{value}</p>
      </div>
    </div>
  );
}
