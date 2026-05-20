# md-wysiwyg — Plan

A VS Code extension that gives `.md` files an Obsidian-style Live Preview editing
experience: markdown syntax markers are hidden and inline formatting is shown
rendered, except inside the block the cursor is in (which shows raw source).

## 1. Decisions locked

| Area | Decision |
|---|---|
| Rendering architecture | Decorations on the real VS Code text editor (`TextEditorDecorationType`). No webview-based editor. |
| Markdown scope (MVP) | CommonMark + GFM (tables, task lists, strikethrough, autolinks) + math (`$...$`, `$$...$$`) + Mermaid fenced code blocks. |
| Obsidian features | Live Preview behavior only. **No** wiki-links, embeds, callouts, tags, reading-mode toggle in v1. |
| Reveal granularity | Whole block / paragraph. Cursor anywhere in a block reveals all syntax for that block; everything else stays rendered. |
| Math / Mermaid rendering | Render to SVG, inject inline via decoration `after` with `contentIconPath`. Async + cached on disk by content hash. |
| Heading visual | Same font size, bolder weight + theme-aware color. No font-size scaling (avoids VS Code line-height clipping issue [#247366](https://github.com/microsoft/vscode/issues/247366)). |
| Activation | Off by default. `MD WYSIWYG: Enable` command turns it on for the current editor; `Disable` reverts. Not auto-activated on `.md` open. |
| Language / build | TypeScript, esbuild, `@vscode/test-cli` + `@vscode/test-electron` for integration tests, `vitest` for unit tests, `vsce` for packaging. |
| File types | `.md` only. Not `.mdx`, not `.markdown` (can add later). |

## 2. Why decorations, not a webview

Obsidian's Live Preview is CodeMirror 6 with decorations — not a separate
rich-text widget. Mirroring that approach in VS Code means we keep, for free:

- Multi-cursor, column selection, snippets
- Vim/Vimium extensions, language server features, intellisense
- Native find/replace, command palette, git gutter, diff view
- Save, dirty state, undo/redo, hot exit — VS Code already handles them

A webview (Milkdown/Tiptap/Vditor) would force us to rebuild all of the above
and would still have lossy markdown round-trip. We accept the cost: decorations
can't *truly* render block content (images at natural size, table grids, math),
so for those we use `contentIconPath` SVG injection — the one escape hatch
decorations give us.

## 3. UX spec

### Reveal model — "block-scope"

The document is parsed to an AST. Each top-level block (paragraph, list, table,
heading, blockquote, code fence, math block, hr) gets a source range. When the
cursor (or any selection endpoint) is inside a block's range, that block is
**raw**. Every other block is **rendered**.

| Construct | Rendered (cursor outside) | Raw (cursor inside) |
|---|---|---|
| `# Heading` | `Heading` styled bold + accent color, `#` hidden | full source visible |
| `**bold**` | `bold` shown bold, `**` hidden | full source visible |
| `*italic*` / `_italic_` | italic, markers hidden | full source visible |
| `~~strike~~` | strikethrough, markers hidden | full source visible |
| `` `code` `` | monospace box, backticks hidden | full source visible |
| `[text](url)` | `text` styled as link, target hidden, hover shows url | full source visible |
| `![alt](url)` | image rendered below source line via `after` decoration; source line dimmed | full source visible |
| `- item` / `1. item` | bullet replaced with `•`/number, marker hidden | full source visible |
| `- [ ] task` / `- [x]` | clickable checkbox, marker hidden | full source visible |
| `> quote` | left-bar styling, `>` hidden | full source visible |
| `---` | horizontal rule rendered | full source visible |
| ` ``` ` code fence | fence lines hidden, body kept with language background | full source visible |
| GFM table | pipe + alignment rows hidden, cells styled as grid via background bands | full source visible |
| `$math$` / `$$math$$` | KaTeX SVG via `after`, source hidden inline | full source visible |
| ```` ```mermaid ```` | Mermaid SVG injected on the line *after* the closing fence | full source visible |

### Interactions

- Click a `- [ ] task` checkbox → toggle to `- [x]` (and back).
- Hover a `[text](url)` → tooltip showing url.
- Hover a math expression → tooltip showing rendered KaTeX (also shown inline).
- Cmd+click a link → existing VS Code behavior (open).

### Out of scope (v1)

- Toolbar / menu UI
- Right-click "format as bold" commands
- Drag-and-drop image paste
- Outline rendering changes (VS Code outline already works from the AST)
- Wiki-links `[[Page]]`, embeds `![[file]]`, callouts `> [!note]`, `#tags`
- Reading mode (fully-rendered, cursor never reveals)
- `.mdx`, `.markdown`, `.qmd`

## 4. Architecture

```
+----------------------------------------------------------+
|                  Extension Host (Node)                   |
|                                                          |
|  extension.ts         WysiwygController(per editor)      |
|     |                       |                            |
|     | activate              | onDidChangeTextDocument    |
|     v                       | onDidChangeTextEditorSel.  |
|  registerCommands           v                            |
|                          parse() ── mdast (remark)       |
|                             |                            |
|                             v                            |
|                       computeDecorations(ast, cursor)    |
|                             |                            |
|                             v                            |
|                       applyDecorations(editor)           |
|                             |                            |
|                             +-- enqueues async render    |
|                                  for math/mermaid blocks |
|                                                          |
|  RenderWorker (hidden WebviewPanel, retainContextWhen-   |
|    Hidden=true): receives {id, kind, source}, returns    |
|    {id, svgPath}. KaTeX runs Node-side; Mermaid needs    |
|    DOM so it runs inside the hidden webview.             |
+----------------------------------------------------------+
```

### Key modules

- `src/extension.ts` — activation, command registration, per-editor controller lifecycle.
- `src/controller.ts` — `WysiwygController`. One per enabled `TextEditor`. Listens to text + selection changes (debounced), recomputes, applies.
- `src/parser.ts` — wraps `remark` + `remark-gfm` + `remark-math` + `remark-frontmatter` to produce an mdast with position info.
- `src/decorations.ts` — pure function `(ast, cursorOffset) => DecorationSpec[]`. The bulk of the logic. Testable without VS Code.
- `src/decorationTypes.ts` — the `TextEditorDecorationType` instances (created once, reused). One per visual kind (hidden, bold, italic, link, etc.).
- `src/render/katex.ts` — sync KaTeX render in Node, write SVG to cache dir, return path.
- `src/render/mermaid.ts` — message hidden webview, await SVG, write to cache, return path.
- `src/render/cache.ts` — `sha256(source) -> SVG path` lookup in `context.globalStorageUri`.
- `src/commands.ts` — `enable`, `disable`, `toggleTaskAtCursor`.
- `src/test/unit/*.test.ts` — vitest, parser + decoration logic.
- `src/test/integration/*.test.ts` — `@vscode/test-cli`, opens a fixture file and asserts decoration ranges.
- `test/fixtures/*.md` — sample documents for manual + automated testing.

### Performance notes

- Parse + decoration recomputation debounced 80ms after edits, 30ms after cursor moves.
- AST cached on `document.version`; cursor-only changes reuse the AST and only re-derive which block is "raw".
- Math/Mermaid renders are async: first paint shows source dimmed with a small spinner glyph (`⟳`); when the worker returns, we attach the SVG.
- SVG cache keyed by `sha256(kind + source)` in `globalStorageUri`. Never invalidated automatically (cheap to rebuild; cleanup via a `Clear render cache` command).

### Decoration kinds

Created once at activation:

| Kind | CSS / VS Code properties |
|---|---|
| `hidden` | `textDecoration: "none; display: none"` |
| `dim` | `opacity: 0.45` |
| `bold` | `fontWeight: bold` |
| `italic` | `fontStyle: italic` |
| `strike` | `textDecoration: line-through` |
| `code` | themed bg color + `fontFamily` editor mono |
| `heading1..6` | `fontWeight: bold` + theme color, no scaling |
| `linkText` | underline + link color |
| `blockquoteBar` | `before` `▍` + dim color |
| `bullet` | `before` `•` |
| `taskOpen` / `taskDone` | `before` checkbox glyph, clickable via `MarkdownString` hover + command link |
| `hr` | `before` long dash bar full width |
| `mathSvg` | `after` `contentIconPath` for the rendered SVG |
| `mermaidSvg` | `after` `contentIconPath`, block-level |

## 5. Implementation phases

Each phase ends in a runnable extension. Don't proceed until the current phase
works end-to-end in the dev host.

### Phase 0 — Scaffold (½ day)

- `package.json` with engines, activation events, commands, scripts.
- `tsconfig.json`, `esbuild.config.mjs` (watch + build).
- `.vscode/launch.json` so `F5` opens the extension dev host on `test/fixtures/sample.md`.
- Empty `extension.ts` that registers `mdWysiwyg.enable` / `mdWysiwyg.disable` and logs.
- `vitest.config.ts`, `.vscode-test.mjs`.
- One smoke test: `vitest` passes, dev host opens, command shows up in palette.

**Verify:** I run `code --extensionDevelopmentPath=. --new-window test/fixtures/sample.md`, palette contains both commands, no errors in `Help → Toggle Developer Tools` console.

### Phase 1 — Inline formatting (1 day)

Decorate, in this order: bold, italic, strike, inline code, headings (color/weight only), links, horizontal rules, blockquotes.

- Parser produces AST with source positions.
- `computeDecorations` walks AST, emits hide-ranges for syntax markers + style-ranges for content.
- Block-scope reveal: find the top-level block containing the cursor offset; skip emitting decorations for spans inside it.
- Controller wires `onDidChangeTextDocument` + `onDidChangeTextEditorSelection` with debounces.

**Verify:** Unit test — given a fixture string, `computeDecorations(ast, cursorAt)` returns the expected ranges (snapshot test). Integration test — open fixture, assert `editor.visibleRanges` decorations match. Manual — open `sample.md`, move cursor between paragraphs, watch syntax fade/reveal.

### Phase 2 — Lists, tasks, code fences (½ day)

- Bulleted, ordered, and task lists with `before` glyph decorations.
- Clickable task checkboxes (hover with command link that flips `[ ]` ↔ `[x]`).
- Fenced code block: hide fence lines, apply themed background to body via full-line decoration.

**Verify:** Click a checkbox in the dev host, source updates; cursor-reveal still works inside the list.

### Phase 3 — GFM tables (½ day)

- Hide the `|` separators and the `---|---` alignment row when rendered.
- Apply alternating-row background bands via line decorations.
- Reveal the entire table when cursor is in any of its rows.

**Verify:** Fixture table reads cleanly when cursor is outside; full pipe syntax appears when cursor enters any row.

### Phase 4 — Math (KaTeX) (½ day)

- `remark-math` to detect `$..$` / `$$..$$`.
- Sync KaTeX render in Node → SVG file in cache dir → `after` decoration with `contentIconPath`.
- Inline math: SVG placed at end of the math span, source `hidden`.
- Block math: SVG on the line below.
- Hover always shows rendered math (works even when raw).

**Verify:** Fixture with `$E = mc^2$` and `$$\\int_0^1 x^2 dx$$` shows rendered math when cursor is outside the block.

### Phase 5 — Mermaid (1 day)

- Hidden `WebviewPanel` with `retainContextWhenHidden: true` containing mermaid.esm.min.mjs.
- Worker protocol: `{id, source} → {id, svg}` via `postMessage`.
- Extension writes SVG to cache, attaches as `mermaidSvg` decoration on line after the closing fence.
- Loading state: dimmed source + `⟳` spinner glyph until response.

**Verify:** Fixture with a flowchart renders within 1s of opening; editing the source shows spinner then updated SVG.

### Phase 6 — Polish, packaging (½ day)

- Settings: `mdWysiwyg.debounceMs`, `mdWysiwyg.disableInBlockTypes` (e.g. `["code"]` to skip processing).
- `Clear render cache` command.
- README with screenshots, known limitations.
- `vsce package` produces a `.vsix`.

**Verify:** Install the `.vsix` in a *clean* VS Code instance, basic flow works.

## 6. How I (Claude) will test

Decorations don't show up in tool output, so verification needs to be visual or
asserted programmatically. Both paths are in scope:

1. **Unit (fast, every change):** `vitest` against `decorations.ts`. Pure functions, no VS Code. Snapshot tests of decoration specs against fixture markdown.
2. **Integration (per phase):** `@vscode/test-cli` boots a headless extension host, opens a fixture, queries via a test-only command that returns the live decoration set, and asserts.
3. **Visual smoke (per phase, manual):** I launch the dev host in a new VS Code window via `code --extensionDevelopmentPath=/home/malay/Code/md-wysiwyg --new-window /home/malay/Code/md-wysiwyg/test/fixtures/sample.md` and screenshot it using the `agent-browser` skill (which supports Electron apps including VS Code). The screenshot goes into a `screenshots/` folder I attach to phase completion notes.
4. **Diff harness:** A `test/fixtures/sample.md` covers every supported construct. After each phase I rerun the screenshot and eyeball-compare against the previous one — regressions in unrelated constructs surface immediately.

## 7. Risks & open questions

| Risk | Mitigation |
|---|---|
| `contentIconPath` SVG injection causes line-height jitter ([VS Code #247366](https://github.com/microsoft/vscode/issues/247366)) | Use block-level `after` on a separate line for math/mermaid; if inline math is too jittery, downgrade inline math to hover-only and keep block math inline. |
| Mermaid renders are async — flicker on every keystroke inside a diagram | Only re-render when the cursor leaves the block. While cursor is inside, show raw + cached SVG from last render. |
| Large `.md` files (>500KB) make full re-parse slow | Phase 0 sets a 1MB hard cap; above the cap, controller refuses to enable and shows a warning. Incremental re-parsing is post-v1. |
| Task-checkbox click via hover command link feels clunky | Phase 2 will A/B with `vscode.window.onDidChangeTextEditorSelection` + a click-detection heuristic; keep the simpler hover-command path if heuristic is unreliable. |
| KaTeX SVG output disagrees with VS Code's theme background | Render with `output: 'htmlAndMathml'` + wrap in a `<svg>` with `currentColor`; tint via decoration `color` if needed. |
| Multiple VS Code editor groups showing the same document | Controller is per-`TextEditor`, not per-document; each gets its own decoration set. Cache shared. |

Open question (defer to first encounter, not blocking the plan):
- Should `Enable` persist per-file across reloads (via workspace state)? Default: yes, in workspace state keyed by file URI.

## 8. Todos (live)

Tracked in the conversation via `TodoWrite` once implementation starts. Initial
seed:

1. Phase 0 scaffold
2. Phase 1 inline formatting (parser + block-scope reveal + 7 decoration kinds)
3. Phase 2 lists, tasks, code fences
4. Phase 3 GFM tables
5. Phase 4 KaTeX inline + block
6. Phase 5 Mermaid via hidden webview worker
7. Phase 6 settings, cache-clear command, README, package

## 9. Non-goals (explicit)

- Reading-mode toggle. (Future.)
- Wiki-links, embeds, callouts, tags. (Future, if we ever target Obsidian vault interop.)
- Markdown editing *commands* (bold/italic toolbar). (Future, not part of "Obsidian-style editing"; Obsidian's UX is keyboard + visual feedback, not a toolbar.)
- Live collaboration, file sync, vault concept. (Out of scope forever — different product.)
- Supporting `.mdx`. (Future; needs MDX-aware parser.)
