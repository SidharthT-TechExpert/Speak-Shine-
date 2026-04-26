import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";
import Chat from "./Chat";

const API_URL = import.meta.env.VITE_API_URL || "";

export default function ChatLauncher() {
  const { token, user } = useAuth();
  const [peers, setPeers] = useState([]);
  const [activePeer, setActivePeer] = useState(null);
  const [showList, setShowList] = useState(false);
  const [unread, setUnread] = useState(0);
  const socketRef = useRef(null);

  // Load peer list based on role
  useEffect(() => {
    if (!token || !user) return;

    const endpoint = user.role === "user" ? "/api/chat/trainers" : "/api/chat/users";
    fetch(`${API_URL}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setPeers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [token, user]);

  // Listen for notifications when chat is closed
  useEffect(() => {
    if (!token) return;
    const socket = io(API_URL, {
      auth: { token },
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("chat:notify", () => {
      setUnread((n) => n + 1);
    });

    return () => socket.disconnect();
  }, [token]);

  if (!user) return null;

  const openChat = (peer) => {
    setActivePeer(peer);
    setShowList(false);
    setUnread(0);
  };

  return (
    <>
      {/* Active chat window */}
      {activePeer && (
        <Chat peer={activePeer} onClose={() => setActivePeer(null)} />
      )}

      {/* Peer list dropdown */}
      {showList && !activePeer && (
        <div className="chat-peer-list">
          <div className="chat-peer-list-title">
            {user.role === "user" ? "Message a Trainer" : "Message a User"}
          </div>
          {peers.length === 0 && (
            <div className="chat-peer-empty">No contacts available</div>
          )}
          {peers.map((p) => (
            <button key={p.phone} className="chat-peer-item" onClick={() => openChat(p)}>
              <div className="chat-avatar sm">{p.name?.[0]?.toUpperCase() || "?"}</div>
              <div>
                <div className="chat-peer-name">{p.name}</div>
                <div className="chat-peer-role">{p.role}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* FAB button */}
      <button
        className="chat-fab"
        onClick={() => {
          setShowList((v) => !v);
          setUnread(0);
        }}
        title="Messages"
      >
        💬
        {unread > 0 && <span className="chat-fab-badge">{unread}</span>}
      </button>
    </>
  );
}
