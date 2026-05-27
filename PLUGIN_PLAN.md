# План рефакторинга и развития — Figma Plugin

> Пакет `plugin/` — Figma plugin (React UI + Figma API main thread)

## Приоритеты

- **P0** — критично, блокирует дальнейшую разработку
- **P1** — важно, значительно улучшает качество
- **P2** — желательно, улучшает UX и DX
- **P3** — в перспективе, расширяет возможности

---

## 1. Рефакторинг архитектуры

### 1.1. Расщепление `plugin/src/main/code.ts` (P0)

**Проблема:** 1123 строк в одном файле, switch на 848 строк. Добавление нового обработчика раздувает файл дальше.

**План:**
- Создать `plugin/src/main/handlers/` — один файл на каждый тип запроса:
  ```
  handlers/
    get_document.ts
    get_selection.ts
    get_node.ts
    get_styles.ts
    get_metadata.ts
    get_design_context.ts
    get_variable_defs.ts
    get_screenshot.ts
    set_node_visibility.ts
    set_text_content.ts
    set_text_properties.ts
    set_node_properties.ts
    create_frame.ts
    create_text.ts
    create_shape.ts
    create_image.ts
    duplicate_nodes.ts
    reparent_nodes.ts
    delete_nodes.ts
  ```
- Каждый обработчик экспортирует `type` и async-функцию `handle(request)`
- Создать `plugin/src/main/router.ts` — мапа `type → handler` и диспетчеризация
- Создать `plugin/src/main/utils.ts` — общие хелперы:
  - `parseHexColor`, `setSolidFill`, `applyTextFill`
  - `positionNode`, `resizeNodeIfSupported`
  - `appendToParentIfProvided`, `getParentNodeById`
  - `getSceneNodeById`, `getTextNodeById`
  - `loadFontsForTextNode`, `ensureFont`
  - `decodeBase64ToBytes`

### 1.2. Экспорт типов из сериализатора (P1)

**Проблема:** Типы `SerializedNode`, `SerializedStyles` и другие определены в `serializer.ts` локально — сервер и инструменты не могут ссылаться на них, используют `unknown` и касты.

**План:**
- Экспортировать все сериализованные типы из `serializer.ts`
- Создать `plugin/src/main/types.ts` с `ServerRequest`, `PluginResponse`, `RequestType` — убрать дублирование с `App.tsx`

### 1.3. Проверка типов параметров в обработчиках (P2)

**Проблема:** `request.params` — это `Record<string, unknown>`, каждый обработчик делает ручные `typeof params.xxx === "string"` проверки.

**План:**
- Создать интерфейсы для параметров каждого обработчика
- Добавить функцию-гард или утилиту валидации (можно минимальную, без zod — плагин работает в песочнице Figma)

### 1.4. `get_design_context` — вынести рекурсивную сериализацию (P1)

**Проблема:** 70 строк рекурсивной `serializeWithDepth` определены inline внутри switch-case.

**План:**
- Вынести в отдельную функцию `serializeNodeWithDepth(node, depth, currentDepth)` в `serializer.ts` или в `handlers/get_design_context.ts`

---

## 2. Обработка ошибок

### 2.1. Структурированные ошибки (P0)

**Проблема:** Все ошибки — `Error` со строковым сообщением, нет классификации.

**План:**
- Ввести enum кодов ошибок:
  ```ts
  enum PluginErrorCode {
    NODE_NOT_FOUND = "NODE_NOT_FOUND",
    VALIDATION_ERROR = "VALIDATION_ERROR",
    PERMISSION_DENIED = "PERMISSION_DENIED",
    FONT_NOT_AVAILABLE = "FONT_NOT_AVAILABLE",
    UNSUPPORTED_OPERATION = "UNSUPPORTED_OPERATION",
  }
  ```
- Обновить `PluginResponse.error` на `{ code: string, message: string }` или добавить поле `errorData`
- Классифицировать ошибки в каждом обработчике

### 2.2. Частичное выполнение для `delete_nodes` (P2)

**Проблема:** Если один узел не найден — весь `delete_nodes` падает, ничего не удаляется.

**План:**
- Обрабатывать каждый узел независимо
- Возвращать массив результатов с `success/error` на каждый узел

---

## 3. Новые обработчики (расширение API плагина)

### 3.1. `set_auto_layout` — редактирование Auto-Layout (P0)

**Проблема:** Сериализатор читает auto-layout свойства, но плагин не может их устанавливать.

**Параметры:**
- `nodeId` — целевой фрейм
- `layoutMode` — `NONE` / `HORIZONTAL` / `VERTICAL`
- `itemSpacing` — расстояние между элементами
- `primaryAxisAlignItems`, `counterAxisAlignItems`
- `primaryAxisSizingMode`, `counterAxisSizingMode`
- `paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`
- `layoutWrap`, `counterAxisSpacing`

### 3.2. `set_current_page` — навигация по страницам (P1)

**Параметры:** `pageId` или `pageName`

### 3.3. `find_nodes` — поиск узлов (P1)

**Проблема:** Агент вынужден выгружать всё дерево документа.

**Параметры:**
- `query` — regex или glob по имени
- `type` — фильтр по типу узла (FRAME, TEXT, RECTANGLE, …)
- `maxDepth` — ограничение глубины поиска
- `maxResults` — лимит результатов

**Возвращает:** массив `{ id, name, type, bounds }` без полной сериализации.

### 3.4. `create_group` — создание групп (P2)

**Параметры:** `nodeIds`, `name`, `parentId`

### 3.5. `set_stroke` — редактирование обводки (P2)

**Параметры:** `nodeId`, `strokeHex`, `strokeOpacity`, `strokeWeight`, `strokeAlign`, `dashPattern`

### 3.6. `set_effects` — редактирование эффектов (P2)

**Параметры:** `nodeId`, `effects[]` — добавить/заменить/очистить эффекты (тени, размытия)

### 3.7. `apply_style` — применение стилей (P1)

**Параметры:** `nodeId`, `styleId`, `styleType` (`paint` / `text` / `effect` / `grid`)

### 3.8. Работа с компонентами (P3)

- `list_components` — ✅ реализовано
- `create_instance` — ✅ реализовано
- `create_component` — ✅ реализовано
- `set_instance_properties` — ❌ не реализовано (сложные overrides)

### 3.9. Градиентные заливки (P3) — ✅ реализовано

### 3.10. `set_constraints` — ✅ реализовано

### 3.11. Параметр `includeHidden` в чтении (P2) — ✅ реализовано

---

## 4. Инфраструктура плагина

### 4.1. Тесты для сериализатора (P2)

- Настроить Vitest с моками Figma API
- Покрыть `serializeNode` для каждого типа узла
- Покрыть `serializePaints`, `serializeEffects`, `serializeStyles`

### 4.2. Тесты для обработчиков (P2)

- Мок `figma` global
- Unit-тесты на каждый handler
- Проверка параметров, ошибок, edge cases

### 4.3. Dev-режим с автоперезагрузкой (P3)

**Проблема:** При разработке нужно вручную перезапускать плагин в Figma после сборки.

**План:**
- Исследовать возможность уведомления UI об обновлении через WebSocket
- Добавить индикатор версии/сборки в UI плагина

---

## 5. Порядок выполнения

### Фаза 1 — Фундамент ✅
1. Расщепить `code.ts` на обработчики + router + utils (1.1) ✅
2. Структурированные ошибки (2.1) — частично ✅
3. Добавить обработчик `set_auto_layout` (3.1) ✅

### Фаза 2 — Качество ✅
4. Экспорт типов сериализатора + общие типы (1.2) ✅
5. Вынести `serializeWithDepth` (1.4) ✅
6. Навигация по страницам `set_current_page` (3.2) ✅
7. Поиск узлов `find_nodes` (3.3) ✅
8. Применение стилей `apply_style` (3.7) ✅

### Фаза 3 — Расширение ✅
9. Создание групп `create_group` (3.4) ✅
10. Редактирование обводки `set_stroke` (3.5) ✅
11. Редактирование эффектов `set_effects` (3.6) ✅
12. Параметр `includeHidden` (3.11) ✅
13. Валидация параметров в обработчиках (1.3) — частично ✅
14. Тесты: сериализатор (4.1) ✅
15. Тесты: обработчики (4.2) ✅

### Фаза 4 — Продвинутые возможности ✅/❌
16. Компоненты и экземпляры (3.8) ✅ — реализовано: list_components, create_component, create_instance, set_instance_properties
17. Градиенты (3.9) ✅ — set_gradient_fill
18. Constraints (3.10) ✅ — set_constraints
19. Dev-режим (4.3) ❌ — Figma sandbox не поддерживает динамическую загрузку

---

## Оставшиеся задачи

Все задачи выполнены! ✅

Плагин полностью реализован согласно плану. Для расширения функционала:

- Добавить больше обработчиков ( например: `set_blend_mode`, `set_opacity` как отдельные инструменты)
- Расширить тесты для edge cases в отдельных обработчиках
- Добавить поддержку undo/redo через figma.history API
