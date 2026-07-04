# AIOS

A NestJS API backend for a personalised AI job agent. It uses Claude (Anthropic) and PostgreSQL (TypeORM). The system prompt and branding are customizable.

## Features

- **AI chat endpoint** – `POST /v1/chat/prompt` returns a complete Claude-generated text response
- **Streaming endpoint** – `POST /v1/chat/prompt/stream` streams the Claude response as SSE (`text/event-stream`)
- **Claude only** – Anthropic Messages API via `@anthropic-ai/sdk`; model and API key via env
- **Optional API key auth** – Set `API_KEY` in env to require an `x-api-key` header on all routes; omit for open access. When open access: only domains listed in `DOMAIN_CHAT` (one or more, comma-separated) have a per-day-per-IP limit (default **5**, or `PROMPTS_PER_DAY_CHAT`); all other domains are **unlimited**. Omit `DOMAIN_CHAT` for unlimited prompts everywhere.
- **Demo page** – Root URL serves a streaming chat UI (`public/index.html`): prompt box, Enter to send, Shift+Enter for new line, paste-to-attachment for long text
- **API docs** – [Scalar](https://scalar.com/) API reference at `/v1/docs` with configurable servers and Bearer auth
- **Security** – Helmet, rate limiting, CORS, global validation pipe, and a custom exception filter
- **Database** – PostgreSQL with TypeORM (entities auto-synced outside production by default)
- **Logging** – Custom logger service; timezone set to Africa/Lagos

## Tech stack

- [NestJS](https://nestjs.com/) 11
- [TypeORM](https://typeorm.io/) (PostgreSQL)
- [Anthropic Claude](https://docs.anthropic.com/) (`@anthropic-ai/sdk`)
- [Scalar](https://scalar.com/) + [NestJS Swagger](https://docs.nestjs.com/openapi/introduction) (OpenAPI)
- TypeScript, class-validator, class-transformer, Winston

## Prerequisites

- **Node.js** 18+
- **pnpm** (recommended) or npm/yarn
- **PostgreSQL** (local or remote)
- **Anthropic API key** (Claude)

## Project setup

```bash
pnpm install
```

## Environment variables

Copy the example file and set your values:

```bash
cp .env.example .env
```

| Variable               | Required | Description                                                                                                                                                                                                                       |
| ---------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Yes      | PostgreSQL connection string (e.g. `postgresql://user:pass@localhost:5432/aios`)                                                                                                                                                  |
| `TYPEORM_SYNC`         | No       | `true`/`false` to force schema sync. Default: on when `NODE_ENV` is not `production`, off in production.                                                                                                                          |
| `ANTHROPIC_API_KEY`    | Yes      | Anthropic API key for Claude                                                                                                                                                                                                      |
| `AI_MODEL`             | No       | Claude model id (default: `claude-sonnet-4-5-20250929`)                                                                                                                                                                           |
| `PORT`                 | No       | Server port (default: `3000`)                                                                                                                                                                                                     |
| `API_KEY`              | No       | If set, all routes require an `x-api-key: <value>` header. Omit or leave blank for open access.                                                                                                                                   |
| `DOMAIN_CHAT`          | No       | When `API_KEY` is not set: comma-separated list of hostnames that get a per-day-per-IP limit (request `Host` must match one). Only these domains are limited; all other domains are **unlimited**. Omit for unlimited everywhere. |
| `PROMPTS_PER_DAY_CHAT` | No       | For domains listed in `DOMAIN_CHAT`, this many prompts per day per IP (default **5**). Ignored if `DOMAIN_CHAT` is not set.                                                                                                       |
| `PLATFORM_NAME`        | No       | Name used in API docs title (e.g. your product name)                                                                                                                                                                              |
| `PLATFORM_URL`         | No       | Main app URL (for API docs). Also used for branding: copyright is shown on localhost and when the request host is the same as or a subdomain of this URL’s host; otherwise it is hidden.                                          |
| `DEVELOPMENT_URL`      | No       | Dev server host (for API docs)                                                                                                                                                                                                    |
| `PRODUCTION_URL`       | No       | Production host (for API docs)                                                                                                                                                                                                    |
| `AUTHOR_NAME`          | No       | Author handle shown in the demo UI header ("by X") and footer when the request is from `PLATFORM_URL` or a subdomain; omit to hide both                                                                                           |
| `AUTHOR_URL`           | No       | URL for the footer author link; only used when `AUTHOR_NAME` is set and branding is shown                                                                                                                                         |
| `CORS_ORIGINS`         | No       | Comma-separated list of extra allowed origins (e.g. `https://app.com,https://other.com`). All `http(s)://localhost` and `http(s)://127.0.0.1` ports are always allowed by default.                                                |

## Run the project

```bash
# Development (watch mode)
pnpm run start:dev

# Production build and run
pnpm run build
pnpm run start:prod
```

- **App / demo UI**: `http://localhost:3000` (streaming chat page)
- **API**: `http://localhost:3000/v1` (all API routes use the `v1` prefix)
- **API docs (Scalar)**: `http://localhost:3000/v1/docs`

On startup the server logs `Unlimited prompts: true/false` and `Copyright: enabled/disabled` (enabled when `AUTHOR_NAME` is set; copyright is always shown on localhost and on `PLATFORM_URL` or its subdomains).

## Run tests

```bash
# Unit tests
pnpm run test

# E2E tests
pnpm run test:e2e

# Coverage
pnpm run test:cov
```

## API overview

- **Server** – `GET /v1` – Health / hello
- **Branding** – `GET /v1/branding` – Returns `{ authorName, authorUrl }` on localhost or when the request host is the same as or a subdomain of `PLATFORM_URL`; otherwise returns nulls (copyright hidden). Used by the demo UI to hydrate the header and footer.
- **Chat** – `POST /v1/chat/prompt` – Body: `{ "prompt": "string" }` – Returns a complete AI-generated text response
- **Chat (stream)** – `POST /v1/chat/prompt/stream` – Body: `{ "prompt": "string" }` – Streams the response as `text/event-stream` SSE

### SSE event types (streaming endpoint)

Each event is a JSON object on a `data:` line.

| Event         | Fields | Description                                     |
| ------------- | ------ | ----------------------------------------------- |
| `text`        | `v`    | Incremental text delta from Claude              |
| `tool_call`   | `tool` | Model called an internal tool (e.g. `database`) |
| `tool_result` | `tool` | Internal tool returned a result                 |
| `done`        | —      | Stream complete                                 |
| `error`       | `msg`  | Stream-level error                              |

Full request/response details and auth options are in the API docs at `/v1/docs`.

## Project structure (high level)

```
public/                  # Static assets; root serves index.html (streaming chat UI)
src/
├── app/                 # App module, controller, service
├── lib/                 # Shared libs
│   ├── ai/              # AI service, system prompt (sp.ts)
│   ├── database/        # TypeORM module and entities
│   └── loggger/         # Custom logger
├── middleware/          # Exception filter, API key guard, open-access limit guard, decorators
├── modules/
│   └── chat/            # Chat controller & service (prompt, stream)
└── main.ts              # Bootstrap, static files, Scalar API docs, CORS, rate limit
```

To change the assistant’s personality and scope, edit the system prompt in `src/lib/ai/sp.ts`.

## Scripts reference

| Script                | Description                             |
| --------------------- | --------------------------------------- |
| `pnpm run start`      | Start once                              |
| `pnpm run start:dev`  | Start in watch mode                     |
| `pnpm run start:prod` | Run production build (`node dist/main`) |
| `pnpm run build`      | `nest build`                            |
| `pnpm run lint`       | ESLint with fix                         |
| `pnpm run format`     | Prettier on `src` and `test`            |

## License

This project is [MIT licensed](LICENSE).

## Contributing

Contributions are welcome. Open an issue or a pull request as needed.
