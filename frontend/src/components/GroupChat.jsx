import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "";

let _socket = null;
function getSocket(token) {
  if (!_socket || _socket.disconnected) {
    _socket = io(API_URL, { auth: { token }, transports: ["websocket"], reconnectionAttempts: 5 });
  }
  return _socket;
}

const ROLE_BADGE = { admin: "👑", trainer: "🎓", user: "" };
const ROLE_COLOR = { admin: "#f59e0b", trainer: "#6c63ff", user: "#e5e7eb" };

export default function GroupChat({ onClose, onUnread }) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [typers, setTypers] = useState({}); // phone → name
  const [connected, setConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const bottomRef = useRef(null);
  const typingTimer = useRef(null);
  const socketRef = useRef(null);
  const typerTimers = useRef({});

  useEffect(() => {
    const socket = getSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => { setConnected(true); socket.emit("group:join"); });
    socket.on("disconnect", () => setConnected(false));

    socket.on("group:history", ({ messages }) => setMessages(messages));

    socket.on("group:message", ({ message }) => {
      setMessages((prev) => [...prev, message]);
      // If window is not focused, count as unread
      if (document.hidden) onUnread?.();
    });

    socket.on("group:typing", ({ from, fromName, isTyping }) => {
      setTypers((prev) => {
        const next = { ...prev };
        if (isTyping) {
          next[from] = fromName;
          // Auto-clear after 3s in case stop event is missed
          clearTimeout(typerTimers.current[from]);
          typerTimers.current[from] = setTimeout(() => {
            setTypers((p) => { const n = { ...p }; delete n[from]; return n; });
          }, 3000);
        } else {
          delete next[from];
        }
        return next;
      });
    });

    socket.emit("group:join");

    return () => {
      socket.off("group:history");
      socket.off("group:message");
      socket.off("group:typing");
    };
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typers]);

  const sendMessage = useCallback(() => {
    if (!text.trim() || !socketRef.current) return;
    socketRef.current.emit("group:send", {
      text,
      replyTo: replyTo ? { id: replyTo.id, fromName: replyTo.fromName, text: replyTo.text } : null,
    });
    setText("");
    setReplyTo(null);
    socketRef.current.emit("group:typing", { isTyping: false });
  }, [text, replyTo]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    if (e.key === "Escape" && replyTo) setReplyTo(null);
  };

  const handleTyping = (e) => {
    setText(e.target.value);
    socketRef.current?.emit("group:typing", { isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit("group:typing", { isTyping: false });
    }, 1500);
  };

  const myPhone = user?.phone;
  const typerList = Object.values(typers).filter((n) => n !== user?.name);

  // Group consecutive messages from same sender
  const grouped = messages.map((msg, i) => ({
    ...msg,
    showHeader: i === 0 || messages[i - 1].from !== msg.from,
  }));

  return (
    <div className="chat-window group-chat-window">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-info">
          <div className="chat-avatar group-avatar">🗣️</div>
          <div>
            <div className="chat-peer-name">Speak & Shine Group</div>
            <div className="chat-peer-role">
              <span className={`chat-status-dot ${connected ? "online" : "offline"}`} style={{ display: "inline-block", marginRight: 4 }} />
              {connected ? "live" : "connecting…"}
            </div>
          </div>
        </div>
        <button className="chat-close-btn" onClick={onClose}>✕</button>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">No messages yet. Be the first! 🎉</div>
        )}
        {grouped.map((msg) => {
          const isMine = msg.from === myPhone;
          const badge = ROLE_BADGE[msg.role] || "";
          const nameColor = ROLE_COLOR[msg.role] || "#e5e7eb";

          return (
            <div key={msg.id} className={`chat-bubble-wrap ${isMine ? "mine" : "theirs"}`}>
              <div className={`chat-bubble ${isMine ? "bubble-mine" : "bubble-theirs"}`}>
                {/* Sender name — only for others, only when header shown */}
                {!isMine && msg.showHeader && (
                  <div className="group-sender-name" style={{ color: nameColor }}>
                    {badge} {msg.fromName}
                  </div>
                )}

                {/* Reply preview */}
                {msg.replyTo && (
                  <div className="group-reply-preview">
                    <span className="group-reply-name">{msg.replyTo.fromName}</span>
                    <span className="group-reply-text">{msg.replyTo.text.slice(0, 60)}{msg.replyTo.text.length > 60 ? "…" : ""}</span>
                  </div>
                )}

                <div className="chat-bubble-text">{msg.text}</div>
                <div className="chat-bubble-time" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {new Date(msg.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </div>

                {/* Swipe-to-reply button */}
                {!isMine && (
                  <button
                    className="group-reply-btn"
                    onClick={() => setReplyTo(msg)}
                    title="Reply"
                  >↩</button>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typerList.length > 0 && (
          <div className="chat-bubble-wrap theirs">
            <div className="chat-bubble bubble-theirs" style={{ padding: "6px 12px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
                {typerList.join(", ")} {typerList.length === 1 ? "is" : "are"} typing…
              </div>
              <div className="chat-typing-indicator"><span /><span /><span /></div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="group-reply-bar">
          <div className="group-reply-bar-content">
            <span className="group-reply-name">{replyTo.fromName}</span>
            <span className="group-reply-text">{replyTo.text.slice(0, 80)}</span>
          </div>
          <button className="group-reply-cancel" onClick={() => setReplyTo(null)}>✕</button>
        </div>
      )}

      {/* Input */}
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={1}
          placeholder="Message the group…"
          value={text}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
        />
        <button className="chat-send-btn" onClick={sendMessage} disabled={!text.trim() || !connected}>➤</button>
      </div>
      <div className="chat-ttl-note">💬 Messages auto-delete after 24h</div>
    </div>
  );
}
