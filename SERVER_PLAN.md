# План рефакторинга и развития — MCP Server

> Пакет `server/` — Node.js MCP сервер (`@gethopp/figma-mcp-bridge`), published to npm

## Приоритеты

- **P0** — критично, блокирует дальнейшую разработку
- **P1** — важно, значительно улучшает качество
- **P2** — желательно, улучшает UX и DX
- **P3** — в перспективе, расширяет возможности

---

## 1. Рефакторинг архитектуры

### 1.1. Расщепление `server/src/tools.ts` (P1)

**Проблема:** 638 строк — регистрация инструментов, экспорт скриншотов, загрузка изображений, валидация путей, форматирование ответов.

**План:**
- `server/src/tools/registry.ts` — декларативный реестр:
  ```ts
  type ToolDef = {
    name: string;
    description: string;
    schema: ZodObject;
    buildParams: (args, node, port) => Promise<ToolResult>;
  };
  const tools: ToolDef[] = [...];
  export function registerTools(server, node, port): void { tools.forEach(...) }
  ```
  Это сократит ~316 строк бойлерплейта до ~30 строк инфраструктуры + декларативная таблица.
- `server/src/tools/screenshot.ts` — `executeSaveScreenshots`, `saveScreenshotItemToFile`, `writeBase64ToFile`, `resolveExportFormat`, `getSingleScreenshotExport`, `inferFormatFromPath`
- `server/src/tools/image-loader.ts` — `loadImageSourceAsBase64` (URL, файл, data URI)
- `server/src/tools/response.ts` — `renderResponse`, `resolveAndValidateOutputPath`, тип `ToolResult`
- Перенести интерфейсы `ScreenshotExport`, `SaveScreenshotItemInput`, `SaveScreenshotItemResult` в `server/src/types.ts`

### 1.2. Расщепление `server/src/schema.ts` (P1)

**Проблема:** 482 строки, путаница в именовании (`createShapeShape`, `setTextPropertiesShape`).

**План:**
```
server/src/schema/
  common.ts      — figmaNodeId, hexColor, exportFormat, fileKeyField, shapeType, imageScaleMode
  properties.ts  — setNodeProperties*, setTextProperties*
  creation.ts    — createFrame*, createText*, createShape*, createImage*
  tools.ts       — toolInputSchemas, rpcToArgs, validateRpc
```
- Унифицировать именование: базовые схемы → `*Base`, валидированные (с refinement) → `*Schema`
- Заменить ручные «at least one property» refinement на утилиту `atLeastOne(schema, fields[])` чтобы не дублировать список полей

### 1.3. Общие типы с плагином (P1)

**Проблема:** `ServerRequest`, `PluginResponse`, `RequestType` дублируются в `code.ts` и `App.tsx`.

**План:**
- Создать `shared/types.ts` на уровне монорепо
- Импортировать через относительный путь или symlink из обоих пакетов
- Убрать дублирование `RequestType` и типов запроса/ответа

---

## 2. Безопасность и обработка ошибок

### 2.1. Лимит размера загружаемых изображений (P1)

**Проблема:** `loadImageSourceAsBase64` (tools.ts:463) читает файлы без ограничения размера.

**План:**
- Добавить `MAX_IMAGE_SIZE_BYTES` (10 МБ)
- Для файлов: проверять `stat().size` перед чтением
- Для URL: проверять `Content-Length` перед загрузкой

### 2.2. Лимит тела HTTP-запроса в leader (P1)

**Проблема:** `leader.ts:handleRPC` читает тело через `body += chunk` без ограничения.

**План:**
- Добавить `MAX_RPC_BODY_SIZE` (50 МБ)
- Прервать чтение и вернуть HTTP 413 при превышении

### 2.3. Корректное завершение pending-запросов (P2)

**Проблема:** При отключении плагина pending-запросы ждут таймаут 30с.

**План:**
- В `bridge.ts` при `ws.close` — немедленно reject все pending-запросы для данного fileKey
- Очищать pending-мапу при реконнекте

### 2.4. HTTP-статусы для ошибок в leader (P2)

**Проблема:** `leader.ts:139` — ошибки возвращают HTTP 200 с `{ error }`. Невозможно мониторить.

**План:**
- Клиентские ошибки → HTTP 400
- Ошибки плагина → HTTP 502
- Таймауты → HTTP 504

### 2.5. Очистка ответа list_files (P1)

**Проблема:** `tools.ts:72-74` — динамический `import("./follower.js")` при каждом вызове без подключений. Создаёт новый `Follower` на каждый запрос.

**План:**
- Перенести fallback-логику в `Node.listConnectedFiles()`
- Кэшировать экземпляр `Follower`

---

## 3. Новые инструменты (со стороны сервера)

> Каждый новый инструмент требует: схема в `schema/`, обработчик в плагине, регистрация в `tools/registry.ts`.

### 3.1. Схемы для новых инструментов (по мере добавления)

Новые схемы, которые нужно добавить в `server/src/schema/`:

| Инструмент | Приоритет | Описание |
|---|---|---|
| `set_auto_layout` | P0 | Установка auto-layout на фрейм |
| `set_current_page` | P1 | Переключение страницы |
| `find_nodes` | P1 | Поиск узлов по имени/типу |
| `apply_style` | P1 | Применение стиля к узлу |
| `batch_set_node_properties` | P1 | Пакетное изменение свойств |
| `create_group` | P2 | Создание группы |
| `set_stroke` | P2 | Редактирование обводки |
| `set_effects` | P2 | Редактирование эффектов |
| `list_components` | P3 | Список компонентов |
| `create_instance` | P3 | Создание экземпляра |
| `set_gradient_fill` | P3 | Градиентные заливки |
| `set_constraints` | P3 | Установка constraints |

### 3.2. Пакетные операции (P1)

- `batch_set_node_properties` — массив `{ nodeId, ...properties }`
- Сервер валидирует каждую запись, отправляет отдельные RPC или batching на сторону плагина

---

## 4. Инфраструктура

### 4.1. CI-пайплайн (P1)

**Проблема:** Нет CI, только ручной release workflow.

**План — `.github/workflows/ci.yml`:**
```yaml
on: [push, pull_request]
jobs:
  check:
    steps:
      - tsc --noEmit (server)
      - tsc --noEmit (plugin)
      - prettier --check
      - bun install + bun run build (server)
      - bun install + bun run build (plugin)
```

### 4.2. Конфигурация через env (P2)

**Проблема:** Порт 1994, таймаут 30с, jitter — захардкожены.

**План — `server/src/config.ts`:**
```ts
export const config = {
  port: Number(process.env.FIGMA_BRIDGE_PORT) || 1994,
  requestTimeoutMs: Number(process.env.FIGMA_BRIDGE_TIMEOUT) || 30000,
  workspace: process.env.FIGMA_BRIDGE_WORKSPACE || process.cwd(),
  logLevel: process.env.FIGMA_BRIDGE_LOG_LEVEL || "info",
};
```
- Использовать во всех модулях вместо хардкода

### 4.3. Структурированное логирование (P2)

**Проблема:** Только `console.error()`, нет уровней, нет контекста.

**План:**
- Простой логгер: `logger.debug/info/warn/error(message, context?)`
- Логировать: MCP-запросы (инструмент, длительность, статус)
- Управление через `FIGMA_BRIDGE_LOG_LEVEL` (debug/info/warn/error)
- Корреляция: добавлять `requestId` в логи

### 4.4. Тесты (P2)

**Проблема:** Нет ни одного теста.

**План — Vitest:**

Приоритетные области:
1. `schema/` — `validateRpc`, `rpcToArgs`, edge cases для node ID (простые, составные), refinement-правила
2. `tools/screenshot.ts` — `resolveAndValidateOutputPath` (path traversal), `resolveExportFormat` (конфликт форматов), `inferFormatFromPath`
3. `tools/image-loader.ts` — URL, data URI, файловые пути
4. `bridge.ts` — маршрутизация, таймауты, multi-file
5. `election.ts` — переходы ролей, takeover

### 4.5. Устранение дублирования в README (P2)

**Проблема:** Две таблицы инструментов (строки 42-64 актуальная, строки 113-124 устаревшая).

**План:**
- Удалить вторую таблицу
- Актуализировать первую

### 4.6. Release workflow — раскомментировать NPM_TOKEN (P1)

**Проблема:** `release.yml:69` — `NODE_AUTH_TOKEN` закомментирован, публикация не работает.

**План:**
- Добавить секрет `NPM_TOKEN` в GitHub repo settings
- Раскомментировать `env` блок

---

## 5. Порядок выполнения

### Фаза 1 — Фундамент
1. Расщепить `tools.ts` на registry + модули (1.1)
2. Расщепить `schema.ts` на подмодули (1.2)
3. CI-пайплайн (4.1)
4. Схема `set_auto_layout` (3.1, синхронно с плагином)

### Фаза 2 — Качество
5. Общие типы с плагином (1.3)
6. Лимиты безопасности (2.1, 2.2)
7. Очистка `list_files` fallback (2.5)
8. NPM_TOKEN в release (4.6)
9. Схемы: `set_current_page`, `find_nodes`, `apply_style` (3.1)
10. Пакетные операции (3.2)

### Фаза 3 — Расширение
11. Конфигурация через env (4.2)
12. Логирование (4.3)
13. HTTP-статусы для ошибок (2.4)
14. Корректное завершение pending-запросов (2.3)
15. Схемы: `create_group`, `set_stroke`, `set_effects` (3.1)
16. Тесты: schema, screenshot, image-loader (4.4)

### Фаза 4 — Продвинутые возможности
17. Схемы: компоненты, градиенты, constraints (3.1)
18. Тесты: bridge, election (4.4)
19. README cleanup (4.5)
