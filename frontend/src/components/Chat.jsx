import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace("/api", "")
  : (typeof window !== "undefined" ? window.location.origin : "");

let _socket = null;

function getSocket(token) {
  if (!_socket || _socket.disconnected) {
    _socket = io(API_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnectionAttempts: 5,
    });
  }
  return _socket;
}

export default function Chat({ peer, onClose }) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef(null);
  const typingTimer = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = getSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // Load history when joining room
    socket.on("chat:history", ({ messages }) => setMessages(messages));

    // New incoming message
    socket.on("chat:message", ({ message }) => {
      setMessages((prev) => [...prev, message]);
    });

    // Typing indicator
    socket.on("chat:typing", ({ from, isTyping }) => {
      if (from === peer.phone) setPeerTyping(isTyping);
    });

    // Join the DM room
    socket.emit("chat:join", { peerPhone: peer.phone });

    return () => {
      socket.off("chat:history");
      socket.off("chat:message");
      socket.off("chat:typing");
    };
  }, [token, peer.phone]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, peerTyping]);

  const sendMessage = useCallback(() => {
    if (!text.trim() || !socketRef.current) return;
    socketRef.current.emit("chat:send", { peerPhone: peer.phone, text });
    setText("");
    // Stop typing indicator
    socketRef.current.emit("chat:typing", { peerPhone: peer.phone, isTyping: false });
  }, [text, peer.phone]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTyping = (e) => {
    setText(e.target.value);
    if (!socketRef.current) return;
    socketRef.current.emit("chat:typing", { peerPhone: peer.phone, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit("chat:typing", { peerPhone: peer.phone, isTyping: false });
    }, 1500);
  };

  const myPhone = user?.phone;

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-info">
          <div className="chat-avatar">{peer.name?.[0]?.toUpperCase() || "?"}</div>
          <div>
            <div className="chat-peer-name">{peer.name}</div>
            <div className="chat-peer-role">{peer.role || "trainer"}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`chat-status-dot ${connected ? "online" : "offline"}`} />
          <button className="chat-close-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">No messages yet. Say hi! 👋</div>
        )}
        {messages.map((msg) => {
          const isMine = msg.from === myPhone;
          return (
            <div key={msg.id} className={`chat-bubble-wrap ${isMine ? "mine" : "theirs"}`}>
              <div className={`chat-bubble ${isMine ? "bubble-mine" : "bubble-theirs"}`}>
                <div className="chat-bubble-text">{msg.text}</div>
                <div className="chat-bubble-time">
                  {new Date(msg.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}
        {peerTyping && (
          <div className="chat-bubble-wrap theirs">
            <div className="chat-bubble bubble-theirs chat-typing-indicator">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={1}
          placeholder="Type a message…"
          value={text}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
        />
        <button
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={!text.trim() || !connected}
        >
          ➤
        </button>
      </div>
      <div className="chat-ttl-note">💬 Messages auto-delete after 24h</div>
    </div>
  );
}
