import { useState } from "react";
import api from "../api/client.js";

export default function SubmissionControls({ phone, weeklySubmissions, monthlySubmissions, onUpdate }) {
  const [loading, setLoading] = useState({ weekly: false, monthly: false });
  const [error, setError] = useState(null);

  const adjustSubmission = async (type, delta) => {
    setLoading((prev) => ({ ...prev, [type]: true }));
    setError(null);

    try {
      const response = await api.patch(`/submissions/${phone}/${type}`, { delta });
      const newValue = response.data[`${type}Submissions`];
      
      // Update parent component state with new value
      if (onUpdate) {
        onUpdate(type, newValue);
      }
    } catch (err) {
      console.error(`Failed to adjust ${type} submissions:`, err);
      const errorMessage = err.response?.data?.error || `Failed to adjust ${type} submissions`;
      setError(errorMessage);
      
      // Display error toast (using alert for now, can be replaced with toast library)
      alert(errorMessage);
    } finally {
      setLoading((prev) => ({ ...prev, [type]: false }));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {error && (
        <div style={{ 
          padding: "0.75rem", 
          background: "var(--danger)", 
          color: "#fff", 
          borderRadius: "8px",
          fontSize: "0.875rem"
        }}>
          {error}
        </div>
      )}
      
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
