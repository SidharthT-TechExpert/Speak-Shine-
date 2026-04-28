import { useState, useEffect } from "react";
import api from "../api/client.js";
import { useToast } from "./Toast.jsx";

export default function SubmissionControls({ phone, weeklySubmissions, monthlySubmissions, onUpdate }) {
  const [loading, setLoading] = useState({ weekly: false, monthly: false });
  const toast = useToast();

  const adjustSubmission = async (type, delta) => {
    setLoading((prev) => ({ ...prev, [type]: true }));
    try {
      const response = await api.patch(`/submissions/${phone}/${type}`, { delta });
      const newValue = response.data[`${type}Submissions`];
      if (onUpdate) onUpdate(type, newValue);
    } catch (err) {
      toast(err.response?.data?.error || `Failed to adjust ${type} submissions`, "error");
    } finally {
      setLoading((prev) => ({ ...prev, [type]: false }));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      
      <SubmissionCounter
        label="Weekly Submissions"
        value={weeklySubmissions}
        onIncrement={() => adjustSubmission("weekly", 1)}
        onDecrement={() => adjustSubmission("weekly", -1)}
        disabled={loading.weekly}
        disableDecrement={weeklySubmissions === 0}
      />
      
      <SubmissionCounter
        label="Monthly Submissions"
        value={monthlySubmissions}
        onIncrement={() => adjustSubmission("monthly", 1)}
        onDecrement={() => adjustSubmission("monthly", -1)}
        disabled={loading.monthly}
        disableDecrement={monthlySubmissions === 0}
      />
    </div>
  );
}

// SubmissionCounter subcomponent
function SubmissionCounter({ label, value, onIncrement, onDecrement, disabled, disableDecrement }) {
  return (
    <div className="card" style={{ padding: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "0.25rem" }}>
            {label}
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)" }}>
            {value}
          </div>
        </div>
        
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn-ghost"
            onClick={onDecrement}
            disabled={disabled || disableDecrement}
            style={{
              width: "40px",
              height: "40px",
              fontSize: "1.25rem",
              padding: 0,
              opacity: (disabled || disableDecrement) ? 0.5 : 1,
              cursor: (disabled || disableDecrement) ? "not-allowed" : "pointer"
            }}
            title={disableDecrement ? "Cannot decrement below 0" : "Decrement"}
          >
            −
          </button>
          
          <button
            className="btn-ghost"
            onClick={onIncrement}
            disabled={disabled}
            style={{
              width: "40px",
              height: "40px",
              fontSize: "1.25rem",
              padding: 0,
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? "not-allowed" : "pointer"
            }}
            title="Increment"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
