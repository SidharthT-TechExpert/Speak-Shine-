import React from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from "recharts";

export default function DashboardCharts({
  activeTab,
  chartPointsData = [],
  pointsMaxDomain = 100,
  pointsAvg = 0,
  pointsBest = 0,
  chartHistoryData = [],
  isDark = true,
}) {
  if (activeTab === "points") {
    if (chartPointsData.length === 0) {
      return (
        <div style={{ textAlign: "center", padding: "3.5rem 1rem", color: isDark ? "#94a3b8" : "#64748b" }}>
          <div style={{ fontSize: "2.2rem", marginBottom: "0.5rem" }}>📊</div>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: isDark ? "#ffffff" : "#0f172a" }}>No Points Data Yet</div>
          <div style={{ fontSize: "0.82rem", marginTop: 4 }}>Complete your daily speaking challenge to start graphing your score progress!</div>
        </div>
      );
    }

    return (
      <>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartPointsData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="purpleWaveGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)"} />
              <XAxis
                dataKey="session"
                stroke={isDark ? "#524d68" : "#94a3b8"}
                fontSize={12}
                tickLine={false}
                interval={chartPointsData.length <= 15 ? 0 : Math.max(1, Math.floor(chartPointsData.length / 12))}
              />
              <YAxis
                stroke={isDark ? "#524d68" : "#94a3b8"}
                fontSize={12}
                domain={[0, pointsMaxDomain]}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    return (
                      <div style={{ background: isDark ? "#161226" : "#ffffff", border: isDark ? "1px solid rgba(167, 139, 250, 0.4)" : "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.1)", borderRadius: 8, padding: "8px 12px", fontSize: "0.8rem", color: isDark ? "#fff" : "#0f172a" }}>
                        <div style={{ fontWeight: 700 }}>Session {label} {item?.date ? `· ${item.date}` : ""}</div>
                        <div style={{ color: "#a78bfa", fontWeight: 700, marginTop: 2 }}>
                          Score: {payload[0].value} pts {item?.sundayBonus ? `🎉 (${item.totalPts || Math.round(payload[0].value * 2)} pts Sunday Bonus)` : ""}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="pts"
                stroke="#c084fc"
                strokeWidth={2.5}
                fill="url(#purpleWaveGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-footer-note" style={{ fontSize: "0.76rem", marginTop: "1rem" }}>
          <span style={{ color: "#c084fc" }}>●</span> Daily points ({chartPointsData.length} sessions logged) · Average {pointsAvg} pts · Best {pointsBest} pts · Sunday bonus normalized to base score
        </div>
      </>
    );
  }

  if (activeTab === "history") {
    if (chartHistoryData.length === 0) {
      return (
        <div style={{ textAlign: "center", padding: "3.5rem 1rem", color: isDark ? "#94a3b8" : "#64748b" }}>
          <div style={{ fontSize: "2.2rem", marginBottom: "0.5rem" }}>📈</div>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: isDark ? "#ffffff" : "#0f172a" }}>No Score History Yet</div>
          <div style={{ fontSize: "0.82rem", marginTop: 4 }}>Submit speaking sessions to view detailed Fluency, Grammar, Confidence, and Vocabulary rubric trends.</div>
        </div>
      );
    }

    return (
      <>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartHistoryData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)"} />
              <XAxis
                dataKey="session"
                stroke={isDark ? "#524d68" : "#94a3b8"}
                fontSize={12}
                tickLine={false}
                interval={chartHistoryData.length <= 15 ? 0 : Math.max(1, Math.floor(chartHistoryData.length / 12))}
              />
              <YAxis
                stroke={isDark ? "#524d68" : "#94a3b8"}
                fontSize={12}
                domain={[0, 10]}
                ticks={[0, 2, 4, 6, 8, 10]}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0]?.payload;
                    return (
                      <div style={{ background: isDark ? "#141026" : "#ffffff", border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.1)", borderRadius: 8, padding: "8px 12px", fontSize: "0.8rem", minWidth: 160 }}>
                        <div style={{ fontWeight: 700, color: isDark ? "#fff" : "#0f172a", marginBottom: "4px" }}>
                          Session {label} {item?.date ? `· ${item.date}` : ""}
                        </div>
                        <div style={{ color: "#a78bfa" }}>■ Fluency: {payload.find(p => p.dataKey === "fluency")?.value}/10</div>
                        <div style={{ color: "#4ade80" }}>■ Grammar: {payload.find(p => p.dataKey === "grammar")?.value}/10</div>
                        <div style={{ color: "#fbbf24" }}>■ Confidence: {payload.find(p => p.dataKey === "confidence")?.value}/10</div>
                        <div style={{ color: "#ff6b9d" }}>■ Vocabulary: {payload.find(p => p.dataKey === "vocabulary")?.value}/10</div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line type="monotone" dataKey="fluency" stroke="#a78bfa" strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="grammar" stroke="#4ade80" strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="confidence" stroke="#fbbf24" strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="vocabulary" stroke="#ff6b9d" strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-footer-note" style={{ fontSize: "0.76rem", marginTop: "1rem" }}>
          <span style={{ color: "#a78bfa" }}>● Fluency</span>{" · "}
          <span style={{ color: "#4ade80" }}>● Grammar</span>{" · "}
          <span style={{ color: "#fbbf24" }}>● Confidence</span>{" · "}
          <span style={{ color: "#ff6b9d" }}>● Vocabulary</span>
        </div>
      </>
    );
  }

  return null;
}
