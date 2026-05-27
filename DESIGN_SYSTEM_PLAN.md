# План: Инструменты создания стилей и переменных (Design System)

## Цель
Добавить инструменты для создания базовых стилей (цвета, шрифты, эффекты, сетки) и переменных (design tokens) через MCP.

## Реализация: Вариант А — Полный набор

### Новые инструменты

| Инструмент | Описание | Параметры |
|---|---|---|
| `create_paint_style` | Создать цветовой стиль | `name`, `paints[]` (hex цвета) |
| `create_text_style` | Создать текстовый стиль | `name`, `fontFamily`, `fontStyle`, `fontSize`, `lineHeight`, `letterSpacing`, `textDecoration`, `textCase` |
| `create_effect_style` | Создать стиль эффектов | `name`, `effects[]` (цвета hex, offset, radius, spread) |
| `create_grid_style` | Создать стиль сетки | `name`, `layoutGrids[]` |
| `create_variable_collection` | Создать коллекцию переменных | `name`, `modes[]` (названия) |
| `create_variable` | Создать переменную | `name`, `collectionId`, `type` (COLOR/FLOAT/STRING/BOOLEAN), `valuesByMode` (modeName → value) |

### Особенности реализации

- **Hex цвета** — конвертация через `parseHexColor` (как в остальных инструментах)
- **Шрифты** — автоматическая загрузка через `figma.loadFontAsync()` перед созданием text style
- **Переменные** — поиск modeId по modeName автоматически, fallback на modeId если не найдено по имени
- **Возврат** — каждый инструмент возвращает `{ styleId/variableId/collectionId, name }`

### Файлы для изменения

1. **Плагин** — новые хендлеры:
   - `plugin/src/main/handlers/create_paint_style.ts`
   - `plugin/src/main/handlers/create_text_style.ts`
   - `plugin/src/main/handlers/create_effect_style.ts`
   - `plugin/src/main/handlers/create_grid_style.ts`
   - `plugin/src/main/handlers/create_variable_collection.ts`
   - `plugin/src/main/handlers/create_variable.ts`

2. **Плагин** — регистрация:
   - `plugin/src/main/types.ts` — 6 новых типов в `RequestType`
   - `plugin/src/main/router.ts` — 6 импортов + регистрация

3. **Сервер** — схемы и регистрация:
   - `server/src/schema.ts` — 6 схем Zod
   - `server/src/tools.ts` — 6 регистраций через `server.tool()`

### Примеры использования

```typescript
// Цвет
await create_paint_style({
  name: "Primary/500",
  paints: [{ type: "SOLID", color: "#007AFF" }]
});

// Типографика
await create_text_style({
  name: "Heading/H1",
  fontFamily: "Inter",
  fontStyle: "Bold",
  fontSize: 32,
  lineHeight: { value: 40, unit: "PIXELS" }
});

// Эффект
await create_effect_style({
  name: "Shadow/Lg",
  effects: [{
    type: "DROP_SHADOW",
    color: "#000000",
    offset: { x: 0, y: 8 },
    radius: 16,
    spread: 0
  }]
});

// Коллекция переменных
const collection = await create_variable_collection({
  name: "Colors",
  modes: ["Light", "Dark"]
});

// Переменная
await create_variable({
  name: "primary/500",
  collectionId: collection.collectionId,
  type: "COLOR",
  valuesByMode: {
    "Light": "#007AFF",
    "Dark": "#0A84FF"
  }
});
```

## Статус
⏳ План сохранён, ожидает начала реализации.