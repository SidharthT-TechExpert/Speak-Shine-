import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";
import Chat from "./Chat";
import GroupChat from "./GroupChat";

const API_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace("/api", "")
  : (typeof window !== "undefined" ? window.location.origin : "");

export default function ChatLauncher() {
  const { token, user } = useAuth();
  const [peers, setPeers] = useState([]);
  const [activePeer, setActivePeer] = useState(null); // null | { phone, name, role }
  const [showGroup, setShowGroup] = useState(false);
  const [showList, setShowList] = useState(false);
  const [unread, setUnread] = useState(0);
  const socketRef = useRef(null);

  // Load DM peer list
  useEffect(() => {
    if (!token || !user) return;
    const endpoint = user.role === "user" ? "/api/chat/trainers" : "/api/chat/users";
    fetch(`${API_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setPeers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [token, user]);

  // Listen for DM notifications
  useEffect(() => {
    if (!token) return;
    const socket = io(API_URL, { auth: { token }, transports: ["websocket"] });
    socketRef.current = socket;
    socket.on("chat:notify", () => setUnread((n) => n + 1));
    return () => socket.disconnect();
  }, [token]);

  if (!user) return null;

  const openGroup = () => {
    setShowGroup(true);
    setActivePeer(null);
    setShowList(false);
    setUnread(0);
  };

  const openDM = (peer) => {
    setActivePeer(peer);
    setShowGroup(false);
    setShowList(false);
    setUnread(0);
  };

  const closeAll = () => {
    setActivePeer(null);
    setShowGroup(false);
  };

  const isOpen = activePeer || showGroup;

  return (
    <>
      {/* Group chat window */}
      {showGroup && (
        <GroupChat onClose={closeAll} onUnread={() => setUnread((n) => n + 1)} />
      )}

      {/* DM chat window */}
      {activePeer && (
        <Chat peer={activePeer} onClose={closeAll} />
      )}

      {/* Dropdown menu */}
      {showList && !isOpen && (
        <div className="chat-peer-list">
          {/* Group chat entry */}
          <button className="chat-peer-item group-entry" onClick={openGroup}>
            <div className="chat-avatar group-avatar sm">🗣️</div>
            <div>
              <div className="chat-peer-name">Speak & Shine Group</div>
              <div className="chat-peer-role">Everyone · 24h messages</div>
            </div>
          </button>

          <div className="chat-peer-divider">
            {user.role === "user" ? "Direct — Trainers" : "Direct — Users"}
          </div>

          {peers.length === 0 && (
            <div className="chat-peer-empty">No contacts available</div>
          )}
          {peers.map((p) => (
            <button key={p.phone} className="chat-peer-item" onClick={() => openDM(p)}>
              <div className="chat-avatar sm">{p.name?.[0]?.toUpperCase() || "?"}</div>
              <div>
                <div className="chat-peer-name">{p.name}</div>
                <div className="chat-peer-role">{p.role}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        className="chat-fab"
        onClick={() => { setShowList((v) => !v); setUnread(0); }}
        title="Chat"
      >
        💬
        {unread > 0 && <span className="chat-fab-badge">{unread}</span>}
      </button>
    </>
  );
}
