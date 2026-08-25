# InkMind — 对话与可观测知识研究 Agent

一个同时支持普通多轮对话与多文档知识研究的 AI 工作台。用户可在低门槛 Chat 模式中快速问答，也可以导入 PDF、Markdown 或 TXT，在 Research 模式中生成可编辑研究计划，通过 Agent 工具调用检索知识库，并流式生成带原文引用的结构化报告。

## 核心能力

- **双模式工作区**：普通 Chat 支持多会话、MySQL 持久化、本地缓存、上下文对话、流式输出和停止生成；Research 聚焦私有知识研究，并支持刷新后恢复计划、时间线、引用和报告。
- **服务端 Agent 编排**：DeepSeek 负责 Planner、原生 Function Calling、证据评估与报告生成，浏览器只消费类型化事件。
- **多阶段 RAG**：讯飞 Embedding → LanceDB Top-20 向量召回 → 讯飞 Rerank Top-5，精排失败自动降级。
- **可追溯引用**：每条证据保留文档、页码、chunk ID、向量分数和精排分数，可在前端查看原文。
- **可观测执行过程**：研究步骤、检索状态、Citation 和文本增量通过 SSE 实时同步。
- **Human-in-the-loop**：模型先生成 2–4 步计划，用户确认或编辑后才执行。
- **安全边界**：最多 6 次检索、一次补充检索轮次、90 秒超时、Zod 参数校验及主动中止。
- **双存储持久化**：MySQL + Prisma 管理用户、会话、消息、文档元数据和 Research Run；LanceDB 专注保存 Chunk、Embedding 和向量检索。

## 架构

```mermaid
flowchart LR
  CHAT["React 普通 Chat"] -->|"多轮消息 / SSE"| API["Node.js + Express"]
  UI["React 研究工作区"] -->|"计划确认 / 类型化 SSE"| API
  API --> DS["DeepSeek Chat API\nPlanner / Tool Calls / Report"]
  API --> XF["讯飞 Embedding + Rerank"]
  API --> LD["LanceDB research_chunks_v1"]
  API --> MYSQL["MySQL + Prisma\nChat / Document / Research Run"]
  DOC["PDF / MD / TXT"] --> API
  LD -->|"带页码 Citation"| API
  API -->|"类型化 ResearchEvent"| UI
```

关键设计：生成模型、Embedding 和 Reranker 通过 Provider 接口解耦；业务数据通过 `BusinessStore` 解耦为 MySQL 实现和内存降级实现。MySQL 不重复保存高维向量，依靠 `documentId`、`chunkId` 与 LanceDB 关联。

## 快速开始

要求 Node.js 24+（PDF.js 6 的运行时要求）。

```bash
npm install
copy .env.example .env
```

本地已有 MySQL 时创建 `inkmind` 数据库和用户；也可以在安装 Docker 后使用仓库内的 Compose 配置：

```bash
docker compose up -d mysql
```

在 `.env` 中填写：

```env
DEEPSEEK_API_KEY=你的 DeepSeek Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash

XUNFEI_API_KEY=你的讯飞 Key
XUNFEI_BASE_URL=https://maas-api.cn-huabei-1.xf-yun.com/v2
XUNFEI_EMBEDDING_MODEL=控制台中的 Embedding 服务模型 ID
XUNFEI_RERANK_MODEL=控制台中的 Rerank 服务模型 ID

DATABASE_URL=mysql://inkmind:inkmind_dev@localhost:3306/inkmind

PORT=3001
```

首次启动前生成 Prisma Client 并执行迁移：

```bash
npm run db:generate
npm run db:deploy
```

开发阶段修改 Prisma Schema 后使用 `npm run db:migrate` 创建新迁移。若暂时不配置 `DATABASE_URL`，服务端会使用内存 `BusinessStore`，AI 对话和研究仍可运行，但刷新/重启后的服务端持久化能力不可保证。

需要验证真实 MySQL CRUD 时，在数据库可用且当前终端已配置 `DATABASE_URL` 后运行：

```bash
npm run test:mysql
```

分别启动后端和前端：

```bash
npm run server
npm run dev
```

浏览器打开 `http://localhost:5173`，可在“普通对话 / 知识研究”之间切换。配置 MySQL 后，普通会话和研究记录由服务端持久化，localStorage 只作为前端缓存；上传文档的原文 Chunk 和向量仍写入 `data/research-v1`。数据库目录、向量目录和密钥均不会提交到 Git。

当前使用固定的 `local-user` 作为单用户开发身份，数据模型已经预留 `userId` 关系，但尚未实现登录鉴权。

## API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health` | 服务与 Provider 配置状态 |
| GET | `/api/chat/sessions` | 获取服务端会话和消息 |
| DELETE | `/api/chat/sessions/:id` | 删除会话并级联删除消息 |
| POST | `/api/documents` | multipart 上传并建立索引，字段名为 `files` |
| GET | `/api/documents` | 获取文档与索引状态 |
| DELETE | `/api/documents/:id` | 删除文档及向量 |
| POST | `/api/research/plans` | 生成可编辑研究计划 |
| POST | `/api/research/runs` | 确认计划并启动 SSE 研究任务 |
| GET | `/api/research/runs` | 获取研究历史摘要 |
| GET | `/api/research/runs/:runId` | 恢复计划、事件、引用和报告 |
| DELETE | `/api/research/runs/:runId` | 删除研究记录及其事件、引用 |
| POST | `/api/research/runs/:runId/cancel` | 中止研究任务 |
| GET | `/api/knowledge/search?q=` | 只读检索与评测接口 |
| POST | `/api/chat` | 普通 DeepSeek 多轮流式对话接口，支持客户端中止 |

## 数据持久化职责

| 存储 | 数据 |
| --- | --- |
| MySQL | 用户、Chat Session、Message、Document 元数据、Research Run、非文本增量事件、Citation、最终报告 |
| LanceDB | 文档 Chunk、原文片段、页码、Embedding、向量检索字段 |
| localStorage | Chat 工作区缓存、最后查看的 Research Run ID |
| Node.js 内存 | 运行中的 `AbortController`；未配置 MySQL 时作为业务数据降级存储 |

`text.delta` 只通过 SSE 实时发送，不逐 token 写入 MySQL；任务完成后一次性保存最终 Markdown 报告，避免产生大量细碎数据库写入。Prisma Schema 和首个迁移位于 `prisma/`。

## ResearchEvent

每个事件都包含 `runId`、递增 `sequence` 和时间戳。前端按运行 ID 隔离，并用 sequence 排序去重。

```text
run.started → plan.confirmed → step.started
→ tool.started → citation.collected → tool.completed
→ step.completed → text.delta* → run.completed
```

失败路径为 `run.failed`，主动中止或超时为 `run.cancelled`。UI 不展示模型内部思维链，只呈现计划、工具输入摘要、结果和来源。

## 工程验证

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

RAG 评测集位于 `evals/rag-cases.json`。导入匹配的评测资料并启动服务后运行：

```bash
npm run eval:rag
```

脚本输出 Recall@5、MRR 和 P95 检索延迟。简历中应只使用该脚本实际产生的指标，不使用未经复现的“100% 准确率”。

## 项目取舍

- 选择自研轻量 Planner–Executor–Evaluator，而不是为了框架名接入 LangGraph，便于在有限周期内讲清 Agent 循环和事件协议。
- 不实现多 Agent、MCP 和联网搜索；当前以固定本地用户完成数据关系和持久化闭环，账号鉴权后置。
- 讯飞 Rerank 不可用时允许降级为向量排序；Embedding 未配置时拒绝建立伪语义索引并返回可恢复错误。
- 当前 Markdown 与高亮依赖仍使主包超过 500 KB，后续可通过懒加载进一步拆包。
