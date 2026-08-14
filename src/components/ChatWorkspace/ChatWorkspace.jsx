import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Menu,
  MessageCircle,
  Plus,
  Square,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import MarkdownRenderer from "../MarkdownRenderer/MarkdownRenderer";
import WorkspaceModeSwitch from "../WorkspaceModeSwitch/WorkspaceModeSwitch";
import { parseChatSseBuffer } from "./chatStream";
import "./ChatWorkspace.css";

const API_BASE = import.meta.env.VITE_API_BASE || "";
const STORAGE_KEY = "inkmind-chat-workspace-v1";

function createSession() {
  return {
    id: crypto.randomUUID(),
    title: "新对话",
    createdAt: new Date().toISOString(),
    messages: [],
  };
}

function loadWorkspace() {
  const fallback = createSession();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!Array.isArray(saved?.sessions) || !saved.sessions.length) {
      return { sessions: [fallback], activeId: fallback.id };
    }
    const sessions = saved.sessions
      .filter((session) => session?.id && Array.isArray(session.messages))
      .map((session) => ({
        ...session,
        messages: session.messages.map((message) => message.status === "generating"
          ? { ...message, status: "aborted" }
          : message),
      }));
    if (!sessions.length) return { sessions: [fallback], activeId: fallback.id };
    const activeId = sessions.some((session) => session.id === saved.activeId) ? saved.activeId : sessions[0].id;
    return { sessions, activeId };
  } catch {
    return { sessions: [fallback], activeId: fallback.id };
  }
}

async function getError(response) {
  try {
    const data = await response.json();
    return data.error || `请求失败 (${response.status})`;
  } catch {
    return `请求失败 (${response.status})`;
  }
}

function ChatMessage({ message }) {
  const assistant = message.role === "assistant";
  return (
    <article className={`chat-message ${assistant ? "assistant" : "user"}`} aria-label={assistant ? "AI 回复" : "用户消息"}>
      <div className="message-avatar" aria-hidden="true">
        {assistant ? <Bot size={18} /> : <UserRound size={18} />}
      </div>
      <div className="message-body">
        <div className="message-author">{assistant ? "InkMind" : "你"}</div>
        {assistant && message.status === "generating" && !message.content ? (
          <div className="typing-indicator" aria-label="正在生成"><span /><span /><span /></div>
        ) : (
          <div className="chat-markdown"><MarkdownRenderer content={message.content} /></div>
        )}
        {message.status === "aborted" && <span className="message-state">生成已中止</span>}
        {message.status === "failed" && <span className="message-state error">生成失败，请检查配置后重试</span>}
      </div>
    </article>
  );
}

function ChatWorkspace({ onModeChange }) {
  const [workspace, setWorkspace] = useState(loadWorkspace);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const controllerRef = useRef(null);
  const textareaRef = useRef(null);
  const scrollRef = useRef(null);
  const endRef = useRef(null);

  const activeSession = useMemo(
    () => workspace.sessions.find((session) => session.id === workspace.activeId) || workspace.sessions[0],
    [workspace],
  );
  const lastMessage = activeSession?.messages[activeSession.messages.length - 1];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    } catch {
      // 浏览器禁用或配额不足时仍允许当前会话继续使用。
    }
  }, [workspace]);

  useEffect(() => {
    if (!isAtBottom) return undefined;
    const frame = requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
    return () => cancelAnimationFrame(frame);
  }, [activeSession?.id, activeSession?.messages.length, lastMessage?.content, isAtBottom]);

  const updateSession = useCallback((sessionId, updater) => {
    setWorkspace((current) => ({
      ...current,
      sessions: current.sessions.map((session) => session.id === sessionId ? updater(session) : session),
    }));
  }, []);

  const startNewChat = () => {
    if (isGenerating) return;
    if (activeSession?.messages.length === 0) {
      textareaRef.current?.focus();
      return;
    }
    const session = createSession();
    setWorkspace((current) => ({ sessions: [session, ...current.sessions], activeId: session.id }));
    setInput("");
    setError("");
    setSidebarOpen(false);
    setIsAtBottom(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const selectSession = (sessionId) => {
    setWorkspace((current) => ({ ...current, activeId: sessionId }));
    setSidebarOpen(false);
    setError("");
    setIsAtBottom(true);
  };

  const deleteSession = (sessionId) => {
    if (isGenerating || !window.confirm("确定删除这条对话吗？此操作无法撤销。")) return;
    setWorkspace((current) => {
      const remaining = current.sessions.filter((session) => session.id !== sessionId);
      if (!remaining.length) {
        const replacement = createSession();
        return { sessions: [replacement], activeId: replacement.id };
      }
      return {
        sessions: remaining,
        activeId: current.activeId === sessionId ? remaining[0].id : current.activeId,
      };
    });
  };

  const sendMessage = async () => {
    const prompt = input.trim();
    if (!prompt || isGenerating || !activeSession) return;

    const sessionId = activeSession.id;
    const userMessage = { id: crypto.randomUUID(), role: "user", content: prompt, status: "completed" };
    const assistantId = crypto.randomUUID();
    const assistantMessage = { id: assistantId, role: "assistant", content: "", status: "generating" };
    const apiMessages = [
      {
        role: "system",
        content: "你是 InkMind 普通对话助手。清晰、准确地回答用户问题；当前模式不会检索私有知识库，不要声称已经读取用户文档。",
      },
      ...activeSession.messages
        .filter((message) => ["user", "assistant"].includes(message.role) && message.content)
        .slice(-30)
        .map(({ role, content }) => ({ role, content })),
      { role: "user", content: prompt },
    ];

    updateSession(sessionId, (session) => ({
      ...session,
      title: session.messages.length ? session.title : prompt.slice(0, 24),
      messages: [...session.messages, userMessage, assistantMessage],
    }));
    setInput("");
    setError("");
    setIsGenerating(true);
    setIsAtBottom(true);

    const controller = new AbortController();
    controllerRef.current = controller;
    let assistantText = "";
    let renderFrame = null;

    const commitAssistant = (status) => {
      updateSession(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((message) => message.id === assistantId
          ? { ...message, content: assistantText, status }
          : message),
      }));
    };
    const scheduleRender = () => {
      if (renderFrame !== null) return;
      renderFrame = requestAnimationFrame(() => {
        renderFrame = null;
        commitAssistant("generating");
      });
    };

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(await getError(response));

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseChatSseBuffer(buffer);
        buffer = parsed.rest;
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.deltas.length) {
          assistantText += parsed.deltas.join("");
          scheduleRender();
        }
        streamDone = parsed.done;
      }

      if (renderFrame !== null) cancelAnimationFrame(renderFrame);
      renderFrame = null;
      commitAssistant("completed");
    } catch (caught) {
      if (renderFrame !== null) cancelAnimationFrame(renderFrame);
      renderFrame = null;
      if (caught.name === "AbortError") {
        commitAssistant("aborted");
      } else {
        commitAssistant("failed");
        setError(caught.message || "生成失败，请稍后重试");
      }
    } finally {
      controllerRef.current = null;
      setIsGenerating(false);
    }
  };

  const stopGeneration = () => controllerRef.current?.abort();

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    setIsAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 96);
  };

  const examples = [
    "帮我制定一份前端秋招复习计划",
    "解释 React 中 useEffect 的常见陷阱",
    "如何向面试官介绍一个 AI Agent 项目？",
  ];

  return (
    <main id="chat-workspace-content" className="chat-shell" tabIndex="-1">
      <header className="chat-mobile-header">
        <button className="icon-control" type="button" onClick={() => setSidebarOpen(true)} aria-label="打开对话列表"><Menu size={20} /></button>
        <WorkspaceModeSwitch mode="chat" onChange={onModeChange} compact />
        <button className="icon-control" type="button" onClick={startNewChat} disabled={isGenerating} aria-label="新建对话"><Plus size={20} /></button>
      </header>

      <aside className={`chat-sidebar ${sidebarOpen ? "is-open" : ""}`} aria-label="对话列表">
        <div className="chat-brand">
          <div><span className="eyebrow">InkMind workspace</span><h1>普通对话</h1></div>
          <button className="chat-sidebar-close icon-control" type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭对话列表"><X size={18} /></button>
        </div>
        <button className="new-chat-button" type="button" onClick={startNewChat} disabled={isGenerating}>
          <Plus size={17} />新建对话
        </button>
        <div className="session-list">
          {workspace.sessions.map((session) => (
            <article key={session.id} className={`session-item ${session.id === activeSession?.id ? "active" : ""}`}>
              <button type="button" className="session-select" onClick={() => selectSession(session.id)} aria-current={session.id === activeSession?.id ? "page" : undefined}>
                <MessageCircle size={16} aria-hidden="true" />
                <span>{session.title}</span>
              </button>
              <button type="button" className="session-delete" onClick={() => deleteSession(session.id)} disabled={isGenerating} aria-label={`删除对话 ${session.title}`}><Trash2 size={15} /></button>
            </article>
          ))}
        </div>
        <div className="provider-note"><span className="status-dot" /> DeepSeek · 流式对话</div>
      </aside>

      <section className="chat-main">
        <div className="chat-topbar">
          <div className="chat-title"><span className="eyebrow">Conversation</span><h2>{activeSession?.title || "新对话"}</h2></div>
          <WorkspaceModeSwitch mode="chat" onChange={onModeChange} />
          <div className="chat-model"><Bot size={14} />DeepSeek</div>
        </div>

        <div className="chat-scroll" ref={scrollRef} onScroll={handleScroll}>
          {activeSession?.messages.length ? (
            <div className="message-list">
              {activeSession.messages.map((message) => <ChatMessage key={message.id} message={message} />)}
              <div ref={endRef} />
            </div>
          ) : (
            <section className="chat-empty-state">
              <div className="chat-empty-mark"><MessageCircle size={26} /></div>
              <span className="eyebrow">普通对话</span>
              <h3>有什么想一起梳理的？</h3>
              <p>适合快速问答、代码解释和头脑风暴。需要基于私有资料完成复杂任务时，请切换到知识研究模式。</p>
              <div className="chat-example-grid">
                {examples.map((example) => <button type="button" key={example} onClick={() => { setInput(example); textareaRef.current?.focus(); }}>{example}</button>)}
              </div>
            </section>
          )}
          {!isAtBottom && activeSession?.messages.length > 0 && (
            <button className="back-to-bottom" type="button" onClick={() => { setIsAtBottom(true); endRef.current?.scrollIntoView({ behavior: "smooth" }); }}>
              <ArrowDown size={16} />回到底部
            </button>
          )}
        </div>

        <div className="chat-composer-wrap">
          {error && <div className="chat-error" role="alert">{error}</div>}
          <div className="chat-composer">
            <label htmlFor="chat-input">发送消息</label>
            <textarea
              id="chat-input"
              name="chat-message"
              autoComplete="off"
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              maxLength={8000}
              disabled={isGenerating}
              placeholder="输入消息，Enter 发送，Shift + Enter 换行…"
            />
            <div className="chat-composer-footer">
              <span>普通对话不会检索已上传的知识库</span>
              {isGenerating ? (
                <button className="chat-stop" type="button" onClick={stopGeneration}><Square size={15} fill="currentColor" />停止生成</button>
              ) : (
                <button className="chat-send" type="button" onClick={sendMessage} disabled={!input.trim()} aria-label="发送消息"><ArrowUp size={18} /></button>
              )}
            </div>
          </div>
        </div>
      </section>

      {sidebarOpen && <button type="button" className="chat-scrim" onClick={() => setSidebarOpen(false)} aria-label="关闭对话列表" />}
    </main>
  );
}

export default ChatWorkspace;
