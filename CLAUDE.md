# CLAUDE.md

本文件为在此仓库中工作的编码助手提供当前架构说明。

## 常用命令

```bash
npm run dev          # Vite 前端，默认端口 5173
npm run server       # Express + TypeScript 后端，默认端口 3001
npm run typecheck
npm run lint
npm test
npm run build
npm run db:generate  # 生成 Prisma Client
npm run db:migrate   # 开发环境创建并执行迁移
npm run db:deploy    # 执行仓库中已有迁移
npm run db:studio
```

## 环境配置

参照 `.env.example`。核心变量为：

```text
DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL
XUNFEI_API_KEY / XUNFEI_BASE_URL
XUNFEI_EMBEDDING_MODEL / XUNFEI_RERANK_MODEL
DATABASE_URL=mysql://...
PORT=3001
VITE_API_BASE / VITE_API_PROXY_TARGET
```

配置 `DATABASE_URL` 时使用 MySQL + Prisma 持久化业务数据；未配置时使用内存 `BusinessStore`，不要把内存降级描述为永久存储。

## 当前架构

```text
React SPA
├─ ChatWorkspace：普通多会话 Chat、SSE、localStorage 缓存
└─ ResearchWorkspace：文档、计划确认、Agent 时间线、引用和历史恢复
        ↓
Express + TypeScript（server.ts）
├─ DeepSeekProvider：Chat、JSON Output、Function Calling、SSE
├─ XunfeiRagProvider：Embedding、Rerank
├─ ResearchAgent：Planner → Executor → Evaluator → Synthesizer
├─ BusinessStore
│  ├─ PrismaBusinessStore：MySQL 持久化
│  └─ MemoryBusinessStore：无数据库时降级
└─ DocumentStore：LanceDB Chunk 与向量
```

## 存储职责

- MySQL：固定本地用户、Chat Session、Message、Document 元数据、Research Run、Research Event、Citation、最终报告。
- LanceDB：`research_chunks_v1`，保存 Chunk、原文片段、页码、Embedding 和索引字段。
- `documents.json`：LanceDB 文档清单和本地恢复信息，启动时同步到 MySQL。
- localStorage：Chat 前端缓存和最后查看的 Research Run ID。
- Node.js Map：仅保存运行中的 `AbortController`。

不要把完整 Embedding 重复写入 MySQL。MySQL 与 LanceDB 通过 `documentId` 和 `chunkId` 关联。原始上传文件目前不会复制到对象存储。

## 关键文件

```text
server.ts
prisma/schema.prisma
prisma/migrations/
src/server/persistence/
src/server/documents/documentStore.ts
src/server/research/researchAgent.ts
src/server/providers/
src/components/ChatWorkspace/
src/components/ResearchWorkspace/
src/shared/research.ts
```

## 事件持久化

Research Agent 继续通过 SSE 向前端发送全部 `ResearchEvent`。MySQL 保存步骤、工具、Citation 和结束状态等结构化事件；`text.delta` 不逐 token 落库，最终报告在任务完成后整体保存。恢复历史时，前端使用结构化事件重建时间线，再使用 `research_runs.report` 恢复报告。

## 开发约束

- 修改 Prisma Schema 后必须生成迁移并执行 `npm run db:generate`。
- 不提交 `.env`、`data/`、生成的 Prisma Client 和数据库本地数据。
- Rerank 失败必须保留向量召回降级。
- UI 不展示模型内部思维链。
- 新的异步链路需要保留 AbortController 和 90 秒安全边界。
- 完成修改后执行 typecheck、lint、test、build；涉及 UI 时运行 `scripts/smoke_ui.py`。

回答我的消息时结尾加一个喵。
