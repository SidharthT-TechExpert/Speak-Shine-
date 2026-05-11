/**
 * LiveChat.jsx — Session-specific chat for live rooms.
 * Uses socket events: live:join, live:send, live:typing, live:message, live:history
 * Messages deleted immediately when admin ends the session.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { getSharedSocket } from "../hooks/useSocket";

const ROLE_COLOR = { admin: "#f59e0b", trainer: "#a78bfa", user: "#94a3b8" };
const ROLE_BADGE = { admin: "👑", trainer: "🎓", user: "" };

export default function LiveChat({ sessionId, onUnread }) {
  const { token, user } = useAuth();
  const [messages,  setMessages]  = useState([]);
  const [text,      setText]      = useState("");
  const [typers,    setTypers]    = useState({});
  const [connected, setConnected] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [ended,     setEnded]     = useState(false);
  const bottomRef    = useRef(null);
  const typingTimer  = useRef(null);
  const socketRef    = useRef(null);
  const typerTimers  = useRef({});
  const myPhone      = user?.phone;

  useEffect(() => {
    if (!token || !sessionId) return;

    const socket = getSharedSocket(token);
    socketRef.current = socket;
    setConnected(socket.connected);

    const onConnect = () => {
      setConnected(true);
      socket.emit("live:join", { sessionId });
    };
    const onDisconnect = () => setConnected(false);

    const onHistory = ({ messages: msgs }) => setMessages(msgs || []);

    const onMessage = ({ message }) => {
      if (!message) return;
      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });
      if (message.from !== myPhone) onUnread?.();
    };

    const onTyping = ({ from, fromName, isTyping }) => {
      if (from === myPhone) return;
      setTypers(prev => {
        const next = { ...prev };
        if (isTyping) {
          next[from] = fromName;
          clearTimeout(typerTimers.current[from]);
          typerTimers.current[from] = setTimeout(() => {
            setTypers(p => { const n = { ...p }; delete n[from]; return n; });
          }, 3000);
        } else {
          delete next[from];
        }
        return next;
      });
    };

    const onChatError = ({ message: msg }) => {
      setChatError(msg);
      setTimeout(() => setChatError(null), 4000);
    };

    // Session ended — chat is being deleted
    const onSessionEnded = ({ sessionId: sid }) => {
      if (sid?.toString() === sessionId?.toString()) {
        setEnded(true);
        setMessages([]);
      }
    };

    socket.on("connect",       onConnect);
    socket.on("disconnect",    onDisconnect);
    socket.on("live:history",  onHistory);
    socket.on("live:message",  onMessage);
    socket.on("live:typing",   onTyping);
    socket.on("chat:error",    onChatError);
    socket.on("session:ended", onSessionEnded);

    if (socket.connected) socket.emit("live:join", { sessionId });

    return () => {
      socket.off("connect",       onConnect);
      socket.off("disconnect",    onDisconnect);
      socket.off("live:history",  onHistory);
      socket.off("live:message",  onMessage);
      socket.off("live:typing",   onTyping);
      socket.off("chat:error",    onChatError);
      socket.off("session:ended", onSessionEnded);
      clearTimeout(typingTimer.current);
      Object.values(typerTimers.current).forEach(clearTimeout);
    };
  }, [token, sessionId, myPhone]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typers]);

  const sendMessage = useCallback(() => {
    if (!text.trim() || !socketRef.current || !connected || ended) return;
    socketRef.current.emit("live:send", { sessionId, text: text.trim() });
    socketRef.current.emit("live:typing", { sessionId, isTyping: false });
    setText("");
    clearTimeout(typingTimer.current);
  }, [text, sessionId, connected, ended]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleTyping = (e) => {
    setText(e.target.value);
    if (socketRef.current && connected && !ended) {
      socketRef.current.emit("live:typing", { sessionId, isTyping: true });
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        socketRef.current?.emit("live:typing", { sessionId, isTyping: false });
      }, 1500);
    }
  };

  const typerList = Object.values(typers);
  const grouped = messages.map((msg, i) => ({
    ...msg,
    showHeader: i === 0 || messages[i - 1].from !== msg.from,
  }));

  // Session ended state
  if (ended) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "0.75rem", padding: "1.5rem" }}>
        <div style={{ fontSize: "2rem" }}>🔒</div>
        <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#e2e8f0", textAlign: "center" }}>Session Ended</div>
        <div style={{ fontSize: "0.72rem", color: "#55557a", textAlign: "center" }}>Chat messages have been deleted.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Error banner */}
      {chatError && (
        <div style={{
          background: "rgba(248,113,113,0.12)", borderBottom: "1px solid rgba(248,113,113,0.2)",
          color: "#f87171", fontSize: "0.72rem", padding: "0.4rem 0.75rem",
          flexShrink: 0, textAlign: "center",
        }}>
          ⚠️ {chatError}
        </div>
      )}

      {/* Connection banner */}
      {!connected && (
        <div style={{
          background: "rgba(251,191,36,0.08)", borderBottom: "1px solid rgba(251,191,36,0.15)",
          color: "#fbbf24", fontSize: "0.68rem", padding: "0.3rem 0.75rem",
          flexShrink: 0, textAlign: "center",
        }}>
          ⏳ Reconnecting…
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "0.6rem 0.75rem",
        display: "flex", flexDirection: "column", gap: "0.3rem",
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#55557a", fontSize: "0.75rem", padding: "2rem 0" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>💬</div>
            No messages yet. Say something!
          </div>
        )}

        {grouped.map(msg => {
          const isMine = msg.from === myPhone;
          const nameColor = ROLE_COLOR[msg.role] || "#94a3b8";
          const badge = ROLE_BADGE[msg.role] || "";

          return (
            <div key={msg.id} style={{
              display: "flex", flexDirection: "column",
              alignItems: isMine ? "flex-end" : "flex-start",
            }}>
              {!isMine && msg.showHeader && (
                <div style={{
                  fontSize: "0.6rem", fontWeight: 700, color: nameColor,
                  marginBottom: "0.15rem", paddingLeft: "0.3rem",
                  display: "flex", alignItems: "center", gap: "0.2rem",
                }}>
                  {badge && <span>{badge}</span>}
                  <span>{msg.fromName}</span>
                </div>
              )}
              <div style={{
                maxWidth: "85%",
                padding: "0.5rem 0.75rem",
                borderRadius: isMine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: isMine
                  ? "linear-gradient(135deg,#7c6fff,#4f46e5)"
                  : "rgba(255,255,255,0.07)",
                border: isMine ? "none" : "1px solid rgba(255,255,255,0.06)",
                color: "#fff",
                fontSize: "0.82rem",
                lineHeight: 1.45,
                wordBreak: "break-word",
              }}>
                {msg.text}
                <div style={{
                  fontSize: "0.56rem",
                  color: isMine ? "rgba(255,255,255,0.55)" : "#55557a",
                  marginTop: "0.25rem", textAlign: "right",
                }}>
                  {new Date(msg.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typerList.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.2rem 0.3rem" }}>
            <div style={{ display: "flex", gap: "0.18rem", alignItems: "center" }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: "50%", background: "#55557a",
                  animation: `chatBounce 1s ease-in-out ${i * 0.18}s infinite`,
                }} />
              ))}
            </div>
            <span style={{ fontSize: "0.62rem", color: "#55557a" }}>
              {typerList.slice(0, 2).join(", ")}{typerList.length > 2 ? ` +${typerList.length - 2}` : ""} typing…
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        display: "flex", gap: "0.4rem", padding: "0.5rem 0.6rem",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0, alignItems: "flex-end",
      }}>
        <input
          type="text"
          value={text}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
          disabled={!connected || ended}
          maxLength={500}
          placeholder={!connected ? "Connecting…" : ended ? "Session ended" : "Message the session…"}
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10, padding: "0.5rem 0.7rem",
            color: "#e2e8f0", fontSize: "0.82rem", outline: "none",
            transition: "border-color 0.15s",
          }}
          onFocus={e => e.target.style.borderColor = "rgba(124,111,255,0.4)"}
          onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
        />
        <button
          onClick={sendMessage}
          disabled={!text.trim() || !connected || ended}
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: text.trim() && connected && !ended
              ? "linear-gradient(135deg,#7c6fff,#4f46e5)"
              : "rgba(255,255,255,0.05)",
            border: "none",
            color: text.trim() && connected && !ended ? "#fff" : "#55557a",
            cursor: text.trim() && connected && !ended ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.85rem", transition: "all 0.15s",
          }}
        >
          ➤
        </button>
      </div>

      <div style={{
        textAlign: "center", fontSize: "0.58rem", color: "#3a3a5a",
        padding: "0.2rem 0.5rem 0.3rem", flexShrink: 0,
      }}>
        � Session chat · deleted when session ends
      </div>
    </div>
  );
}
