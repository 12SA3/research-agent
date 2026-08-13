# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在此仓库中工作时提供指导。

## 常用命令

```bash
npm run dev      # 启动 Vite 开发服务器（前端，端口 5173）
npm run server   # 启动 Node.js 后端代理（端口 3001）
npm run build    # 生产构建 → dist/
npm run lint     # ESLint 检查（最大警告数 0）
npm run preview  # 本地预览生产构建
```

`dev` 和 `server` 必须同时运行应用才能正常工作 — 前端会向 `http://localhost:3001/api/chat` 发送 POST 请求。

`.env` 环境变量：
```
XUNFEI_API_KEY=<你的密钥>
PORT=3001
```

## 架构

该应用是一个双进程 AI 对话应用：Vite/React SPA 前端 + Node.js HTTP 代理后端。

### 数据流

```
用户输入 → Main.jsx → Context.onSent() → streamParser.fetchStream()
  → POST http://localhost:3001/api/chat
  → server.js 转发至讯飞星火 MaaS API（HTTPS, SSE 流式）
  → server 将响应以 SSE 形式 pipe 回前端
  → streamParser：ReadableStream → TextDecoder → SSE 缓冲区 → 渲染缓冲区
  → 定时 flush（50ms 间隔，每次 8 个字符） → onChunk 回调
  → Context 更新消息状态 → Virtuoso 重新渲染 → 自动滚动
```

### 核心分层

**1. 流式解析层（`src/services/streamParser.js`）**
单例类，采用双缓冲区设计：
- `sseBuffer` — 累积原始 SSE 行，按 `\n` 分割，解析 `data: {...}` 数据帧
- `renderBuffer` — 存放解码后的增量内容，每 50ms 以 8 个字符为一批进行 flush
- 通过 `AbortController` 支持中断 — 调用 `flushAll()` 后停止
- 以单例模式导出（`export default new StreamParser()`）

**2. 全局状态层（`src/context/Context.jsx`）**
单一 `Context` Provider，持有应用所有状态：
- `sessions[]` — 所有对话会话及其消息；仅保存在内存中（无 localStorage 持久化）
- `currentSessionId` — 当前活跃会话；切换时调用 `loadSession()` 恢复消息/输入/结果数据
- `messages[]` — 当前会话的消息数组；每条消息结构为 `{id, role, content, timestamp, status}`
- 生成状态：`"generating"` | `"completed"` | `"aborted"` | `"failed"`
- `onSent()` — 核心函数：创建用户消息和 AI 消息，调用 `streamParser.fetchStream()` 并传入三个回调（onChunk、onError、onComplete）
- `updateSessionMessages()` — 每次状态变更后将消息同步回 sessions 数组

**3. 渲染与交互层（`src/components/Main/Main.jsx`）**
- 使用 `react-virtuoso` 实现虚拟滚动（适用于大量消息列表）
- `followOutput` 由 `isAtBottom` 标志控制 — 用户向上滚动时暂停自动滚动，1 秒后恢复
- Markdown 渲染使用 `react-markdown` + `remark-gfm` + `rehype-highlight`（GitHub-dark 主题）
- 通过 `useSpeechRecognition` Hook 实现语音输入（Web Speech API，中文识别）
- 发送按钮在 AI 生成过程中变为停止按钮（`abortGeneration`）

**4. 后端代理层（`server.js`）**
- 使用原生 `http`/`https` 模块，未使用 Express
- `POST /api/chat` — 将消息转发至讯飞星火 MaaS API（`maas-api.cn-huabei-1.xf-yun.com/v2/chat/completions`），将 SSE 响应 pipe 回前端
- `GET /health` — 健康检查
- 错误/超时处理会先写入错误 SSE 事件，再发送 `[DONE]`

### 废弃文件

- `src/config/aiService.js` — DeepSeek API 客户端（未接入应用；已被后端代理替代）
- `src/config/gemini.js` — Google Gemini 客户端（同样未使用；引用了未定义的 `API_KEY`/`MODEL_NAME`）

两者均为早期迭代的遗留代码。当前实际路径为 `streamParser → server.js → 讯飞星火`。

### 多会话模型

会话完全由 Context 状态管理（无持久化）。核心操作：
- `createNewSession()` — 在列表头部创建新会话，并设为当前会话
- `loadSession(id)` — 从会话对象恢复消息/输入/结果数据
- `deleteSession(id)` — 删除会话；如果删除的是当前会话，则自动切换到第一个剩余会话，若无剩余则创建新会话


### 回答消息时
回答我的消息时结尾加一个喵