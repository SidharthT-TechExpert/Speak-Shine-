import { useState } from "react";
import api from "../api/client.js";
import { useToast } from "./Toast.jsx";

export default function RoleSelector({ phone, currentRole, onRoleChange }) {
  const [role, setRole] = useState(currentRole);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const changeRole = async (newRole) => {
    if (newRole === role) return;
    const previousRole = role;
    setRole(newRole);
    setLoading(true);
    try {
      await api.patch(`/users/${phone}/role`, { role: newRole });
      toast(`Role changed to ${newRole}`);
      if (onRoleChange) onRoleChange(phone, newRole);
    } catch (err) {
      setRole(previousRole);
      toast(err.response?.data?.error || "Failed to change role", "error");
    } finally {
      setLoading(false);
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
    >
      <option value="user">User</option>
      <option value="trainer">Trainer</option>
      <option value="admin">Admin</option>
      <option value="viewer">Viewer</option>
    </select>
  );
}
