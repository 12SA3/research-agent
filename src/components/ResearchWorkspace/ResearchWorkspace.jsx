import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { BookOpen, Check, ChevronRight, FileText, Menu, PanelRight, Play, Plus, Search, Square, Trash2, Upload, X } from "lucide-react";
import MarkdownRenderer from "../MarkdownRenderer/MarkdownRenderer";
import WorkspaceModeSwitch from "../WorkspaceModeSwitch/WorkspaceModeSwitch";
import { initialResearchState, researchReducer } from "./researchReducer";
import "./ResearchWorkspace.css";

const API_BASE = import.meta.env.VITE_API_BASE || "";

async function getError(response) {
  try {
    const data = await response.json();
    return data.error || `请求失败 (${response.status})`;
  } catch {
    return `请求失败 (${response.status})`;
  }
}

function ResearchWorkspace({ onModeChange }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [state, dispatch] = useReducer(researchReducer, initialResearchState);
  const fileInputRef = useRef(null);
  const streamControllerRef = useRef(null);

  const loadDocuments = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/documents`);
    if (!response.ok) throw new Error(await getError(response));
    const data = await response.json();
    setDocuments(data.documents || []);
    setSelectedDocumentIds((current) => current.filter((id) => data.documents.some((document) => document.id === id)));
  }, []);

  useEffect(() => {
    loadDocuments().catch((error) => dispatch({ type: "local.error", message: error.message }));
  }, [loadDocuments]);

  const createPlan = async () => {
    if (!question.trim()) return;
    dispatch({ type: "planning" });
    try {
      const response = await fetch(`${API_BASE}/api/research/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), documentIds: selectedDocumentIds }),
      });
      if (!response.ok) throw new Error(await getError(response));
      const { plan } = await response.json();
      dispatch({ type: "plan.ready", plan });
    } catch (error) {
      dispatch({ type: "local.error", message: error.message });
    }
  };

  const startRun = async () => {
    if (!state.plan) return;
    const runId = crypto.randomUUID();
    const controller = new AbortController();
    streamControllerRef.current = controller;
    dispatch({ type: "run.prepare", runId });
    try {
      const response = await fetch(`${API_BASE}/api/research/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, question, documentIds: selectedDocumentIds, plan: state.plan }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(await getError(response));
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let reading = true;
      while (reading) {
        const { done, value } = await reader.read();
        if (done) {
          reading = false;
          continue;
        }
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          const line = block.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;
          dispatch({ type: "event", event: JSON.parse(line.slice(5).trim()) });
        }
      }
    } catch (error) {
      if (error.name !== "AbortError") dispatch({ type: "local.error", message: error.message });
    } finally {
      streamControllerRef.current = null;
    }
  };

  const cancelRun = async () => {
    if (!state.runId) return;
    try {
      const response = await fetch(`${API_BASE}/api/research/runs/${state.runId}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error(await getError(response));
    } catch (error) {
      streamControllerRef.current?.abort();
      dispatch({ type: "local.error", message: error.message });
    }
  };

  const handleFiles = async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      const response = await fetch(`${API_BASE}/api/documents`, { method: "POST", body: form });
      if (!response.ok) throw new Error(await getError(response));
      const data = await response.json();
      await loadDocuments();
      setSelectedDocumentIds((current) => [...new Set([...current, ...data.documents.map((document) => document.id)])]);
    } catch (error) {
      dispatch({ type: "local.error", message: error.message });
    } finally {
      setUploading(false);
    }
  };

  const deleteDocument = async (documentId) => {
    const response = await fetch(`${API_BASE}/api/documents/${documentId}`, { method: "DELETE" });
    if (!response.ok) return dispatch({ type: "local.error", message: await getError(response) });
    await loadDocuments();
  };

  const updateStep = (index, field, value) => {
    const plan = { ...state.plan, steps: state.plan.steps.map((step, stepIndex) => stepIndex === index ? { ...step, [field]: value } : step) };
    dispatch({ type: "plan.update", plan });
  };

  const selectedCount = selectedDocumentIds.length;
  const statusLabel = useMemo(() => ({
    idle: "等待任务", planning: "正在规划", ready: "计划待确认", running: "研究执行中", completed: "研究完成", failed: "执行失败", cancelled: "已中止",
  }[state.status]), [state.status]);

  return (
    <main className="research-shell">
      <header className="mobile-header">
        <button className="icon-control" onClick={() => setLeftOpen(true)} aria-label="打开文档库"><Menu size={20} /></button>
        <WorkspaceModeSwitch mode="research" onChange={onModeChange} compact />
        <button className="icon-control" onClick={() => setRightOpen(true)} aria-label="打开执行时间线"><PanelRight size={20} /></button>
      </header>

      <aside className={`document-panel ${leftOpen ? "is-open" : ""}`} aria-label="知识库文档">
        <div className="panel-heading">
          <div><span className="eyebrow">Knowledge base</span><h1>研究资料库</h1></div>
          <button className="mobile-close icon-control" onClick={() => setLeftOpen(false)} aria-label="关闭文档库"><X size={18} /></button>
        </div>
        <input ref={fileInputRef} hidden type="file" accept=".pdf,.md,.markdown,.txt" multiple onChange={handleFiles} />
        <button className="upload-button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <span className="spinner" /> : <Upload size={18} />}
          {uploading ? "解析并建立索引…" : "导入 PDF / MD / TXT"}
        </button>
        <p className="panel-hint">单文件最大 10 MB，一次最多 10 个。上传内容仅保存在本机。</p>
        <div className="document-list">
          {documents.length === 0 ? (
            <div className="empty-card"><FileText size={24} /><p>还没有资料</p><span>导入几份技术文档或岗位 JD 开始研究</span></div>
          ) : documents.map((document) => {
            const selected = selectedDocumentIds.includes(document.id);
            return (
              <article key={document.id} className={`document-card ${selected ? "selected" : ""}`}>
                <button className="document-select" onClick={() => setSelectedDocumentIds((ids) => selected ? ids.filter((id) => id !== document.id) : [...ids, document.id])} aria-pressed={selected}>
                  <span className="check-box">{selected && <Check size={13} />}</span>
                  <span className="document-copy"><strong>{document.title}</strong><small>{document.pages} 页 · {document.chunksCount} 个片段</small></span>
                </button>
                <button className="delete-control" onClick={() => deleteDocument(document.id)} aria-label={`删除 ${document.title}`}><Trash2 size={16} /></button>
              </article>
            );
          })}
        </div>
        <div className="provider-note"><span className="status-dot" /> DeepSeek Agent · 讯飞 RAG</div>
      </aside>

      <section className="research-main">
        <div className="workspace-topbar">
          <div><span className="eyebrow">AI knowledge researcher</span><h2>知识研究工作台</h2></div>
          <WorkspaceModeSwitch mode="research" onChange={onModeChange} />
          <div className={`run-status status-${state.status}`}><span />{statusLabel}</div>
        </div>

        <div className="research-content">
          {state.status === "idle" && !state.plan ? (
            <section className="hero-state">
              <div className="hero-mark"><BookOpen size={30} /></div>
              <span className="eyebrow">Grounded answers, visible process</span>
              <h3>让 Agent 带着证据完成研究</h3>
              <p>选择资料并描述研究目标。Agent 会先制定计划，再检索、评估证据并生成可追溯的报告。</p>
              <div className="example-grid">
                {["对比这些 JD 的共同技能要求，并给出准备优先级", "总结文档中的核心方案、风险与待确认事项", "从多份资料中梳理同一主题的观点差异"].map((example) => (
                  <button key={example} onClick={() => setQuestion(example)}>{example}<ChevronRight size={16} /></button>
                ))}
              </div>
            </section>
          ) : null}

          {state.plan && (
            <section className="plan-section">
              <div className="section-title"><div><span className="eyebrow">Research plan</span><h3>研究计划</h3></div><span>{state.plan.steps.length} 个步骤</span></div>
              <div className="plan-list">
                {state.plan.steps.map((step, index) => (
                  <article className="plan-card" key={step.id}>
                    <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <input aria-label={`步骤 ${index + 1} 标题`} value={step.title} disabled={state.status === "running" || state.status === "completed"} onChange={(event) => updateStep(index, "title", event.target.value)} />
                      <textarea aria-label={`步骤 ${index + 1} 检索问题`} value={step.query} disabled={state.status === "running" || state.status === "completed"} onChange={(event) => updateStep(index, "query", event.target.value)} />
                    </div>
                  </article>
                ))}
              </div>
              {state.status === "ready" && <button className="primary-button" onClick={startRun}><Play size={17} fill="currentColor" />确认计划并开始研究</button>}
            </section>
          )}

          {(state.report || state.status === "running") && (
            <section className="report-section" aria-live="polite">
              <div className="section-title"><div><span className="eyebrow">Research report</span><h3>研究报告</h3></div><span>{state.citations.length} 条引用</span></div>
              <article className="report-paper">
                {state.report ? <MarkdownRenderer content={state.report} /> : <div className="report-loading"><span className="spinner" />正在汇总证据并撰写报告…</div>}
              </article>
            </section>
          )}

          {state.error && <div className="error-banner" role="alert"><span>{state.error}</span><button onClick={() => dispatch({ type: "reset" })}>重新开始</button></div>}
        </div>

        <div className="research-composer">
          <label htmlFor="research-question">研究问题</label>
          <div className="composer-box">
            <textarea id="research-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：对比这些资料的核心观点，并给出有依据的结论…" rows={2} disabled={state.status === "running"} />
            <div className="composer-footer"><span><FileText size={14} />已选择 {selectedCount} 份资料</span>{state.status === "running" ? <button className="stop-button" onClick={cancelRun}><Square size={15} fill="currentColor" />中止</button> : <button className="primary-button compact" onClick={createPlan} disabled={!question.trim() || state.status === "planning"}>{state.status === "planning" ? <span className="spinner" /> : <Plus size={17} />}生成计划</button>}</div>
          </div>
        </div>
      </section>

      <aside className={`trace-panel ${rightOpen ? "is-open" : ""}`} aria-label="Agent 执行时间线">
        <div className="panel-heading"><div><span className="eyebrow">Agent trace</span><h2>执行时间线</h2></div><button className="mobile-close icon-control" onClick={() => setRightOpen(false)} aria-label="关闭执行时间线"><X size={18} /></button></div>
        <div className="timeline" aria-live="polite">
          {state.timeline.length === 0 ? <div className="empty-card trace-empty"><Search size={24} /><p>等待研究开始</p><span>计划、检索和证据状态将在这里实时呈现</span></div> : state.timeline.map((item) => (
            <article key={item.id} className={`timeline-item ${item.status}`}><span className="timeline-node">{item.status === "completed" ? <Check size={12} /> : <span />}</span><div><strong>{item.title}</strong>{item.detail && <p>{item.detail}</p>}</div></article>
          ))}
        </div>
        <div className="citation-section"><div className="section-title small"><h3>来源引用</h3><span>{state.citations.length}</span></div>{state.citations.length === 0 ? <p className="panel-hint">检索到的原文片段会出现在这里。</p> : <div className="citation-list">{state.citations.map((citation) => <button key={citation.id} onClick={() => setSelectedCitation(citation)}><span>{citation.title}{citation.page ? ` · P${citation.page}` : ""}</span><small>{citation.excerpt.slice(0, 90)}…</small></button>)}</div>}</div>
      </aside>

      {(leftOpen || rightOpen) && <button className="mobile-scrim" onClick={() => { setLeftOpen(false); setRightOpen(false); }} aria-label="关闭面板" />}
      {selectedCitation && <div className="citation-dialog" role="dialog" aria-modal="true" aria-labelledby="citation-title"><button className="mobile-scrim" onClick={() => setSelectedCitation(null)} aria-label="关闭引用" /><article><div className="dialog-heading"><div><span className="eyebrow">Source evidence</span><h3 id="citation-title">{selectedCitation.title}</h3></div><button className="icon-control" onClick={() => setSelectedCitation(null)} aria-label="关闭"><X size={18} /></button></div><p className="citation-meta">{selectedCitation.page ? `第 ${selectedCitation.page} 页 · ` : ""}{selectedCitation.chunkId}</p><blockquote>{selectedCitation.excerpt}</blockquote><div className="score-row"><span>向量相关度 {(selectedCitation.vectorScore * 100).toFixed(0)}%</span>{selectedCitation.rerankScore !== undefined && <span>精排分数 {selectedCitation.rerankScore.toFixed(3)}</span>}</div></article></div>}
    </main>
  );
}

export default ResearchWorkspace;
