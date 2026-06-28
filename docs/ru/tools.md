# Список инструментов

75 инструментов, сгруппированных по назначению. Каждый инструмент:

- Имеет уникальное имя (например `get_node`)
- Принимает Zod-валидированный объект как input
- Возвращает либо `{ data: … }` при успехе, либо `{ error: "…" }` при ошибке
- Выполняется целиком в Figma-песочнице (без сети, без диска)
- Если `fileKey` не указан и подключён ровно один Figma-файл — сервер выбирает его автоматически

`nodeIds` — через двоеточие (например `"4029:12345"`). Составные ID для инстансов — через точку с запятой (`"4029:12345;4029:67890"`).

---

## Чтение документа

### `list_files`

Список подключённых Figma-файлов.

**Input:** нет.

**Returns:** `[{ fileKey, fileName }]`

```json
[
  { "fileKey": "oAKWWJ9y0BTH1XPmnYvGLw", "fileName": "My file" }
]
```

---

### `get_metadata`

Лёгкая сводка о текущем файле: имя, число страниц, текущая страница.

**Input:** нет.

**Returns:** `{ fileName, currentPageId, currentPageName, pageCount, pages: [{ id, name }] }`

---

### `get_document`

Полное дерево документа текущей страницы.

**Input:**

| Поле | Тип | Default | Описание |
|---|---|---|---|
| `includeHidden` | boolean | `false` | Включать скрытые ноды |
| `includeImageData` | boolean | `false` | Inline base64 картинки для нод с image fills (большой ответ) |
| `enrich` | boolean | `false` | Резолвить paint/text/effect стили в человекочитаемые имена + значения |

---

### `get_node`

Получить одну ноду (и опционально её детей) по ID.

**Input:**

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `nodeId` | string | да | ID через двоеточие, напр. `"4029:12345"` |
| `depth` | number | `Infinity` | Сколько уровней детей включить |
| `includeHidden` | boolean | `false` | Включать скрытые ноды |
| `includeImageData` | boolean | `false` | Inline base64 картинки |
| `enrich` | boolean | `false` | Резолвить стили |

**Пример:**

```json
{
  "tool": "get_node",
  "params": {
    "nodeId": "1409:32080",
    "fileKey": "oAKWWJ9y0BTH1XPmnYvGLw",
    "depth": 2
  }
}
```

---

### `get_selection`

Текущая выборка нод.

**Returns:** `[{ id, name, type, bounds }]`

### `get_design_context`

Как `get_document`, но с лимитом глубины (для контекстного "как выглядит этот блок" без полного дерева).

### `get_styles`

Все локальные стили файла (paint, text, effect, grid).

### `get_variable_defs`

Все коллекции переменных, моды и значения переменных по модам.

### `find_nodes_by_variable`

Найти все ноды, привязанные к переменной.

**Input:**

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `variable` | string | да | ID или имя переменной |
| `global` | boolean | default `true` | Искать по всем страницам |
| `limit` | number | default `500` | Кап на результаты |

**Returns:** `{ variable: { id, name, type }, count, usages: [{ nodeId, name, type, boundOn, value }] }`

---

## Скриншоты и экспорты

### `get_screenshot`

Экспортировать ноду как PNG, SVG, JPG или PDF, вернуть как base64.

**Input:** `{ nodeIds?, format?, scale? }`

### `save_screenshots`

То же, но пишет на диск. **Batch tool** — принимает `items: [{ nodeId, outputPath, format?, scale? }]`.

`outputPath` относительно CWD MCP-сервера. Сервер отказывается писать за пределы этой директории.

### `get_image`

Для нод с изображениями. Возвращает `{ mime, base64, source, scaleMode, bytes }`.

### `save_node_json`

Сериализует одну или несколько нод в JSON на диск. Полезно когда дерево слишком большое для контекста.

---

## Dev Mode mirror

Эти работают **напрямую в UI плагина** (без MCP-раундтрипа):

| Tool | Output |
|---|---|
| `get_dev_css` | Computed CSS ноды (строка) |
| `get_dev_svg` | Inline SVG-разметка |
| `get_dev_html` | HTML-воспроизведение визуальной структуры |
| `get_dev_json` | JSON дамп ноды + computed styles |
| `get_dev_image` | PNG экспорт ноды |

Все пять принимают `{ nodeId? }` (default = current selection).

---

## Запись в документ

Каждый write tool возвращает предыдущее состояние затронутых нод, чтобы агент мог показать diff или откатить.

### Стиль и видимость

| Tool | Эффект |
|---|---|
| `set_node_visibility` | Показать / скрыть |
| `set_text_content` | Изменить текст TEXT-ноды |
| `set_text_properties` | Font, size, weight, alignment, line-height, letter-spacing, color |
| `set_node_properties` | Position, size, rotation, opacity, fill, corner radius |
| `set_stroke` | Stroke color / weight / position / alignment / cap / join / dash |
| `set_effects` | Drop shadow, inner shadow, blur (и удаление) |
| `set_constraints` | Horizontal / vertical constraints |
| `set_gradient_fill` | Linear / radial / angular / diamond gradient |
| `set_blend_mode` | Normal, Multiply, Screen, Overlay, ... |
| `set_clipping` | Clip content к bounds ноды |
| `set_auto_layout` | Layout mode, padding, gap, alignment, sizing |
| `apply_style` | Применить локальный paint/text/effect style |
| `flatten` | Flatten vector / boolean-operation descendants |

### Структура

| Tool | Эффект |
|---|---|
| `duplicate_nodes` | Клонировать ноды (с детьми) |
| `reparent_nodes` | Переместить ноды в нового parent, опционально по индексу |
| `delete_nodes` | Удалить (требует `confirm: true` для безопасности) |
| `move_nodes` | Переместить по абсолютным координатам |
| `set_z_order` | Bring to front / send to back / move up / move down |
| `align_nodes` | Выровнять две или более нод |
| `create_group` | Обернуть в GROUP |
| `set_current_page` | Переключить активную страницу |

### Создание

| Tool | Эффект |
|---|---|
| `create_frame` | Новая FRAME |
| `create_text` | Новая TEXT |
| `create_shape` | Новый RECTANGLE / ELLIPSE / LINE |
| `create_image` | Новый image-bearing frame из URL или локального пути |
| `create_component` | Новый COMPONENT |
| `create_instance` | Новый INSTANCE компонента |
| `set_instance_properties` | Override instance properties |
| `create_paint_style` | Новый локальный paint style |
| `create_text_style` | Новый локальный text style |
| `create_effect_style` | Новый локальный effect style |
| `create_grid_style` | Новый локальный grid style |
| `create_variable_collection` | Новая коллекция переменных |
| `create_variable` | Новая переменная в существующей коллекции |
| `create_design_token_alias` | Alias одной переменной на другую |
| `create_styles_table` | Документационная страница со списком всех стилей |

### Bulk операции

| Tool | Эффект |
|---|---|
| `batch_mutation` | Много мелких мутаций в одном вызове (быстрее, чем 75 отдельных) |
| `update_component_instances` | Протолкнуть master changes во все instances |
| `bulk_rename` | Переименовать ноды по regex |
| `bulk_swap_text` | Заменить текст на нескольких нодах |
| `switch_theme` | Переключить все ноды, привязанные к переменным коллекции A, на эквивалентный mode в B (light → dark) |
| `apply_design_system` | Применить сохранённый manifest (paint/text/effect styles + variables) к текущему файлу |
| `apply_style_preset` | Применить именованный пресет ("elevated card") |
| `apply_aria_labels` | Auto-name слои по семантической роли + содержимому |
| `normalize_layers` | Привести имена слоёв к единому стилю |
| `normalize_spacing` | Привести paddings / gaps к дизайн-системе |
| `set_z_index_strategy` | Применить z-order политику |
| `lint_styles` | Сообщить о нодах, чьи стили не совпадают с локальным style того же имени |
| `go_to_node` | Подвинуть viewport к ноде (UI side-effect) |
| `diff_layouts` | Структурный diff двух поддеревьев |
| `manage_snapshots` | Take / list / restore / delete point-in-time snapshots |

### Design system

| Tool | Эффект |
|---|---|
| `extract_design_system` | Собрать все paint, text, effect, spacing, radius, variable в manifest |
| `extract_design_system_bulk` | То же по нескольким поддеревьям |
| `manage_manifests` | List / save / load / delete манифестов |
| `export_design_tokens` | Дамп manifest как Style Dictionary JSON / CSS variables / Tailwind config |
| `import_design_tokens` | Применить Style Dictionary JSON / CSS variables / Tailwind config |
| `storybook_import` | Создать Figma frame из Storybook-like JSON spec |
| `spec_import` | Высокоуровневый JSON spec: row / column / text / button / input / rect |
| `generate_component_from_description` | Free-text описание → компонент |
| `analyze_node_against_design` | Где нода отклоняется от дизайн-системы |

### AI helpers

| Tool | Эффект |
|---|---|
| `figma_inspect` | One-shot плотный дамп ноды |
| `inspect_node` | Как `figma_inspect` + deviation report |
| `inspect_variables` | Какие переменные использует поддерево |
| `generate_code` | Стартовый HTML / JSX / SwiftUI / Compose / Flutter |
| `visualize_layout` | Auto-layout как ASCII tree |
| `get_layout_measurements` | Padding, gap, alignment, sizing-mode breakdown |
| `get_component_variants` | Список всех variants COMPONENT_SET |
| `get_set_property_value` | Прочитать instance override для component property |
| `set_node_metadata` | Сохранить произвольный metadata (agent scratch space) |
| `get_node_metadata` | Прочитать этот metadata |
| `get_constraints` | Все constraints (h/v, layout-positioning) поддерева |
| `get_selection_chain` | Parent chain от выделенных нод до page root |

### Экспорт спрайтов

#### `export_icon_sprite`

Найти SVG-иконки по файлу, дедуплицировать, записать один `<symbol>`-based sprite.

**Input:**

| Поле | Тип | Default | Описание |
|---|---|---|---|
| `outputPath` | string | required | Файл для записи (относительно CWD сервера) |
| `scope` | `"page"` \| `"selection"` \| `"document"` | `"page"` | Где искать |
| `pageId` | string | (current) | Только когда `scope="page"` и нужна конкретная страница |
| `namePattern` | string regex | `/^(icon\|ic[-_\/])/i` | RegExp по имени ноды. `""` — отключить фильтр |
| `sizeFilter` | `{ width, tolerance? }` | none | Только иконки с width ≈ height ≈ `width` в пределах `tolerance` (default 1 px) |
| `includeHidden` | boolean | `false` | Включать скрытые ноды |
| `maxIcons` | number | `1000` | Safety cap |
| `dedupeMode` | `"raw"` \| `"normalized"` \| `"paths"` \| `"none"` | `"normalized"` | См. ниже |
| `spriteFormat` | `"symbol"` \| `"g"` | `"symbol"` | `<symbol id viewBox>` или flat `<g id>` |
| `fillStrategy` | `"currentColor"` \| `"preserve"` \| `"black"` | `"currentColor"` | Заменить / сохранить / принудительно fill |
| `fileKey` | string | (auto) | Какой файл |

**Dedupe modes:**

- `raw` — побайтовое сравнение. Две иконки с одинаковым path но разным fill — разные.
- `normalized` (default) — стрипает `fill` / `stroke` / `style` / `class` / `id` / dimensions / whitespace перед сравнением. Две визуально одинаковые иконки схлопываются.
- `paths` — хеширует только атрибут `d` каждого `<path>`. Разные обёртки, одинаковая геометрия — схлопываются.
- `none` — без дедупа. Каждый кандидат становится отдельным `<symbol>`. Одинаковые имена получают auto-нумерацию (`-2`, `-3`, …). Используй если хочешь сам потом разобраться.

**Returns:**

```json
{
  "scope": "page",
  "totalFound": 312,
  "uniqueIcons": 247,
  "duplicatesRemoved": 65,
  "truncated": false,
  "outputPath": "/abs/path/to/icons.svg",
  "bytesWritten": 18432,
  "groups": [
    { "spriteId": "hugeicons-youtube", "count": 4, "nodeIds": ["1:2", "3:4", "5:6", "7:8"], "keptNodeId": "1:2", "keptName": "hugeicons:youtube", "width": 24, "height": 24 }
  ]
}
```

**Standalone equivalent** (без AI-клиента):

```bash
node scripts/export-via-rpc.mjs \
  --fileKey oAKWWJ9y0BTH1XPmnYvGLw \
  --out ./icons.svg \
  --pattern "hugeicons|solar|iconamoon" \
  --max 1000
```

Использует `dedupeMode: "none"`, пишет напрямую на диск. Используй как starting point.

---

## Форма входа (все инструменты)

Input каждого инструмента валидируется по Zod-схеме в `server/src/schema.ts`. Общие поля:

| Поле | Тип | Описание |
|---|---|---|
| `fileKey` | string (optional) | Figma file key. Обязателен только если подключено несколько файлов. |
| `outputPath` | string | (write tools) Относительный путь внутри CWD MCP-сервера. Path traversal блокируется. |
| `nodeId` | string | ID через двоеточие. |
| `nodeIds` | string[] | Массив ID. |
| `confirm` | boolean | Обязательно `true` для деструктивных (`delete_nodes`). |

## Форма выхода (все инструменты)

MCP tools возвращают:

```json
{
  "content": [{ "type": "text", "text": "<JSON string>" }]
}
```

Сервер также оборачивает в `{ data, error }` для прямого `/rpc` доступа. Поле `text`:

- JSON success payload
- строка `Bridge error: …` для transport-level ошибок (нет плагина, timeout и т.д.)
