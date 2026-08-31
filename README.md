# Flowbook

Node-based AI workbook — combine text, image, audio and video nodes into
pipelines on an infinite canvas, run them against any provider, and watch
results stream in live.

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + Tailwind 4
- **@xyflow/react** — the node canvas
- **AI SDK v7** (`ai` + `@openrouter/ai-sdk-provider`) — every AI call goes
  through AI SDK model instances (`chat` / `imageModel` / `videoModel`),
  with `streamText` for live token streaming and
  `experimental_generateVideo` for async video jobs
- **Drizzle ORM + better-sqlite3** — workbooks, run history, per-node usage
- Media artifacts stored on disk under `.data/media`

## Providers (registry-based)

Providers are resolved from a registry (`src/lib/providers.ts`). Each spec
declares its capabilities (`chat` / `image` / `video`), and any
OpenAI-compatible gateway can be added as a new spec entry:

| id           | capabilities       | config                        |
| ------------ | ------------------ | ----------------------------- |
| `openrouter` | chat, image, video | `OPENROUTER_API_KEY`          |
| `pyok`       | chat, image        | `PYOK_BASE_URL` + `PYOK_API_KEY`|

Credentials: the client's Settings (⚙︎, stored in localStorage) ride with
each run; server `.env` values are the fallback. Adding a provider = one
entry in `PROVIDER_SPECS` — model dropdowns, `/api/models` listing, and the
runners pick it up automatically.

## Run engine

- Topological execution with a worker pool (max 4 concurrent nodes)
- `POST /api/run` streams NDJSON events:
  - `{type:"run"}` — run started/done (+ totals: cost, tokens, duration)
  - `{type:"node"}` — node queued/running/done/error (+ outputs, usage)
  - `{type:"delta"}` — live LLM token stream per node
- Every run is persisted: `runs` (aggregate) + `run_nodes` (per-node status,
  model, tokens in/out, cost in micro-dollars, duration)
- OpenRouter cost comes from provider metadata; usage totals roll up per run

## Node types

| kind        | what it does                                   |
| ----------- | ---------------------------------------------- |
| `text`/`note` | raw text / system-style instruction           |
| `image.in` / `audio.in` / `video.in` | uploads (stored as artifacts) |
| `llm`       | chat model (vision: attach an upstream image)  |
| `image.gen` | text-to-image (Seedream, Gemini Image, …)      |
| `tts`       | text-to-speech through the provider's speech endpoint |
| `video.gen` | text/image-to-video (Seedance, Veo) via `experimental_generateVideo` |
| `out.text`  | renders whatever arrives — HTML preview, JSON viewer, code, prose, media |
| `out.media` | media sink, reusable as input                  |

Ports are typed (`text | image | audio | video`) and connections are
validated against them. Output nodes classify model output automatically
(full HTML documents preview live in a sandboxed iframe).

## Development

```bash
npm install
cp .env.local.example .env.local   # add OPENROUTER_API_KEY
npm run dev                        # http://localhost:3000
```

Database schema lives in `src/db/schema.ts` (SQLite at `.data/flowbook.db`).
Tables are created automatically on first request. To sync after a schema
edit you can still run:

```bash
npx drizzle-kit push
```

## API

| route            | purpose                                          |
| ---------------- | ------------------------------------------------ |
| `POST /api/run`  | execute a graph; NDJSON event stream             |
| `GET /api/runs`  | run history (`?graphId=` / `?runId=&nodes=1`)     |
| `GET/POST/PATCH/DELETE /api/graphs` | workbook list (metadata) + CRUD |
| `GET /api/graphs/[id]` | one workbook document                    |
| `POST /api/models` | per-provider model lists (OpenAI-compatible `/models`) |
| `POST /api/upload` | media upload (multipart)                        |
| `GET /api/media/[id]` | stream a stored artifact                    |
| `GET /api/config` | which providers have server-side keys            |
| `GET /api/health` | liveness                                         |
| `POST /api/runs` | enqueue a durable run (`202 { runId }`)          |
| `GET /api/runs/[id]/events` | SSE event stream + reconnect (`?after=`) |
| `POST /api/mcp` | scoped MCP tools for agents                      |
| `POST /api/webhooks/[token]` | signed workbook trigger                   |
