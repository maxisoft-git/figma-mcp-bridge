# Figma MCP Bridge

Figma плагин + MCP-сервер для передачи данных документа Figma в AI-инструменты без ограничений API Figma. Поддерживает подключение нескольких Figma-файлов одновременно, предоставляет богатые данные о стилях (заливки, обводки, эффекты, auto-layout, типографика, переменные) для точного перевода дизайна в код, а также набор инструментов записи для безопасного редактирования агентом.

Форк [gethopp/figma-mcp-bridge](https://github.com/gethopp/figma-mcp-bridge).

## Быстрый старт

### 1. Подключите MCP-сервер к AI-инструменту

Добавьте в конфигурацию MCP вашего AI-инструмента (Cursor, Windsurf, Claude Desktop, Claude Code):

```json
{
  "figma-bridge": {
    "command": "node",
    "args": ["/path/to/figma-mcp-bridge/server/dist/index.js"]
  }
}
```

### 2. Установите Figma плагин

В Figma: `Plugins > Development > Import plugin from manifest` — выберите `manifest.json` из папки `plugin/`.

### 3. Начните работу

Откройте Figma файл, запустите плагин и используйте AI-инструмент. MCP-сервер автоматически подключится к плагину.

## Доступные инструменты

### Чтение

| Инструмент | Описание |
|---|---|
| `list_files` | Список всех подключённых Figma файлов |
| `get_document` | Дерево документа текущей страницы |
| `get_selection` | Текущая выборка узлов |
| `get_node` | Конкретный узел по ID (формат через двоеточие, например `4029:12345`) |
| `get_styles` | Все локальные стили (paint, text, effect, grid) |
| `get_metadata` | Имя файла, страницы, текущая страница |
| `get_design_context` | Дерево с ограничением глубины для понимания контекста дизайна |
| `get_variable_defs` | Все коллекции переменных, моды и значения (design tokens) |
| `get_screenshot` | Экспорт узлов как PNG/SVG/JPG/PDF (base64) |
| `get_image` | Экспорт узла как изображение с опцией фонового экспорта |

### Запись

| Инструмент | Описание |
|---|---|
| `set_node_visibility` | Показать/скрыть узлы |
| `set_text_content` | Изменить содержимое текстового узла |
| `set_text_properties` | Изменить шрифт, размер, выравнивание, цвет текста |
| `set_node_properties` | Изменить имя, позицию, размер, видимость, opacity, радиус, заливку, verticalTrim, horizontalTrim |
| `create_frame` | Создать фрейм |
| `create_text` | Создать текстовый узел |
| `create_shape` | Создать прямоугольник, эллипс или линию |
| `create_image` | Создать изображение из файла, URL или data URI |
| `duplicate_nodes` | Дублировать узлы |
| `reparent_nodes` | Переместить узлы в другую родительскую группу |
| `delete_nodes` | Удалить узлы (требует подтверждение) |
| `set_stroke` | Изменить обводку (цвет, вес, выравнивание, dash-паттерн) |
| `set_effects` | Добавить/заменить/очистить эффекты (тени, размытия) |
| `set_constraints` | Установить constraints (горизонтальные и вертикальные) |
| `set_gradient_fill` | Добавить градиентную заливку (линейный, радиальный, угловой, diamond) |
| `create_component` | Конвертировать узел в компонент |
| `create_instance` | Создать экземпляр компонента |
| `set_instance_properties` | Переопределить свойства дочерних узлов в экземпляре |
| `batch_mutation` | Выполнить несколько операций атомарно (создание, изменение, удаление) |

### Экспорт файлов

| Инструмент | Описание |
|---|---|
| `save_node_json` | Сохранить узлы в JSON-файлы на диск |
| `save_screenshots` | Экспортировать и сохранить скриншоты на диск |

Все инструменты принимают опциональный параметр `fileKey` при подключении нескольких Figma файлов.

## Параметры запросов

### includeImageData

Инструменты `get_node`, `get_selection`, `get_document`, `get_design_context` поддерживают параметр `includeImageData: true`. При его установке для узлов с IMAGE-заливками (изображения в фонах или наполненных фигурах) в сериализованные данные включаются реальные байты изображения в base64:

```json
{
  "type": "IMAGE",
  "scaleMode": "FILL",
  "imageHash": "abc123",
  "imageData": "iVBORw0KGgoAAAANSUhEUgAAAAEAAA..."
}
```

### backgroundOnly

Инструмент `get_image` поддерживает параметр `backgroundOnly: true`. При его установке экспортируется только фон фрейма без дочерних элементов:

```
get_image({ nodeId: "123:456", backgroundOnly: true, format: "PNG" })
```

### depth

Инструмент `get_design_context` поддерживает параметр `depth` (по умолчанию 2) для ограничения глубины обхода дерева узлов.

### includeHidden

Инструменты `get_node`, `get_selection`, `get_document`, `get_design_context` поддерживают параметр `includeHidden: true` для включения скрытых узлов в результат.

## Примечания

- Инструменты записи работают только при открытом и подключённом Figma плагине.
- У пользователя должны быть права на редактирование целевого файла.
- `delete_nodes` намеренно защищён параметром `confirm: true`.
- Редактирование текста автоматически загружает шрифты целевого узла.
- Новые текстовые узлы по умолчанию используют `Inter Regular`.
- `create_image` читает локальные пути относительно рабочей директории MCP-сервера.
- `batch_mutation` поддерживает до 100 операций за вызов. Операции выполняются последовательно; при ошибке выполнение останавливается. Можно создавать узлы и ссылаться на них по имени (`tmp:refName`) в последующих операциях того же вызова.

## Что можно построить

С текущим набором инструментов агент может создавать слайды в новом Figma файле:

- Создавать фреймы для слайдов
- Добавлять и стилизовать заголовки и текст
- Создавать прямоугольники, эллипсы, линии
- Добавлять изображения из файлов или URL
- Получать фоновые изображения из дизайна (includeImageData)
- Экспортировать только фон фрейма без элементов (backgroundOnly)
- Дублировать шаблоны слайдов
- Перемещать контент между группами
- Изменять свойства геометрии и отображения

## Экспорт выборки

Плагин имеет кнопку **Export Selection to JSON** — экспортирует выборку в ZIP с JSON (полное дерево дизайна) и PNG (2x скриншот).

## Данные о стилях

Мост сериализует полные данные о стилях каждого узла:

- **Заливки и обводки** — solid, linear/radial/angular/diamond градиенты, image fills, weight, alignment, dash patterns
- **Изображения** — при `includeImageData: true` включаются реальные байты в base64
- **Эффекты** — drop shadows, inner shadows, layer/background blur
- **Corner radius** — равномерный и per-corner, corner smoothing
- **Auto-layout** — direction, gap, alignment, sizing mode, wrap, counter-axis spacing
- **Vertical/Horizontal Trim** — флаги обрезки контента фрейма
- **Типографика** — font family, weight, style, size, line height, letter spacing, alignment, auto-resize
- **Layout** — opacity, blend mode, visibility, rotation, constraints, clipping, padding
- **Переменные** — коллекции с модами и resolved values (design tokens)

## Локальная разработка

### Сервер

```bash
cd server && npm install && npm run build
```

### Плагин

```bash
cd plugin && bun install && bun run build
```

## Структура

```
figma-mcp-bridge/
├── plugin/                      # Figma плагин (TypeScript/React)
│   └── src/
│       ├── main/
│       │   ├── code.ts          # Оригинальная точка входа (не используется после рефакторинга)
│       │   ├── router.ts        # Диспетчер запросов к хендлерам
│       │   ├── types.ts        # Типы ServerRequest, PluginResponse, RequestType
│       │   ├── errors.ts       # Структурированные ошибки
│       │   ├── serializer.ts    # Сериализация узлов Figma в JSON
│       │   ├── utils.ts        # Общие утилиты
│       │   └── handlers/       # Хендлеры по одному на тип запроса
│       │       ├── get_document.ts
│       │       ├── get_selection.ts
│       │       ├── get_node.ts
│       │       ├── get_screenshot.ts
│       │       ├── get_image.ts
│       │       ├── get_design_context.ts
│       │       ├── set_node_properties.ts
│       │       └── ... (все остальные инструменты)
│       └── ui/                  # React UI плагина
└── server/                      # MCP сервер (TypeScript/Node.js)
    └── src/
        ├── index.ts             # Точка входа
        ├── bridge.ts            # WebSocket мост к Figma плагину
        ├── leader.ts            # Лидер: HTTP сервер + мост
        ├── follower.ts          # Фолловер: проксирует к лидеру через HTTP
        ├── node.ts              # Динамическое переключение лидер/фолловер
        ├── election.ts          # Выборы лидера и мониторинг здоровья
        ├── tools.ts             # Определения MCP инструментов
        ├── schema.ts            # Схемы валидации (Zod)
        └── types.ts             # Общие типы
```

## Как это работает

### Figma плагин

Работает внутри Figma, подключается к MCP-серверу по WebSocket и передаёт данные документа по запросу.

### MCP сервер

Обрабатывает WebSocket подключения от плагина и предоставляет MCP инструменты AI-клиентам. Поддерживает выборы лидера/фолловера для одновременного подключения нескольких AI-инструментов.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FIGMA (Browser)                                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Figma Plugin                                  │  │
│  │                    (TypeScript/React)                                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ WebSocket
                                       │ (ws://localhost:1994/ws)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PRIMARY MCP SERVER                                 │
│                         (Leader on :1994)                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Bridge                                    Endpoints:               │    │
│  │  • Manages WebSocket conn                  • /ws    (plugin)        │    │
│  │  • Forwards requests to plugin             • /ping  (health)         │    │
│  │  • Routes responses back                   • /rpc   (followers)      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                            ▲                              ▲
                            │ HTTP /rpc                    │ HTTP /rpc
                            │                              │
          ┌─────────────────┴───────────┐    ┌─────────────┴───────────────┐
          │    FOLLOWER MCP SERVER 1    │    │    FOLLOWER MCP SERVER 2    │
          │  • Proxies tool calls       │    │  • Proxies tool calls       │
          │  • Takes over if leader dies│    │  • Takes over if leader dies│
          └─────────────────────────────┘    └─────────────────────────────┘
                     ▲                                      ▲
                     │ MCP Protocol (stdio)                  │ MCP Protocol (stdio)
                     ▼                                      ▼
          ┌─────────────────────────────┐    ┌─────────────────────────────┐
          │      AI Tool / IDE 1        │    │      AI Tool / IDE 2        │
          └─────────────────────────────┘    └─────────────────────────────┘
```