import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { getSharedSocket } from "../hooks/useSocket";

const ROLE_BADGE = { admin: "👑", trainer: "🎓", user: "" };
const ROLE_COLOR = { admin: "#f59e0b", trainer: "#6c63ff", user: "#e5e7eb" };

export default function GroupChat({ onClose, onUnread, hideHeader = false }) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [typers, setTypers] = useState({}); // phone → name
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [chatError, setChatError] = useState(null);
  const bottomRef = useRef(null);
  const typingTimer = useRef(null);
  const socketRef = useRef(null);
  const typerTimers = useRef({});

  useEffect(() => {
    if (!token) return;

    const socket = getSharedSocket(token);
    socketRef.current = socket;

    // Sync initial connected state
    setConnected(socket.connected);

    const onConnect = () => {
      setConnected(true);
      setConnectionError(null);
      setChatError(null);
      socket.emit("group:join");
    };

    const onDisconnect = (reason) => {
      setConnected(false);
      if (reason !== "io server disconnect") {
        setConnectionError("Connection lost. Reconnecting…");
      } else {
        setConnectionError("Disconnected by server. Please refresh.");
      }
    };

    const onConnectError = () => {
      setConnectionError("Connection failed. Retrying…");
    };

    const onChatError = ({ message }) => {
      setChatError(message);
      setTimeout(() => setChatError(null), 5000);
    };

    const onHistory = ({ messages: msgs }) => {
      setMessages(msgs || []);
    };

    const onMessage = ({ message }) => {
      if (!message) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      if (document.hidden) onUnread?.();
    };

    const onTyping = ({ from, fromName, isTyping }) => {
      setTypers((prev) => {
        const next = { ...prev };
        if (isTyping) {
          next[from] = fromName;
          clearTimeout(typerTimers.current[from]);
          typerTimers.current[from] = setTimeout(() => {
            setTypers((p) => {
              const n = { ...p };
              delete n[from];
              return n;
            });
          }, 3000);
        } else {
          delete next[from];
        }
        return next;
      });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("chat:error", onChatError);
    socket.on("group:history", onHistory);
    socket.on("group:message", onMessage);
    socket.on("group:typing", onTyping);

    // Join group room (server auto-joins on connect, but emit to load history)
    socket.emit("group:join");

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("chat:error", onChatError);
      socket.off("group:history", onHistory);
      socket.off("group:message", onMessage);
      socket.off("group:typing", onTyping);
      clearTimeout(typingTimer.current);
      Object.values(typerTimers.current).forEach(clearTimeout);
    };
  }, [token, onUnread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typers]);

  const sendMessage = useCallback(() => {
    if (!text.trim() || !socketRef.current || !connected) return;
    socketRef.current.emit("group:send", {
      text: text.trim(),
      replyTo: replyTo
        ? { id: replyTo.id, fromName: replyTo.fromName, text: replyTo.text }
        : null,
    });
    setText("");
    setReplyTo(null);
    socketRef.current.emit("group:typing", { isTyping: false });
    clearTimeout(typingTimer.current);
  }, [text, replyTo, connected]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === "Escape" && replyTo) setReplyTo(null);
  };

  const handleTyping = (e) => {
    setText(e.target.value);
    if (socketRef.current && connected) {
      socketRef.current.emit("group:typing", { isTyping: true });
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        socketRef.current?.emit("group:typing", { isTyping: false });
      }, 1500);
    }
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
      {/* Header — hidden when used inside live room (has its own header) */}
      {!hideHeader && (
        <div className="chat-header">
          <div className="chat-header-info">
            <div className="chat-avatar group-avatar">🗣️</div>
            <div>
              <div className="chat-peer-name">Speak &amp; Shine Group</div>
              <div className="chat-peer-role">
                <span
                  className={`chat-status-dot ${connected ? "online" : "offline"}`}
                  style={{ display: "inline-block", marginRight: 4 }}
                />
                {connected ? "live" : "connecting…"}
              </div>
            </div>
          </div>
          <button className="chat-close-btn" onClick={onClose}>✕</button>
        </div>
      )}

      {/* Error banners */}
      {connectionError && (
        <div style={{
          background: "rgba(248,113,113,0.1)",
          border: "1px solid rgba(248,113,113,0.3)",
          color: "#f87171",
          padding: "0.5rem",
          fontSize: "0.8rem",
          textAlign: "center",
        }}>
          {connectionError}
        </div>
      )}
      {chatError && (
        <div style={{
          background: "rgba(251,191,36,0.1)",
          border: "1px solid rgba(251,191,36,0.3)",
          color: "#fbbf24",
          padding: "0.5rem",
          fontSize: "0.8rem",
          textAlign: "center",
        }}>
          ⚠️ {chatError}
        </div>
      )}

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
                {!isMine && msg.showHeader && (
                  <div className="group-sender-name" style={{ color: nameColor }}>
                    {badge} {msg.fromName}
                  </div>
                )}

                {msg.replyTo && (
                  <div className="group-reply-preview">
                    <span className="group-reply-name">{msg.replyTo.fromName}</span>
                    <span className="group-reply-text">
                      {msg.replyTo.text.slice(0, 60)}
                      {msg.replyTo.text.length > 60 ? "…" : ""}
                    </span>
                  </div>
                )}

                <div className="chat-bubble-text">{msg.text}</div>
                <div className="chat-bubble-time" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {new Date(msg.ts).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>

                {!isMine && (
                  <button
                    className="group-reply-btn"
                    onClick={() => setReplyTo(msg)}
                    title="Reply"
                  >
                    ↩
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {typerList.length > 0 && (
          <div className="chat-bubble-wrap theirs">
            <div className="chat-bubble bubble-theirs" style={{ padding: "6px 12px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
                {typerList.join(", ")} {typerList.length === 1 ? "is" : "are"} typing…
              </div>
              <div className="chat-typing-indicator">
                <span /><span /><span />
              </div>
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
          placeholder={connected ? "Message the group…" : "Connecting…"}
          value={text}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
          disabled={!connected}
        />
        <button
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={!text.trim() || !connected}
          title={connected ? "Send message" : "Connecting…"}
        >
          ➤
        </button>
      </div>
      <div className="chat-ttl-note">💬 Messages auto-delete after 24h</div>
    </div>
  );
}
