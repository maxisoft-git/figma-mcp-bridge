# Архитектура

## Модель двух процессов

Система состоит из двух полностью отдельных Node.js-процессов, которые общаются только через локальный WebSocket:

1. **MCP-сервер** (`@gethopp/figma-mcp-bridge`, опубликован в npm)
   - Запускается там же, где AI-клиент
   - Реализует Model Context Protocol (stdio transport)
   - Экспонирует 75 инструментов с Zod-валидированным JSON input и JSON output
   - Владеет портом 1994 на localhost (HTTP + WebSocket)
2. **Figma-плагин** (этот репо, директория `plugin/`)
   - Запускается *внутри песочницы Figma desktop* (или в iframe Figma web)
   - Имеет полный доступ к `figma.*` — то же API, что использует сам редактор Figma
   - React UI в iframe + main thread в песочнице, который выполняет tool calls

Никакого облачного сервиса в цикле. Оба процесса на твоей машине, и единственное что пересекает границу — JSON через один WebSocket на `localhost:1994`.

## Почему два процесса

Figma plugin API — это песочница. Из Node.js-процесса нельзя вызвать `figma.getNodeByIdAsync` напрямую. Единственный способ использовать богатую модель нод — иметь код, работающий *внутри* Figma.

AI-агенты говорят на Model Context Protocol, который ожидает MCP-сервер (обычно один бинарь), запускаемый как child process.

Эти две модели развёртывания несовместимы. Bridge — простейший способ их помирить:

- MCP-сервер запускается как child AI-клиента (агент говорит с ним через stdio)
- Figma-плагин импортируется в Figma один раз и живёт долго (для `figma.*`)
- Два общаются через side-channel WebSocket, о котором Figma не знает

## Где что выполняется

| Concern | Где выполняется |
|---|---|
| AI agent ↔ MCP protocol | MCP-сервер (stdio) |
| Регистрация инструментов (75 tools) | MCP-сервер |
| Zod-валидация | MCP-сервер |
| Routing запросов (fileKey → connection) | MCP-сервер |
| Per-IP rate limiting | MCP-сервер (только `/rpc`) |
| Кэш ответов (5 сек TTL, read-only tools) | MCP-сервер |
| Standalone HTTP сервер на :1994 | MCP-сервер (только leader) |
| WebSocket-мост к Figma | MCP-сервер (только leader) |
| Application-level keepalive | MCP-сервер (leader) ↔ Figma-плагин (UI) |
| Election (leader/follower) | MCP-сервер (любой инстанс) |
| `figma.*` API вызовы | Figma-плагин (main thread) |
| Tool call dispatch (router.ts) | Figma-плагин (main thread) |
| Сериализация дерева нод | Figma-плагин (main thread, `serializer.ts`) |
| Variable / style lookup | Figma-плагин (main thread) |
| Генерация спрайта (`buildSprite`) | MCP-сервер (чистый JS, в `sprite.ts`) |
| Dev Mode mirror (CSS / SVG / HTML / JSON / IMG) | Figma-плагин (UI ↔ main) — напрямую, без MCP |
| Рендеринг UI плагина | Figma-плагин (React в iframe) |
| Статус подключения | Figma-плагин (UI) |
| Lock / collapse / хоткеи | Figma-плагин (UI) |
| `clientStorage` debug log | Figma-плагин (main thread) |
| `localStorage` collapse state | Figma-плагин (UI) |

## Поток данных для одного tool call

```
┌────────────┐    stdio/JSON-RPC     ┌────────────────────────┐
│ AI agent   │ ────────────────────► │ MCP-сервер             │
│            │  tools/call          │                        │
│            │  { name, args }      │  1. validate input     │
│            │                      │     (Zod)              │
│            │                      │  2. resolve fileKey    │
│            │                      │     (connections)      │
│            │                      │  3. check cache (5s)   │
│            │                      │  4. sendWithParams()   │
│            │                      │     │                  │
│            │                      │     ▼                  │
│            │                      │  ┌──────────────────┐  │
│            │                      │  │ WebSocket :1994  │  │
│            │                      │  │  ws.send(payload)│  │
│            │                      │  └────────┬─────────┘  │
│            │                      │           │            │
│            │                      │  ┌────────▼─────────┐  │
│            │                      │  │ Figma-плагин     │  │
│            │                      │  │  UI ─► main     │  │
│            │                      │  │  figma.* call   │  │
│            │                      │  └────────┬─────────┘  │
│            │                      │           │            │
│            │                      │  ┌────────▼─────────┐  │
│            │                      │  │ Реальный Figma   │  │
│            │                      │  │ документ         │  │
│            │                      │  └──────────────────┘  │
│            │                      │           │            │
│            │                      │   PluginResponse       │
│            │ ◄──────────────────── │  (data or error)      │
│  result    │                      │                        │
└────────────┘                      └────────────────────────┘
```

Полный round-trip обычно 20-100 мс для простого read, 200-800 мс для сложного write.

## Модель конкурентности

- **Один tool call за раз на один Figma-плагин** — main thread обрабатывает запросы последовательно. Если нужны параллельные вызовы — нужно подключить несколько Figma-плагинов (по одному на файл).
- **Много параллельных AI-агентов на одном сервере** — сервер однопоточный Node.js, но WebSocket-мост, `/rpc` и MCP stdio обрабатывают параллельные коннекты независимо.
- **Много файлов** — leader держит один WebSocket на файл. Больше файлов = больше WebSocket'ов.

## Режимы отказа

| Сбой | Что происходит |
|---|---|
| AI-клиент теряет stdio | Tool call timeout, агент видит "tool unavailable" |
| Сервер умирает | AI-клиент перезапускает; новый инстанс становится фолловером, фолбэчит на существующего leader'а, либо промоутит себя |
| Leader умирает | Фолловеры детектят через 2 ping-цикла (4-10 сек) и пытаются перехватить |
| Figma-плагин iframe уничтожен | WebSocket half-open. Leader'ский keepalive детектит за 15 сек и выкидывает |
| Figma-плагин main thread крашится | Плагин мёртв. Пользователь перезапускает. In-flight запросы реджектятся "Plugin not connected" |
| Figma-файл закрыт | `figma.currentPage` пуст. Tools с нодами фейлят "Node not found" |
| `figma.fileKey` пустой | Плагин шлёт пустой `fileKey`. Сервер реджектит HTTP 400 "missing fileKey" |

## Где какое состояние

- **AI agent** — своя память. Никакое состояние о Figma не персистится на стороне агента.
- **MCP-сервер** — только in-memory. Никакой дисковой персистенции (кроме `save_screenshots` / `save_node_json` / `export_icon_sprite`). Election state — per-process.
- **Figma-плагин UI** — `localStorage` для collapse state. React state в памяти (iframe часто пересоздаётся).
- **Figma-плагин main thread** — `figma.clientStorage` для debug log (key: `bridge-debug`, max 50 записей). Персистится между перезапусками плагина, но per-file.
- **Figma сама** — источник истины для всего остального.

## Безопасность

- WebSocket биндится на `localhost:1994`. Не достижим из сети, если пользователь сам не пробросил порт.
- `Origin` header проверяется (через `ALLOWED_ORIGINS`). Figma desktop шлёт `Origin: null` — нужно `ALLOWED_ORIGINS_INCLUDE_NULL=1`.
- Опциональный shared secret через `BRIDGE_SECRET` env (плагин шлёт в `?secret=…`).
- Figma-плагин в `manifest.json` объявляет `networkAccess.allowedDomains: ["ws://localhost:1994"]` — плагин не может делать никакие другие сетевые запросы.
- `outputPath` для write tools резолвится относительно CWD сервера; сервер отказывается писать за пределы.
- Никакой телеметрии, аналитики, удалённых вызовов. Единственная сетевая поверхность сервера — MCP stdio (к AI-клиенту) и localhost WebSocket (к Figma-плагину).

## Расширение системы

Чтобы добавить новый инструмент:

1. **Добавьте схему** в `server/src/schema.ts` (новая запись в `toolInputSchemas` + маппинг в `rpcToArgs`).
2. **Зарегистрируйте инструмент** в `server/src/tools.ts` (`server.tool(name, description, schema, async (args) => { … })`).
3. **Добавьте handler** в `plugin/src/main/handlers/<tool_name>.ts` с `export async function handle(request): Promise<PluginResponse>`.
4. **Подключите** в `plugin/src/main/router.ts` и `RequestType` union в `plugin/src/main/types.ts`.
5. **Протестируйте** — см. `export_icon_sprite` как end-to-end пример.

Не нужно трогать WebSocket-мост, leader/follower код или message protocol — они стабильны. Инструмент просто подключается в существующий pipeline.
