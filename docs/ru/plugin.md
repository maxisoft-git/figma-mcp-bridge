# Плагин

Figma-плагин работает **внутри песочницы Figma**. Он выполняет каждый MCP-инструмент против реального документа Figma и возвращает результаты на MCP-сервер по локальному WebSocket.

Две половины:

- **Main thread** (`plugin/src/main/`) — выполняется в песочнице. Имеет полный доступ к `figma.*` API. Получает JSON-запросы из WebSocket, диспатчит в нужный handler, возвращает результат.
- **UI** (`plugin/src/ui/`) — React-приложение в iframe внутри панели Figma. Показывает статус подключения, инфо о файле, Dev Mode mirror, реагирует на действия пользователя (lock, reconnect, collapse).

Шина сообщений между ними (`figma.ui.postMessage` / `parent.postMessage`) — единственный способ их общения.

## Что видно в Figma

Когда вы запускаете `Plugins → Development → Figma MCP Bridge`, справа откроется панель. Размер по умолчанию 460×560 px.

```
┌──────────────────────────────────────────────────────────┐
│ [▼]  Figma MCP Bridge  имя файла      [● connected]    │ ← header (всегда)
├──────────────────────────────────────────────────────────┤
│ ┌────────────────┐  ┌────────────────┐                  │
│ │ File name      │  │ Plugin v0.12.0 │                  │
│ │ File key       │  │ Server v0.12.0 │                  │
│ │ 3 nodes selected│  └────────────────┘                  │
│ └────────────────┘                                       │
│                                                          │
│ ┌─ Dev Mode ─────┐  ┌─ MCP ─────────┐                   │
│ │ CSS SVG HTML … │  │ Tools         │                   │
│ │                │  │ Log           │                   │
│ │ [code preview] │  │ [log entries] │                   │
│ └────────────────┘  └────────────────┘                   │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [● connected]  [Disconnect]      [🔒 Unlock / Lock]    │ ← footer
└──────────────────────────────────────────────────────────┘
```

Нажмите **`B`** (или кликните ▼ в header) — панель свернётся до header bar (460×56 px). Плагин продолжает работать — скрывается только видимая часть. Состояние сохраняется в `localStorage`.

## Хоткеи

| Клавиша | Действие |
|---------|----------|
| `L` | Toggle plugin lock (когда locked — MCP-записи блокируются ошибкой "Plugin locked by user") |
| `R` | Переподключить WebSocket к MCP-серверу (если disconnected) |
| `D` | Disconnect WebSocket |
| `C` | Очистить лог |
| `B` | Toggle collapse / expand панели |
| `?` | Напечатать все хоткеи в консоль браузера |
| `Cmd/Ctrl+1` | Переключиться на вкладку Dev Mode |
| `Cmd/Ctrl+2` | Переключиться на вкладку MCP |

## Цикл подключения

Плагин и MCP-сервер устанавливают WebSocket на `ws://localhost:1994/ws`. Рукопожатие:

```
plugin (UI)                                  plugin (main)             MCP server
─────────────                                  ────────────             ──────────
figma.showUI(__html__, { 460×560 })
figma.ui.postMessage(plugin-status)  ───►    [dropped: UI not ready]
figma.ui.onmessage = handler()                [handler set]
[React mounts]
useEffect ──► parent.postMessage(ui-ready) ──►
                                              if ui-ready: sendStatus() ──►
                                            ◄── ui-ready               [stat retry cleared]
                                            ◄── plugin-status          [set fileKey/fileName]
ws.onopen ──► parent.postMessage(ui-ready)  ──► [re-confirm handshake]
parent.postMessage(server-request, …)  ──►  handleRequest(…)         [PluginResponse]
                                            ◄── PluginResponse        [ui handler forwards to ws]
ws.send(JSON.stringify(response))         ──►                           [pending request resolved]
```

Два слоя избыточности:

1. Main thread отправляет `plugin-status` при старте и на каждый `selectionchange`. UI использует это чтобы узнать file key и выделенные ноды.
2. UI отправляет `ui-ready` при монтировании и каждую секунду пока не получит `plugin-status`. Main thread повторяет `plugin-status` если за 2 сек не пришёл `ui-ready`. Так какая бы сторона ни загрузилась первой, вторая в итоге догонит.

## Зачем это важно

Figma запускает песочницу в Chromium webview. UI iframe плагина может быть уничтожен и пересоздан в любой момент (reload Figma, закрытие + открытие панели, смена файла). Main thread продолжает работать между этими событиями, поэтому протокол должен выдерживать перезапуск UI без перезапуска main thread.

## Протокол сообщений

Все сообщения между тремя сторонами (UI ↔ main ↔ server) — JSON-объекты с дискриминатором `type`.

### Main thread → UI (через `figma.ui.postMessage`)

| `type` | Payload | Когда |
|---|---|---|
| `plugin-status` | `{ fileName, fileKey, selectionCount, pluginVersion }` | При старте, на каждый `selectionchange`, на каждый `ui-ready` от UI |
| `dev_mode_result` | `{ ok, tab, requestId, css?\|svg?\|html?\|json?\|base64?, … }` | Когда UI запрашивает Dev Mode export текущего выделения |
| `server-request-response` | `{ type, requestId, data?, error? }` | Когда main thread обработал MCP-вызов |

### UI → main thread (через `parent.postMessage`)

| `type` | Payload | Когда |
|---|---|---|
| `ui-ready` | — | При монтировании, каждую секунду до получения `plugin-status` |
| `server-request` | `{ type, requestId, … }` (MCP tool call) | Когда MCP-сервер форвардит запрос |
| `dev_mode_export` | `{ requestId, tab, nodeId? }` | Когда пользователь переключает активную вкладку Dev Mode |
| `ui-resize` | `{ collapsed: boolean }` | Когда пользователь toggle collapse |

### Server ↔ plugin (WebSocket на `:1994/ws`)

| Server → plugin | `{ type: "__server_ping", ts }` (keepalive, каждые 5 сек) |
|---|---|
| Plugin → server | `{ type: "__client_pong" }` (ответ на keepalive) |
| Server → plugin | `{ type, requestId, nodeIds?, params? }` (MCP tool call) |
| Plugin → server | `{ type, requestId, data?, error? }` (ответ на tool) |
| Server → plugin | `{ type: "__bridge_event", event: "files", files: […] }` (broadcast при connect/disconnect) |
| Server → plugin | `{ type: "__bridge_event", event: "server_version", serverVersion: "x.y.z" }` (при connect) |

## Разрешения в manifest.json

```json
{
  "enablePrivatePluginApi": true,
  "networkAccess": {
    "allowedDomains": ["ws://localhost:1994"]
  },
  "documentAccess": "dynamic-page",
  "editorType": ["figma", "dev"],
  "capabilities": ["inspect"]
}
```

- **`enablePrivatePluginApi: true`** — обязательно. Без этого `figma.fileKey` возвращает `undefined` в development plugins, и плагин падает в fallback на имя файла (что неверно если подключено несколько файлов с одним именем).
- **`networkAccess.allowedDomains`** — только локальный WebSocket на порту 1994. Плагин не может делать никакие другие сетевые запросы.
- **`documentAccess: "dynamic-page"`** — плагин может получить доступ к текущей странице и любой странице, на которую пользователь переходит.
- **`editorType: ["figma", "dev"]`** — работает и в design editor, и в Dev Mode.
- **`capabilities: ["inspect"]`** — регистрирует плагин в Dev Mode Inspect panel.

## Добавление нового handler'а

Чтобы добавить новый MCP-инструмент:

1. **Server** — добавьте Zod-схему в `server/src/schema.ts` и `server.tool(...)` в `server/src/tools.ts`. В `rpcToArgs` тоже нужен маппинг, иначе TypeScript не скомпилирует.
2. **Plugin** — создайте `plugin/src/main/handlers/<tool_name>.ts` с `export async function handle(request): Promise<PluginResponse>`. Добавьте import + ключ в `plugin/src/main/router.ts`, и тип в `RequestType` union в `plugin/src/main/types.ts`.
3. **Тест** — добавьте тест в `server/src/<file>.test.ts` или `plugin/src/hooks/useWebSocket.test.ts`.

См. `export_icon_sprite` как рабочий пример.
