## [0.12.1] — 2026-06-28

### Changes
- 
## [0.12.0] — 2026-06-27

### Changes
- 
## [0.11.0] — 2026-06-27

### Changes
- 
## [0.10.0] — 2026-06-27

### Changes
- 
## [0.9.0] — 2026-06-27

### Changes
- 
## [0.8.0] — 2026-06-27

### Changes
- 
## [0.7.0] — 2026-06-27

### Changes
- 
## [0.6.0] — 2026-06-26

### Changes
- 
# Changelog

## [Unreleased] — Sprite export, plugin UI overhaul, documentation

### New: `export_icon_sprite` tool

Find SVG icons across the file, deduplicate them, and write a single `<symbol>`-based sprite to disk.

- **Input:** `outputPath`, `scope` (`page` / `selection` / `document`), `namePattern` (regex, default `/^(icon|ic[-_/])/i`), `sizeFilter`, `includeHidden`, `maxIcons` (default 1000), `dedupeMode` (`raw` / `normalized` / `paths` / `none`), `spriteFormat` (`symbol` / `g`), `fillStrategy` (`currentColor` / `preserve` / `black`).
- **Dedupe modes**:
  - `raw` — byte-for-byte comparison.
  - `normalized` (default) — strips `fill` / `stroke` / `style` / `class` / `id` / dimensions / whitespace before comparison. Two visually identical icons collapse.
  - `paths` — hashes only the `d` attribute of each `<path>`. Two icons with different wrappers but the same path geometry collapse.
  - `none` — no dedup. Every candidate becomes its own `<symbol>`. Names with collisions get auto-numbered (`-2`, `-3`, …). Useful when you want to inspect the file as-is and dedup yourself later.
- **Returns:** `{ scope, totalFound, uniqueIcons, duplicatesRemoved, truncated, outputPath, bytesWritten, groups: [{ spriteId, count, nodeIds, keptNodeId, keptName, width, height }] }`.
- Standalone equivalent (no AI client required): `node scripts/export-via-rpc.mjs --fileKey … --out ./icons.svg --pattern "hugeicons|solar" --max 1000`. Uses `dedupeMode: "none"` and writes to disk directly.

### Plugin UI: collapse / expand

- New `ui-resize` message type — UI sends to main thread, main thread calls `figma.ui.resize(460, 56)` (collapsed) or `figma.ui.resize(460, 560)` (expanded).
- New collapse button (▼/▲) in the header.
- State persisted in `localStorage` under `bridge-ui-collapsed` — survives plugin reload.
- New hotkey **`B`** to toggle.
- New icons added to the inlined icon set: `chevron-up`, `chevron-down`.

### Plugin / server: bug fixes from the connection saga

These were the bugs that initially prevented any MCP tool call from returning a response. All fixed.

1. **Manifest:** added `enablePrivatePluginApi: true` so `figma.fileKey` returns the real key (not the file-name fallback) in development plugins.
2. **Message wrapper:** the original `isPluginMessagePayload` required the legacy `{type: "pluginMessage", pluginMessage: …}` Figma wrapper. Newer Figma Beta versions use `{pluginMessage: …, pluginId: …}` with no `type` field. The guard is now permissive: any object with a `pluginMessage.type` string is treated as a plugin message.
3. **WS re-fire loop:** the original `useEffect` with `[connect, status.fileKey]` deps closed the WebSocket on every re-render. Fixed by tracking the last connected `fileKey` in a ref and only firing `connect()` on actual transitions. The `setStatus` reducer also bails out early when no values changed, so `plugin-status` echoes no longer cause re-fires.
4. **Request forwarding:** the original UI ws.onmessage only forwarded when `parsedObj.id` was a string. The server actually sends `requestId`, so requests were never forwarded. Now forwards on `requestId`.
5. **Response forwarding:** the UI message handler only matched the literal `inner.type === "server-request"` case for forwarding back. Plugin responses have the original request type (e.g. `"get_metadata"`) so they were dropped. Now any plugin message with a `requestId` string is forwarded to the server.
6. **DevModePanel re-export storm:** it re-ran the active Dev Mode export on every `plugin-status` echo. Now only re-exports when `selectionCount` actually changes.
7. **WebSocket half-open:** Figma reloads the iframe without sending a close frame. Added application-level `__server_ping` / `__client_pong` keepalive (5s interval, 15s timeout) so the leader evicts dead connections promptly.

### Server: leader / follower hardening

- `ALLOWED_ORIGINS_INCLUDE_NULL=1` is the documented requirement for Figma desktop. The `null` origin is intentional and required.
- Graceful drain on SIGINT/SIGTERM: rejects new RPC, waits up to `DRAIN_TIMEOUT_MS` (default 10s) for in-flight requests, then exits.
- Per-IP rate limiter on `/rpc` (configurable via `RATE_LIMIT_RPC_DISABLE=1`).
- 5s response cache for read-only tools (`get_node`, `get_document`, `get_metadata`, etc.). Errors are not cached.

### Documentation

New `docs/` tree with parallel English and Russian versions:

- `README.md` — rewritten in English with hero image (`./logo.png`), full quick-start, architecture diagram, example calls.
- `docs/en/README.md` + `docs/en/{plugin,server,tools,architecture}.md` — 4 deep-dive English docs.
- `docs/ru/README.md` + `docs/ru/{plugin,server,tools,architecture}.md` — 4 deep-dive Russian docs (mirrored).
- Old internal plans (`PLUGIN_PLAN.md`, `SERVER_PLAN.md`, `DESIGN_SYSTEM_PLAN.md`, `docs/PLUGIN_ROADMAP.md`, `docs/SERVER_ROADMAP.md`, `docs/TOOL_MAPPING.md`) removed — superseded by the public docs.

### Cleanup

- `.gitignore` updated: `bun.lockb` (Bun's binary lock), `icons-*.svg` / `sprite-*.svg` / `test-*.mjs` / `test-*.svg` (script outputs), editor backups, coverage output.
- `plugin/bun.lockb` untracked (the text `bun.lock` is the canonical lock).
- Old `server/yarn.lock` reverted to upstream (we use `npm` for the server, not yarn).

### Standalone scripts

- `scripts/export-via-rpc.mjs` — direct-bridge sprite exporter. Connects to the WebSocket, fetches icons, writes the sprite. Doesn't require the AI client to be connected.
- `scripts/bump-version.sh` — pre-existing, kept.

---

## [0.12.0] — 2026-06-27

### Changes
-
## [0.11.0] — 2026-06-27

### Changes
-
## [0.10.0] — 2026-06-27

### Changes
-
## [0.9.0] — 2026-06-27

### Changes
-
## [0.8.0] — 2026-06-27

### Changes
-
## [0.7.0] — 2026-06-27

### Changes
-
## [0.6.0] — 2026-06-26

### Changes
-
# Changelog

## [Unreleased] — Dev Mode Mirror integration

### Dev Mode Mirror (ported from `../figma-dev`)

Пять новых MCP-инструментов для экспорта CSS / SVG / HTML / JSON / IMG выбранной ноды (или ноды по `nodeId`). Реализация в `plugin/src/main/utils/dev-mode.ts` (общая логика) + 5 handler'ов в `plugin/src/main/handlers/get_dev_*.ts`.

- **`get_dev_css`** — `getCSSAsync()` на одной ноде. Возвращает плоский CSS-стринг. Без обхода поддерева — безопасно вызывать на `selectionchange`.
- **`get_dev_svg`** — `exportAsync({ format: "SVG_STRING" })` со всеми стилями inline как XML-атрибуты (как в Dev Mode).
- **`get_dev_html`** — рекурсивный обход с лимитами `HTML_NODE_LIMIT=200` и `HTML_MAX_DEPTH=12`. Image fills **не** инлайнятся. Возвращает `{ html, truncated, visited }`.
- **`get_dev_json`** — сырой объект `getCSSAsync()` + depth-2 structural dump из `serializeNode`. Удобно для AI-агентов: сразу и key/value CSS, и структура ноды.
- **`get_dev_image`** — извлечение картинки. Стратегии: (1) прямой `imageHash`, (2) `imageHash` на direct child, (3) `node.exportAsync(PNG)` fallback. Возвращает `base64` + `mime` + `source` (`"node" | "child:<name>" | "export"`).

### Архитектура

- **Общий модуль:** `plugin/src/main/utils/dev-mode.ts` — `resolveNode`, `cssFor`, `buildHtml`, `findImageForNode`, `detectMime`, `escapeHtml`, `serializeCss`, `bytesToBase64Chunks`, `exportTab`.
- **Helper:** `resolveNode(nodeId?)` — бросает структурированную ошибку если `nodeId` не найден или ничего не выбрано. Использует `PluginErrorCode.NODE_NOT_FOUND` / `VALIDATION_ERROR`.
- **NodeId параметр:** все 5 инструментов принимают `nodeIds[0]` (через `rpcToArgs`). Если не передан — используется `figma.currentPage.selection[0]`.
- **Серверная валидация:** добавлены Zod-схемы в `server/src/schema.ts` + mappers в `rpcToArgs`. При вызове без аргументов отдаёт пустой объект — nodeId берётся из `nodeIds[0]`.

### UI (не затронут)

Существующий React-UI в `plugin/src/ui/` **не показывает** вкладки Dev Mode Mirror — это MCP-only функционал для AI-агентов. Если потребуется визуальный UI с 5 вкладками (как в figma-dev/ui.html), добавим отдельной задачей.

## [0.5.0] — Структурированные ошибки и улучшения

### Система ошибок

- **`errors.ts`** — новый файл с `PluginErrorCode` enum и фабриками ошибок: `nodeNotFound`, `validationError`, `unsupportedOperation`, `operationFailed`.
- `PluginResponse.error` теперь имеет структуру `{ code: string; message: string }` вместо plain string.
- Все обработчики используют структурированные ошибки.

### delete_nodes — частичное выполнение

- Если один узел не найден, остальные удаляются успешно.
- Возвращается массив результатов с `success/error` для каждого узла.
- Возвращается `deletedCount` (успешно) и `failedCount`.

### set_instance_properties — расширенные поля

Новые поля: `strokes`, `fontSize`, `fontFamily`, `fill` (text-specific fill).
Теперь можно изменять больше свойств на nested nodes в инстансах.

### Валидация

- **`validation.ts`** — набор утилит валидации: `validateRequired`, `validateString`, `validateNumber`, `validateBoolean`, `validateArray`, `validateHexColor`, `validateRange`, `validateEnum`, `validateNodeId`, `validatePositiveNumber`, `validateObject`.
- Можно использовать в обработчиках для типизированной валидации параметров.

## [0.4.0] — Instance overrides и тесты

### Instance overrides

- **`set_instance_properties`** — изменение override-свойств на дочерних узлах инстанса компонента. Поддерживает: `characters`, `fills`, `opacity`, `visible`, `name`. Дочерний узел задаётся по `targetNodeId` или `targetNodeName`. *(Для: изменение текста и стилей в скопированных компонентах без разрыва связи с оригиналом)*

### Тесты

- **Vitest** — настроен для plugin с `src/test/setup.ts` (mock `figma` global).
- **`serializer.test.ts`** — 14 тестов: сериализация базовых узлов, fills, gradients, effects, corner radii, auto-layout, mixed values, includeHidden.
- **`utils.test.ts`** — 11 тестов: parseHexColor, positionNode, resizeNodeIfSupported, setSolidFill.
- **`router.test.ts`** — 7 тестов: dispatch, error handling, get_node, create_frame, delete_nodes.
- **35 passing tests** — покрывают основные утилиты и обработчики.

### Dev-режим

- Исследование показало: Figma plugin sandbox не поддерживает динамическую загрузку кода. Dev-режим с автоперезагрузкой невозможен без изменения архитектуры плагина. Версионный индикатор + Re-import остаётся рекомендуемым подходом.

## [0.3.0] — Расширенные инструменты оформления и компоненты

### Оформление

- **`set_stroke`** — управление обводкой узла: цвет, толщина, выравнивание, штрих-паттерн. *(Для: сейчас обводку можно задать только при создании через create_shape, но не изменить)*

- **`set_effects`** — добавление/замена/очистка эффектов (тени, blur). Поддержка режимов append/replace/clear. *(Для: полное управление визуальными эффектами)*

- **`set_constraints`** — изменение ограничений изменения размера (constraints) по горизонтали и вертикали. *(Для: управление поведением при ресайзе родителя)*

- **`set_gradient_fill`** — добавление градиентных заливок (linear, radial, angular, diamond) с произвольными стопами. *(Для: создание градиентов, сейчас поддерживается только сплошная заливка)*

### Компоненты

- **`list_components`** — список всех локальных компонентов на странице. Возвращает id, name, key, размеры. *(Для: поиск компонентов для создания инстансов)*

- **`create_component`** — конвертация существующего узла в компонент. *(Для: создание design system элементов)*

- **`create_instance`** — создание инстанса компонента по ID или ключу, с поддержкой импорта внешних компонентов по ключу. *(Для: использование компонентов в генерируемых макетах)*

### Сериализация

- **`includeHidden`** — параметр для get_document, get_node, get_design_context. При `true` включает скрытые узлы в дерево. *(Для: полный аудит структуры документа, включая скрытые слои)*

### Сервер

- Добавлены Zod-схемы для всех новых инструментов в `schema.ts`.
- Инструменты зарегистрированы в `tools.ts` с описаниями.
- `validateRpc` и `rpcToArgs` обновлены для новых инструментов.

## [0.2.0] — Рефакторинг и расширение функционала

### Рефакторинг архитектуры

- **Расщепление `code.ts`** (1123 строк → 19 файлов по 20-100 строк + router + utils + types). Монолитный switch заменён на мапу обработчиков в `router.ts`. Добавление нового инструмента — один файл в `handlers/` + одна строка в `router.ts`. *(Для: масштабируемость, снижение когнитивной нагрузки при разработке)*

- **Выделение `utils.ts`** — общие хелперы (`parseHexColor`, `setSolidFill`, `positionNode`, `resizeNodeIfSupported`, `appendToParentIfProvided`, `loadFontsForTextNode`, `ensureFont`, `decodeBase64ToBytes`, `getFileKey`, `sendStatus`, `serializeVariableValue`). *(Для: переиспользование между обработчиками)*

- **Выделение `types.ts`** — `RequestType`, `ServerRequest`, `PluginResponse`. *(Для: единый источник истины для типов запроса/ответа)*

- **Поддержка составных ID экземпляров** — regex в `server/src/schema.ts` теперь принимает формат `4029:12345;4029:67890`. *(Для: работа с вложенными экземплярами компонентов через Figma API)*

### Индикатор версии

- **`plugin/src/main/version.ts`** — константа `PLUGIN_VERSION`.
- **Сервер отправляет `server_version`** через bridge event при подключении плагина.
- **UI показывает версию** в footer и жёлтый баннер при несовпадении версий: `Plugin v0.1.0 ← Server v0.2.0 / Re-import plugin to update`. *(Для: пользователь знает, когда плагин устарел)*

### Новые обработчики

#### Управление узлами

- **`move_nodes`** — перемещение узлов на dx/dy или абсолютные координаты. *(Для: batch-операции позиционирования, сейчас только через set_node_properties по одному)*

- **`set_z_order`** — изменение порядка слоя (forward/backward/front/back/index). *(Для: управление порядком элементов, сейчас невозможно)*

- **`align_nodes`** — выравнивание и распределение узлов (left/center/right/top/middle/bottom, distribute horizontal/vertical). *(Для: агент не может выровнять элементы без ручного расчёта координат)*

- **`flatten`** — растрирование векторных узлов (`node.flatten()`). *(Для: преобразование сложных векторов в простые формы)*

#### Auto-Layout

- **`set_auto_layout`** — установка auto-layout на фрейм: layoutMode, itemSpacing, padding, alignment, sizing, wrap. *(Для: агент может создавать адаптивные макеты, раньше только читал auto-layout)*

#### Страницы

- **`set_current_page`** — переключение текущей страницы по ID или имени. *(Для: работа с многостраничными файлами, раньше агент был заперт на одной странице)*

#### Поиск

- **`find_nodes`** — поиск по имени (regex), типу, глубине. Возвращает `{ id, name, type, bounds }` без полной сериализации. *(Для: агент не выгружает всё дерево для поиска одного узла)*

#### Группировка

- **`create_group`** — обёртка массива узлов в группу (`figma.group()`). *(Для: базовая компоновка, которой не было)*

#### Стили

- **`apply_style`** — применение paint/text/effect стиля к узлу по ID стиля. *(Для: стили читаются через get_styles, но раньше нельзя было применить)*

- **`set_blend_mode`** — изменение режима наложения (multiply, screen, overlay и т.д.). *(Для: сериализатор читает blendMode, но раньше нельзя было изменить)*

- **`set_clipping`** — включить/выключить `clipsContent` на фрейме. *(Для: управление обрезкой содержимого)*

#### Аналитика дизайна

- **`get_measurements`** — расстояния и выравнивание между выбранными узлами. *(Для: агент понимает спейсинг без ручного расчёта координат)*

- **`get_color_palette`** — извлечение уникальных цветов из дизайна (заливки, обводки, эффекты). *(Для: генерация CSS/design tokens на основе реального файла)*

- **`get_typography_scale`** — извлечение используемых шрифтов, размеров и стилей. *(Для: агент соблюдает дизайн-систему при генерации кода)*

- **`get_spacing_system`** — анализ отступов (padding, gap) и выявление паттерна (базовая единица, используемые кратные). *(Для: автоматическое определение spacing-системы)*

### UI плагина

- **Мини-лог действий** — последние 5 операций, выполненных через MCP, отображаются в UI. Пользователь видит, что делает агент. *(Для: прозрачность работы AI)*

- **Кнопка Lock** — блокировка приёма команд. Сервер получает ошибку «Plugin locked by user». *(Для: пользователь может остановить агент, если тот делает что-то нежелательное)*

---

## [0.1.1] — Индикатор версии

- Добавлена константа `PLUGIN_VERSION` в `plugin/src/main/version.ts`.
- Сервер отправляет `server_version` bridge event при подключении.
- UI: footer с версией, жёлтый баннер при несовпадении.

## [0.1.0] — Начальный релиз

- Плагин Figma + MCP сервер.
- Инструменты чтения: get_document, get_selection, get_node, get_styles, get_metadata, get_design_context, get_variable_defs, get_screenshot.
- Инструменты записи: set_node_properties, set_text_content, set_text_properties, set_node_visibility, create_frame, create_text, create_shape, create_image, duplicate_nodes, reparent_nodes, delete_nodes.
- Инструменты экспорта: save_screenshots, save_node_json.
- Leader/follower election для множественных подключений.
