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
