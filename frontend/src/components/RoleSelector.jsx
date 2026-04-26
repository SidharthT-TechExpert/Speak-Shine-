import { useState } from "react";
import api from "../api/client.js";

export default function RoleSelector({ phone, currentRole, onRoleChange }) {
  const [role, setRole] = useState(currentRole);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const changeRole = async (newRole) => {
    if (newRole === role) return; // No change

    const previousRole = role;
    setRole(newRole); // Optimistic update
    setLoading(true);
    setError(null);

    try {
      await api.patch(`/users/${phone}/role`, { role: newRole });
      
      // Success toast
      const message = `Role changed to ${newRole}`;
      showToast(message, "success");
      
      // Notify parent component if callback provided
      if (onRoleChange) {
        onRoleChange(phone, newRole);
      }
    } catch (err) {
      console.error("Failed to change role:", err);
      const errorMessage = err.response?.data?.error || "Failed to change role";
      
      // Revert on failure
      setRole(previousRole);
      setError(errorMessage);
      
      // Error toast
      showToast(errorMessage, "error");
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type) => {
    // Simple toast implementation using alert for now
    // Can be replaced with a proper toast library
    if (type === "error") {
      alert(`❌ ${message}`);
    } else {
      alert(`✅ ${message}`);
    }
  };

  return (
    <select
      value={role}
      onChange={(e) => changeRole(e.target.value)}
      disabled={loading}
      style={{
        background: "var(--bg2)",
        border: "1px solid var(--border)",
        color: loading ? "var(--muted)" : "var(--text)",
        borderRadius: 8,
        padding: "0.2rem 0.4rem",
        fontSize: "0.75rem",
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.6 : 1,
      }}
      title={error || "Change user role"}
    >
      <option value="user">User</option>
      <option value="trainer">Trainer</option>
      <option value="admin">Admin</option>
    </select>
  );
}
