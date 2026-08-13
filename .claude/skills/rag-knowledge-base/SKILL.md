---
name: rag-knowledge-base
description: Guide for implementing RAG (Retrieval-Augmented Generation) knowledge base in the ai-Chat project. Use this skill whenever the user asks about knowledge bases, RAG, document Q&A, vector search, embeddings, semantic search, or adding custom data sources to the chat application. Also use when the user wants to make the AI answer from their own documents or mentions "building a knowledge base".
---

# RAG Knowledge Base for ai-Chat

This skill guides you through adding a RAG knowledge base to the ai-Chat project (React + Node.js + 讯飞星火 MaaS API). It is implemented in three phases, each building on the previous one.

## Project Architecture Recap

```
前端 (React) → server.js (Node.js 原生 http) → 讯飞星火 MaaS API
                ↑ 新增：RAG 检索层将加在这里
```

Key files to modify:
- `server.js` — main backend, add retrieval + embedding calls
- `src/context/Context.jsx` — state management, add knowledge base UI state
- `src/services/streamParser.js` — SSE parser (minimal changes needed)
- `.env` — environment variables

The project uses **native Node.js http/https modules** (no Express). Any new backend code must follow this pattern, using `http.createServer` and manual body parsing.

---

## Phase 1: Simple Knowledge Injection (Verify the RAG Concept)

**Goal:** Prove that injecting relevant context into the prompt improves answers, with zero new dependencies.

### Step 1.1: Create the knowledge service

Create `src/services/knowledgeService.js`:

```js
// Phase 1: Simple keyword-based knowledge retrieval
// No embedding API needed yet — just demonstrate the RAG pattern

class KnowledgeService {
  constructor() {
    // In-memory document store: each doc is { id, title, content, chunks }
    this.documents = [];
  }

  // Load a document and split it into chunks by paragraphs or fixed size
  loadDocument(title, rawText, chunkSize = 500) {
    const paragraphs = rawText.split(/\n\n+/).filter(p => p.trim());
    const chunks = [];
    
    for (const para of paragraphs) {
      if (para.length <= chunkSize) {
        chunks.push(para.trim());
      } else {
        // Split long paragraphs by sentences within chunkSize
        const sentences = para.match(/[^。！？.!?]+[。！？.!?]?/g) || [];
        let current = '';
        for (const s of sentences) {
          if ((current + s).length > chunkSize && current) {
            chunks.push(current.trim());
            current = s;
          } else {
            current += s;
          }
        }
        if (current.trim()) chunks.push(current.trim());
      }
    }
    
    const id = Date.now().toString();
    this.documents.push({ id, title, content: rawText, chunks });
    return { id, chunksCount: chunks.length };
  }

  // Simple keyword relevance scoring (no embeddings)
  search(query, topK = 3) {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const scored = [];

    for (const doc of this.documents) {
      for (let i = 0; i < doc.chunks.length; i++) {
        const chunk = doc.chunks[i];
        const chunkLower = chunk.toLowerCase();
        
        // Score: how many query terms appear in this chunk
        let score = 0;
        for (const term of queryTerms) {
          if (chunkLower.includes(term)) score += 1;
          // Bonus for exact phrase match
          if (chunkLower.includes(query.toLowerCase())) score += 3;
        }
        
        if (score > 0) {
          scored.push({ docId: doc.id, title: doc.title, chunkIndex: i, content: chunk, score });
        }
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  // Format retrieved chunks as context string for the prompt
  buildContext(query, topK = 3) {
    const results = this.search(query, topK);
    if (results.length === 0) return null;
    
    return results
      .map((r, i) => `[参考资料${i + 1} — 来自《${r.title}》]\n${r.content}`)
      .join('\n\n---\n\n');
  }

  // Build the system prompt with injected knowledge
  buildSystemPrompt(query) {
    const context = this.buildContext(query);
    const basePrompt = '你是一个智能助手。请根据提供的参考资料回答问题。如果资料中没有相关信息，请明确说"根据现有资料，我无法回答这个问题"。';
    
    if (context) {
      return `${basePrompt}\n\n## 参考资料\n${context}`;
    }
    return `${basePrompt}\n\n（没有找到相关参考资料，请根据你的知识回答，但要注明你不确定。）`;
  }
}

// Singleton instance
const knowledgeService = new KnowledgeService();
export default knowledgeService;
```

### Step 1.2: Create admin API for loading documents

Add new routes in `server.js`:

```js
// In server.js, after the existing POST /api/chat handler, add:

// POST /api/knowledge/load — load a document into the knowledge base
if (req.method === 'POST' && req.url === '/api/knowledge/load') {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { title, content } = JSON.parse(body);
      const result = knowledgeService.loadDocument(title, content);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (error) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

// GET /api/knowledge/documents — list loaded documents
if (req.method === 'GET' && req.url === '/api/knowledge/documents') {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ documents: knowledgeService.documents.map(d => ({
    id: d.id, title: d.title, chunksCount: d.chunks.length
  })) }));
}
```

Import `knowledgeService` at the top of `server.js`:

```js
import knowledgeService from './src/services/knowledgeService.js';
```

### Step 1.3: Modify the chat endpoint to use knowledge context

In `server.js`, modify `handleStreamRequest` to accept and use a `query` field:

```js
// Inside the POST /api/chat handler, after parsing body:
const { messages, query } = requestData;  // query = the original user question for RAG

// Build system message with injected knowledge
const knowledgeContext = query ? knowledgeService.buildSystemPrompt(query) : null;

const requestBody = {
  model: 'xop35qwen2b',
  messages: knowledgeContext 
    ? [{ role: 'system', content: knowledgeContext }, ...messages]
    : messages,
  max_tokens: 4000,
  temperature: 0.7,
  stream: true
};
```

### Step 1.4: Update frontend to pass query for RAG

In `src/context/Context.jsx`, modify `onSent` to pass the user's original question as `query`:

```js
// Inside onSent(), when calling streamParser.fetchStream:
await streamParser.fetchStream(
  apiMessages,
  // ... callbacks unchanged ...
);

// Change the fetch body to include query:
// In streamParser.js fetchStream, update the body:
body: JSON.stringify({ 
  messages,
  query: messages[messages.length - 1]?.content || '' 
}),
```

### Phase 1 Verification

1. Start server: `npm run server`
2. Load a document via curl or Postman:
   ```bash
   curl -X POST http://localhost:3001/api/knowledge/load \
     -H "Content-Type: application/json" \
     -d '{"title":"产品手册","content":"产品A价格299元，7天退货。产品B价格599元，15天退货。VIP会员9折。"}'
   ```
3. Ask in chat: "产品B多少钱？"
4. The model should answer "599元，支持15天退货" based on the injected context.
5. Ask something not in the document: "产品C多少钱？" → should say it cannot answer.

**Phase 1 complete when:** The model correctly answers questions using injected document context and admits when it doesn't know.

---

## Phase 2: Full RAG Pipeline (Embeddings + Vector Search)

**Goal:** Replace keyword search with semantic search using 讯飞 embedding API and cosine similarity.

### Step 2.1: Add embedding function in server.js

讯飞 MaaS API provides an embedding endpoint. Add this function:

```js
// In server.js, add after the existing imports:

const EMBEDDING_MODEL = 'xop35qwen2b'; // Confirm this supports embeddings or use a dedicated embedding model

function getEmbedding(text) {
  return new Promise((resolve, reject) => {
    const requestBody = {
      model: EMBEDDING_MODEL,  // Replace with actual embedding model ID
      input: text
    };

    const options = {
      hostname: 'maas-api.cn-huabei-1.xf-yun.com',
      port: 443,
      path: '/v1/embeddings',  // 讯飞 embeddings endpoint — verify in their docs
      method: 'POST',
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.data && json.data[0] && json.data[0].embedding) {
            resolve(json.data[0].embedding);
          } else {
            reject(new Error(`Embedding API error: ${body}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(requestBody));
    req.end();
  });
}
```

> **Note:** Verify the exact embedding model ID and endpoint from [讯飞 MaaS 文档](https://maas.xfyun.cn/modelService). The above assumes it follows the OpenAI-compatible format. If the chat model doesn't support embeddings, use a dedicated embedding model or fall back to the keyword approach for now.

### Step 2.2: Create the vector store

Create `src/services/vectorStore.js`:

```js
/**
 * Simple in-memory vector store with cosine similarity search.
 * No external dependencies required.
 */

class VectorStore {
  constructor() {
    this.chunks = [];     // Array of { id, docId, title, content }
    this.vectors = [];    // Array of Float32Array (embedding vectors)
  }

  // Cosine similarity between two vectors
  static cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Add a single chunk with its embedding
  add(docId, title, content, embedding) {
    const id = `${docId}_${this.chunks.length}`;
    this.chunks.push({ id, docId, title, content });
    this.vectors.push(new Float32Array(embedding));
    return id;
  }

  // Search for top-K most similar chunks
  search(queryEmbedding, topK = 3) {
    if (this.chunks.length === 0) return [];
    
    const scores = this.vectors.map((vec, i) => ({
      index: i,
      score: VectorStore.cosineSimilarity(queryEmbedding, vec)
    }));

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(s => ({ ...this.chunks[s.index], score: s.score }));
  }

  // Remove all chunks for a document
  removeByDocId(docId) {
    const indices = [];
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      if (this.chunks[i].docId === docId) {
        this.chunks.splice(i, 1);
        this.vectors.splice(i, 1);
      }
    }
  }

  // Get store statistics
  stats() {
    return {
      totalChunks: this.chunks.length,
      uniqueDocs: new Set(this.chunks.map(c => c.docId)).size
    };
  }
}

const vectorStore = new VectorStore();
export default vectorStore;
```

### Step 2.3: Create the embedding-based knowledge service

Replace Phase 1's `knowledgeService.js` content with:

```js
import vectorStore from './vectorStore.js';

class KnowledgeService {
  constructor() {
    this.documents = []; // Metadata only: { id, title, chunksCount }
  }

  // Split text into overlapping chunks for better retrieval
  chunkText(text, chunkSize = 500, overlap = 50) {
    const chunks = [];
    let start = 0;
    
    while (start < text.length) {
      let end = Math.min(start + chunkSize, text.length);
      
      // Try to break at a natural boundary (paragraph or sentence)
      if (end < text.length) {
        const searchRegion = text.slice(end - 100, end);
        const breakPoints = ['\n\n', '\n', '。', '！', '？', '.', '!', '?'];
        let bestBreak = -1;
        for (const bp of breakPoints) {
          const idx = searchRegion.lastIndexOf(bp);
          if (idx > bestBreak) bestBreak = idx;
        }
        if (bestBreak > 0) {
          end = end - 100 + bestBreak + 1;
        }
      }
      
      chunks.push(text.slice(start, end).trim());
      start = end - overlap;
      if (start >= text.length) break;
    }
    
    return chunks;
  }

  // Load a document: chunk → embed → store
  async loadDocument(title, rawText, getEmbeddingFn) {
    const chunks = this.chunkText(rawText);
    const id = Date.now().toString();
    
    for (const chunk of chunks) {
      const embedding = await getEmbeddingFn(chunk);
      vectorStore.add(id, title, chunk, embedding);
    }
    
    this.documents.push({ id, title, chunksCount: chunks.length });
    return { id, chunksCount: chunks.length };
  }

  // Semantic search
  async search(query, getEmbeddingFn, topK = 3) {
    const queryEmbedding = await getEmbeddingFn(query);
    return vectorStore.search(queryEmbedding, topK);
  }

  // Build system prompt from search results
  buildSystemPrompt(searchResults) {
    if (!searchResults || searchResults.length === 0) return null;
    
    const ctx = searchResults
      .map((r, i) => `[参考资料${i + 1} — 来自《${r.title}》，相关度: ${(r.score * 100).toFixed(0)}%]\n${r.content}`)
      .join('\n\n---\n\n');
    
    return `你是一个智能助手。请严格根据以下参考资料回答问题。如果资料中确实没有相关信息，请明确说"根据现有资料，我无法回答这个问题"，不要编造。

## 参考资料
${ctx}`;
  }

  // Load multiple documents from an array of { title, content }
  async loadDocuments(docs, getEmbeddingFn) {
    const results = [];
    for (const doc of docs) {
      results.push(await this.loadDocument(doc.title, doc.content, getEmbeddingFn));
    }
    return results;
  }

  removeDocument(id) {
    vectorStore.removeByDocId(id);
    this.documents = this.documents.filter(d => d.id !== id);
  }

  getStats() {
    return { ...vectorStore.stats(), documents: this.documents };
  }
}

const knowledgeService = new KnowledgeService();
export default knowledgeService;
```

### Step 2.4: Update server.js routes

Replace the Phase 1 knowledge routes with embedding-aware versions:

```js
import knowledgeService from './src/services/knowledgeService.js';

// POST /api/knowledge/load — load document (now async with embeddings)
if (req.method === 'POST' && req.url === '/api/knowledge/load') {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const { title, content } = JSON.parse(body);
      const result = await knowledgeService.loadDocument(title, content, getEmbedding);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

// POST /api/knowledge/load-multiple — load multiple docs
if (req.method === 'POST' && req.url === '/api/knowledge/load-multiple') {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const { documents } = JSON.parse(body);
      const results = await knowledgeService.loadDocuments(documents, getEmbedding);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, results }));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

// GET /api/knowledge/stats — store statistics
if (req.method === 'GET' && req.url === '/api/knowledge/stats') {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(knowledgeService.getStats()));
}

// DELETE /api/knowledge/:id — remove a document
if (req.method === 'DELETE' && req.url.startsWith('/api/knowledge/')) {
  const docId = req.url.split('/').pop();
  knowledgeService.removeDocument(docId);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ success: true }));
}
```

Update the chat endpoint to use semantic retrieval:

```js
// In the POST /api/chat handler:
const { messages, query } = requestData;

let systemPrompt = null;
if (query) {
  const searchResults = await knowledgeService.search(query, getEmbedding);
  systemPrompt = knowledgeService.buildSystemPrompt(searchResults);
}

const apiMessages = systemPrompt
  ? [{ role: 'system', content: systemPrompt }, ...messages]
  : messages;

const requestBody = {
  model: 'xop35qwen2b',
  messages: apiMessages,
  max_tokens: 4000,
  temperature: 0.7,
  stream: true
};
```

Note: the `/api/chat` handler callback needs to become `async`:

```js
// Change from:
req.on('end', () => {

// To:
req.on('end', async () => {
```

### Phase 2 Verification

Same test as Phase 1, but semantic search should now find relevant chunks even when the exact keywords don't match. Test with paraphrased questions like "这个产品卖多少钱？" vs original "产品B的价格是多少？"

---

## Phase 3: Optimization & Production Readiness

### Step 3.1: Tune chunking strategy

In `knowledgeService.js`, experiment with these parameters:

```js
// For technical docs: smaller chunks, more overlap
chunkText(text, 300, 60);

// For narrative content: larger chunks, less overlap
chunkText(text, 800, 100);
```

### Step 3.2: Add relevance threshold filtering

In `vectorStore.js`, add a minimum score filter:

```js
search(queryEmbedding, topK = 3, minScore = 0.3) {
  const results = this.scores
    .filter(s => s.score >= minScore)  // Filter low-relevance results
    .slice(0, topK);
  // ...
}
```

### Step 3.3: Add citation display in frontend

When the model references a source, highlight it. Update the system prompt to request citations:

```js
buildSystemPrompt(searchResults) {
  // ...
  return `你是智能助手。请根据参考资料回答，并在回答中用 [来源: 《文档名》] 标注信息来源。
  
## 参考资料
${ctx}`;
}
```

### Step 3.4: Consider external vector databases (when scaling)

When document count exceeds ~10,000 chunks, switch from in-memory to a persistent store:

- **LanceDB** (local, embedded, Node.js native)
- **Chroma** (Python, needs separate process)
- **FAISS** (C++ with Node bindings)
- **Pinecone / Weaviate** (cloud-hosted)

---

## Environment Configuration

Update `.env` when adding embedding API:

```env
XUNFEI_API_KEY=your_key_here
XUNFEI_EMBEDDING_MODEL=your_embedding_model_id  # From 讯飞 MaaS platform
PORT=3001
```

---

## Common Issues & Solutions

### Embedding API returns 404
- Verify the embedding model ID is correct on the 讯飞 MaaS platform
- Check that your model supports the `/v1/embeddings` endpoint
- 讯飞's API may use a different path — consult their current docs

### Slow first request after loading documents
- Embedding is done at load time, not query time
- For very large documents (>100 pages), process in batches with progress feedback

### Retrieval misses relevant content
- Increase `topK` from 3 to 5
- Lower the `minScore` threshold
- Improve chunking: shorter chunks with more overlap increase recall

### Model ignores injected context
- Strengthen the system prompt directive
- Set `temperature` lower (0.3-0.5) for factual retrieval tasks
- Check that the retrieved chunks are actually relevant (log them for debugging)

---

## Testing Without Embedding API

If the 讯飞 embedding API is unavailable, use this fallback approach in `server.js`:

```js
// Fallback: Keyword-based embedding simulation
// Maps words to sparse vectors for rough semantic matching
function fallbackEmbedding(text) {
  // Tokenize and create a simple bag-of-words vector
  const tokens = text.toLowerCase()
    .replace(/[^一-龥a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
  
  // Use 256-dimensional zero vector, set positions by token hash
  const vec = new Array(256).fill(0);
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % 256;
    vec[idx] += 1;
  }
  
  // Normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map(v => v / norm) : vec;
}

// Use this as the embedding function:
const getEmbeddingFn = API_KEY ? getEmbedding : fallbackEmbedding;
```

This lets you test the full RAG pipeline even without embedding API access.
