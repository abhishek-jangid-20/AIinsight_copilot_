import { useEffect, useRef, useState } from "react";
import {
  Bot, Send, User, ChevronUp, ChevronDown,
  Loader2, AlertCircle, Sparkles, History, Plus
} from "lucide-react";
import { listChats, streamChat } from "../lib/api";

export function ChatPanel({ repository, isCollapsed, onToggle }) {
  const [message, setMessage] = useState("Explain the repository architecture and key data flow.");
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [chatId, setChatId] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  // FIX-014: Track whether we've already loaded history for the current repo
  // so a status-change re-render doesn't wipe the conversation.
  const historyLoadedRef = useRef(null);

  // FIX-014: Reset conversation state ONLY when the active repository changes,
  // not on every status poll cycle. History is loaded in a separate effect.
  useEffect(() => {
    setMessages([]);
    setChatId(null);
    setError(null);
    setMessage("Explain the repository architecture and key data flow.");
    historyLoadedRef.current = null;
  }, [repository._id]);

  // FIX-014: Load history once, when the repo reaches "ready" for the first time.
  useEffect(() => {
    if (repository.status !== "ready") return;
    if (historyLoadedRef.current === repository._id) return; // already loaded
    historyLoadedRef.current = repository._id;

    setIsLoadingHistory(true);
    listChats(repository._id)
      .then(({ chats }) => {
        if (chats.length > 0) {
          const last = chats[0];
          setChatId(last._id);
          setMessages(
            last.messages
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({ role: m.role, content: m.content }))
          );
        }
      })
      .catch(() => {/* Non-fatal */})
      .finally(() => setIsLoadingHistory(false));
  }, [repository._id, repository.status]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isCollapsed]);

  async function send() {
    if (!message.trim() || streaming || repository.status !== "ready") return;
    const userMessage = message.trim();
    setMessage("");
    setError(null);
    setMessages((curr) => [
      ...curr,
      { role: "user", content: userMessage },
      { role: "assistant", content: "" },
    ]);
    setStreaming(true);
    try {
      const result = await streamChat(
        repository._id,
        userMessage,
        (token) => {
          setMessages((curr) => {
            const clone = [...curr];
            const last = clone[clone.length - 1];
            clone[clone.length - 1] = { ...last, content: last.content + token };
            return clone;
          });
        },
        chatId ?? undefined
      );
      if (result.chatId) setChatId(result.chatId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      // BUG-009: Remove only the empty assistant placeholder; restore user message to input
      setMessages((curr) => curr.slice(0, -1));
      setMessage(userMessage);
    } finally {
      setStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  // Start a new chat session
  function startNewChat() {
    setMessages([]);
    setChatId(null);
    setError(null);
    setMessage("Explain the repository architecture and key data flow.");
  }

  const isNotReady = repository.status !== "ready";

  return (
    <section className="flex flex-col h-full overflow-hidden"
      style={{ background: "rgba(7,9,26,0.7)", backdropFilter: "blur(12px)" }}>
      {/* ── Header ── */}
      <div
        className="flex h-10 shrink-0 items-center justify-between px-4 cursor-pointer transition select-none"
        style={{ borderBottom: "1px solid rgba(29,42,66,0.6)" }}
        onClick={onToggle}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(29,42,66,0.2)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = ""; }}
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md grid place-items-center"
            style={{ background: "rgba(67,217,255,0.1)", border: "1px solid rgba(67,217,255,0.2)", color: "#43d9ff" }}>
            <Bot size={11} />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#475569" }}>
            AI Assistant
          </span>
          {messages.length > 0 && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(29,42,66,0.5)", color: "#475569" }}>
              {Math.ceil(messages.length / 2)} exchanges
            </span>
          )}
          {streaming && (
            <span className="flex items-center gap-1 text-[10px]" style={{ color: "#43d9ff" }}>
              <Loader2 size={9} className="animate-spin" />
              Generating…
            </span>
          )}
          {isLoadingHistory && (
            <span className="flex items-center gap-1 text-[10px]" style={{ color: "#475569" }}>
              <History size={9} />
              Loading history…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {/* ENH-003: New chat button */}
          {messages.length > 0 && !streaming && (
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] transition"
              style={{ color: "#475569", border: "1px solid rgba(29,42,66,0.5)" }}
              onClick={startNewChat}
              title="Start a new chat"
              onMouseEnter={e => { e.currentTarget.style.color = "#e2e8f4"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#475569"; }}
            >
              <Plus size={9} />
              New
            </button>
          )}
          <button type="button" className="transition" style={{ color: "#334155" }}>
            {isCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {!isCollapsed && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Messages scroll area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {/* Welcome / empty state */}
            {messages.length === 0 && !isLoadingHistory && (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-4 text-center animate-fade-in">
                <div className="w-10 h-10 rounded-xl grid place-items-center"
                  style={{ background: "rgba(67,217,255,0.08)", border: "1px solid rgba(67,217,255,0.15)", color: "#43d9ff" }}>
                  <Sparkles size={18} />
                </div>
                {isNotReady ? (
                  <p className="text-xs leading-relaxed max-w-xs" style={{ color: "#475569" }}>
                    Repository is{" "}
                    <span style={{ color: "#f7c45f", fontWeight: 600 }}>{repository.status}</span>.
                    {" "}Chat will be available once indexing completes.
                  </p>
                ) : (
                  <p className="text-xs leading-relaxed max-w-xs" style={{ color: "#475569" }}>
                    Ask anything about <span style={{ color: "#94a3b8", fontWeight: 500 }}>{repository.name}</span> —
                    auth flows, APIs, data models, dependencies, or architecture.
                  </p>
                )}
              </div>
            )}

            {/* Message list */}
            {messages.map((msg, idx) => {
              const isLastAssistant = idx === messages.length - 1 && msg.role === "assistant";
              const isStreamingThisMsg = isLastAssistant && streaming;
              return (
                <div
                  key={idx}
                  className={`flex gap-2.5 animate-slide-up ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-md grid place-items-center shrink-0 mt-0.5"
                      style={{ background: "rgba(67,217,255,0.1)", border: "1px solid rgba(67,217,255,0.18)", color: "#43d9ff" }}>
                      <Bot size={12} />
                    </div>
                  )}
                  <div
                    className="max-w-[82%] rounded-xl px-3.5 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words"
                    style={msg.role === "user" ? {
                      background: "rgba(98,245,198,0.07)",
                      border: "1px solid rgba(98,245,198,0.18)",
                      color: "#e2e8f4",
                      borderTopRightRadius: "4px"
                    } : {
                      background: "rgba(17,24,41,0.8)",
                      border: "1px solid rgba(29,42,66,0.7)",
                      color: "#94a3b8",
                      borderTopLeftRadius: "4px",
                      fontStyle: isStreamingThisMsg && !msg.content ? "italic" : "normal"
                    }}
                  >
                    {msg.role === "assistant" && !msg.content && streaming
                      ? "Thinking…"
                      : msg.content}
                    {isStreamingThisMsg && msg.content && (
                      <span className="inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse"
                        style={{ background: "#43d9ff" }} />
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-6 h-6 rounded-md grid place-items-center shrink-0 mt-0.5"
                      style={{ background: "rgba(98,245,198,0.1)", border: "1px solid rgba(98,245,198,0.18)", color: "#62f5c6" }}>
                      <User size={12} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Error banner */}
          {error && (
            <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]"
              style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171" }}>
              <AlertCircle size={12} className="shrink-0" />
              <span className="truncate">{error}</span>
              <button
                className="ml-auto transition"
                style={{ color: "rgba(248,113,113,0.6)" }}
                onClick={() => setError(null)}
              >
                ✕
              </button>
            </div>
          )}

          {/* Input row */}
          <form
            className="flex items-center gap-2 px-4 py-2.5 shrink-0"
            style={{ borderTop: "1px solid rgba(29,42,66,0.6)" }}
            onSubmit={(e) => { e.preventDefault(); void send(); }}
          >
            <input
              ref={inputRef}
              className="flex-1 h-9 min-w-0 rounded-lg px-3 text-[12.5px] transition-all"
              style={{
                background: "rgba(6,10,18,0.7)",
                border: "1px solid rgba(29,42,66,0.7)",
                color: "#e2e8f4",
                outline: "none",
                opacity: (streaming || isNotReady) ? 0.5 : 1
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "rgba(67,217,255,0.35)"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(67,217,255,0.07)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "rgba(29,42,66,0.7)"; e.currentTarget.style.boxShadow = ""; }}
              placeholder={isNotReady ? `Repository is ${repository.status}…` : "Ask about this codebase…"}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={streaming || isNotReady}
            />
            <button
              type="submit"
              disabled={streaming || isNotReady || !message.trim()}
              className="h-9 w-9 grid place-items-center rounded-lg transition shrink-0"
              style={{
                background: (streaming || isNotReady || !message.trim())
                  ? "rgba(29,42,66,0.4)"
                  : "linear-gradient(135deg, rgba(67,217,255,0.8), rgba(98,245,198,0.7))",
                color: "#060a12",
                boxShadow: (streaming || isNotReady || !message.trim()) ? "none" : "0 0 12px rgba(67,217,255,0.2)",
                cursor: (streaming || isNotReady || !message.trim()) ? "not-allowed" : "pointer",
                opacity: (streaming || isNotReady || !message.trim()) ? 0.4 : 1
              }}
              title="Send"
            >
              {streaming ? (
                <Loader2 size={14} className="animate-spin" style={{ color: "#43d9ff" }} />
              ) : (
                <Send size={14} />
              )}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
