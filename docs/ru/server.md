# MCP-сервер

MCP-сервер — это **мост между AI-агентом и Figma-плагином**. Реализует [Model Context Protocol](https://modelcontextprotocol.io/) (stdio transport) и экспонирует 75 инструментов для работы с Figma. Также запускает HTTP + WebSocket-сервер на `localhost:1994`, к которому подключается Figma-плагин.

## Архитектура

Сервер имеет три роли (каждый инстанс — одна из них в данный момент):

- **Leader** — биндит порт 1994, владеет WebSocket-мостом к Figma-плагину, обрабатывает `/rpc` от фолловеров, обслуживает MCP stdio трафик от AI-клиента.
- **Follower** — подключается к leader'у через HTTP `/rpc` и форвардит вызовы.
- **Unknown** — начальное состояние. Пытается стать leader'ом; если порт занят — становится фолловером.

Обычно запускают один сервер, который — leader. Несколько инстансов могут работать одновременно для high availability — один leader, остальные фолловеры, которые перехватывают лидерство если leader умрёт.

```
   AI client              leader                       followers
   (stdio)                 :1994                          :1994 → leader
      │                     │                                │
      │  tools/call (RPC)    │                                │
      ├────────────────────►│                                │
      │                     ├─ /ws (WebSocket upgrade) ────► plugin
      │                     │     plugin connects with fileKey
      │                     │                                │
      │                     │     ┌── /rpc ───────────────┐  │
      │                     │◄────┤ follower forwards     │  │
      │                     │     │ follower gets result  │  │
      │                     ├────►│                       │  │
      │                     │     └───────────────────────┘  │
      │                     │                                │
      │  result             │                                │
      │◄────────────────────│                                │
```

## Эндпоинты

Когда сервер — **leader**, он экспонирует на `:1994`:

| Method | Path | Назначение |
|---|---|---|
| `GET` | `/ping` | Health check. Возвращает `{"status":"ok","version":"x.y.z"}`. Используется фолловерами для детекта мёртвого leader'а. |
| `POST` | `/rpc` | JSON-RPC мост. Body: `{ tool, nodeIds?, params?, fileKey? }`. Используется фолловерами для форварда. Возвращает `{ data }` или `{ error }`. |
| `WS` | `/ws` | WebSocket upgrade. Используется Figma-плагином. |

Все `/ws` запросы валидируются:

1. `fileKey` обязателен (Figma-плагин всегда его шлёт).
2. Если `BRIDGE_SECRET` задан, `secret` query param должен совпадать.
3. Если `origin` header задан и не в `ALLOWED_ORIGINS` — отказ с HTTP 403.
4. Если коннект для этого `fileKey` уже открыт — новый отклоняется (чтобы два iframe не дрались).

## Конфигурация через env

| Env | Default | Эффект |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://figma.com,https://www.figma.com` | Список разрешённых Origin. Figma desktop шлёт `null` — см. `ALLOWED_ORIGINS_INCLUDE_NULL`. |
| `ALLOWED_ORIGINS_INCLUDE_NULL` | unset | Если `1`, строка `null` тоже принимается. Обязательно для Figma desktop. |
| `BRIDGE_SECRET` | unset | Если задан, Figma-плагин должен слать точное значение в `?secret=…`. Пусто = проверка отключена. |
| `RATE_LIMIT_RPC_DISABLE` | unset | Если `1`, отключает rate limiter на `/rpc`. Только для бенчмарков. |
| `DRAIN_TIMEOUT_MS` | `10000` | На SIGTERM/SIGINT, сколько ждать завершения in-flight запросов. |

## Поддержка нескольких файлов

Leader держит много параллельных WebSocket-соединений, каждое — отдельный Figma-файл:

```ts
this.connections = new Map<string /* fileKey */, ConnectionEntry>();
```

Когда AI-агент вызывает инструмент:

- Если `fileKey` указан — сервер ищет коннект этого файла и форвардит запрос.
- Если подключён только один файл — сервер использует его (backward compatibility).
- Если подключено несколько и `fileKey` не указан — сервер возвращает ошибку со списком подключённых файлов.

`list_files` всегда работает и возвращает текущие коннекты.

## Поток запроса

Один вызов инструмента проходит через эти стадии:

```
AI client (MCP stdio)
  └─► tools/call { name, arguments }
        │
        │ (server.tool wrapper)
        ▼
leader.tools[name].handler
  └─► node.sendWithParams(tool, nodeIds, params, fileKey)
        │
        │ (Node → leader)
        ▼
leader.bridge.sendWithParams(tool, nodeIds, params, fileKey)
  └─► ws.send({ type, requestId, params, nodeIds })
        │
        │ (WebSocket to Figma plugin)
        ▼
plugin (UI React) → plugin (main thread) → figma.* API call
        │
        │ (response: figma.ui.postMessage → parent.postMessage → ws.send)
        ▼
leader.bridge.ws.onmessage({ type, requestId, data, error? })
  └─► resolve the Promise returned by sendWithParams
        │
        ▼
AI client gets the tool result
```

Leader ставит 30-секундный timeout на каждый запрос. Если плагин не ответил — reject с `"Request timed out"`.

## Keepalive (application-level)

Браузеры не отвечают на TCP `PING` фреймы. Figma уничтожает iframe плагина без отправки WebSocket close frame, оставляя half-open TCP-сокет. Сервер не может отличить "плагин жив, просто idle" от "iframe уничтожен, TCP keepalive ещё не сработал".

Workaround: application-level `__server_ping` / `__client_pong`.

```
server                               plugin (UI)
  │                                       │
  │  setInterval(5s)                       │
  │   └─► ws.send({ type: "__server_ping" })
  │                                       │
  │                          ws.onmessage  │
  │                          if type==="__server_ping":
  │                            ws.send({ type: "__client_pong" })
  │                                       │
  │  on pong: lastPongAt = Date.now()      │
  │                                       │
  │  setInterval(5s)                       │
  │   └─► if (Date.now() - lastPongAt > 15s):
  │         ws.terminate()
  │         this.connections.delete(fileKey)
```

Худший случай для мёртвого коннекта — 15 сек до того, как leader его выкинет.

## Leader election

Простая схема "кто первый занял порт — тот и leader":

```ts
// при старте
try {
  this.node.becomeLeader();  // пытается забиндить :1994
  return;
} catch {
  // порт занят
}
if (await this.pingLeader()) {
  this.node.becomeFollower();  // leader жив
}
// иначе: следующий тик попробует снова
```

Фолловеры пингуют `/ping` каждые 3-5 сек (random jitter). Если leader мёртв 2 polling-цикла подряд (4-10 сек) — фолловер пытается перехватить лидерство.

## Кэш

Сервер имеет 5-секундный in-memory кэш для **read-only** инструментов (хардкод-список: `get_node`, `get_document`, `get_metadata` и др.). Повторные одинаковые вызовы в течение 5 сек возвращают кэшированный ответ без обращения к плагину.

Кэш кей: `sha256(tool + sorted(nodeIds) + JSON(params) + fileKey)`. Ошибки **не** кэшируются.

## Сборка

```bash
cd server
npm install
npm run build       # tsc → dist/index.js + .js.map + .d.ts
```

`dist/index.js` — то что выполняется по MCP-конфигу AI-клиента.

## Тесты

```bash
cd server
npm test            # vitest run
```

Покрытие:

- `schema.test.ts` — каждая Zod-схема принимает валидный input, отвергает невалидный
- `bridge.test.ts` — WebSocket-мост, origin allowlist, duplicate connection rejection
- `election.test.ts` — переходы leader/follower
- `follower.test.ts` — RPC форвардинг, error propagation
- `rate-limiter.test.ts` — per-IP throttling
- `sprite.test.ts` — `buildSprite` dedup modes (`raw`, `normalized`, `paths`, `none`)
