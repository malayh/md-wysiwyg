import * as vscode from 'vscode';
import type { DecorationKind } from './decorations';

export type StaticDecorationKind = Exclude<DecorationKind, 'tableCell' | 'tableHeaderCell'>;
export type DecorationTypeMap = Record<StaticDecorationKind, vscode.TextEditorDecorationType>;

export function createDecorationTypes(): DecorationTypeMap {
  return {
    hidden: vscode.window.createTextEditorDecorationType({
      textDecoration: 'none; display: none;',
    }),
    bold: vscode.window.createTextEditorDecorationType({
      fontWeight: 'bold',
    }),
    italic: vscode.window.createTextEditorDecorationType({
      fontStyle: 'italic',
    }),
    strike: vscode.window.createTextEditorDecorationType({
      textDecoration: 'line-through',
    }),
    inlineCode: vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('textCodeBlock.background'),
      borderRadius: '3px',
    }),
    heading1: makeHeading('1.7em', '#4f8edc'),
    heading2: makeHeading('1.45em', '#2dabb5'),
    heading3: makeHeading('1.25em', '#3da57b'),
    heading4: makeHeading('1.15em', '#d4a017'),
    heading5: makeHeading('1.05em', '#e07b3b'),
    heading6: makeHeading('1em', '#b06ec4'),
    linkText: vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('textLink.foreground'),
      textDecoration: 'underline',
    }),
    hr: vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      borderStyle: 'solid',
      borderColor: new vscode.ThemeColor('editorWidget.border'),
      borderWidth: '0 0 1px 0',
    }),
    blockquoteBar: vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      borderStyle: 'solid',
      borderColor: new vscode.ThemeColor('textBlockQuote.border'),
      borderWidth: '0 0 0 3px',
      backgroundColor: new vscode.ThemeColor('textBlockQuote.background'),
    }),
    blockquoteMarker: vscode.window.createTextEditorDecorationType({
      textDecoration: 'none; display: none;',
      before: { contentText: '   ' },
    }),
    bullet: vscode.window.createTextEditorDecorationType({
      textDecoration: 'none; display: none;',
      before: {
        contentText: '•  ',
        color: new vscode.ThemeColor('descriptionForeground'),
      },
    }),
    taskOpen: vscode.window.createTextEditorDecorationType({
      textDecoration: 'none; display: none;',
      before: {
        contentText: '☐  ',
        color: new vscode.ThemeColor('descriptionForeground'),
      },
    }),
    taskDone: vscode.window.createTextEditorDecorationType({
      textDecoration: 'none; display: none;',
      before: {
        contentText: '☑  ',
        color: new vscode.ThemeColor('descriptionForeground'),
      },
    }),
    codeBlock: vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('textCodeBlock.background'),
    }),
    mathInline: vscode.window.createTextEditorDecorationType({}),
    mathBlock: vscode.window.createTextEditorDecorationType({}),
    mermaidBlock: vscode.window.createTextEditorDecorationType({}),
  };
}

const tableCellTypeCache = new Map<string, vscode.TextEditorDecorationType>();

export function getOrCreateTableCellType(
  columns: number,
  isHeader: boolean,
): vscode.TextEditorDecorationType {
  const key = `${columns}-${isHeader ? 'h' : 'c'}`;
  const cached = tableCellTypeCache.get(key);
  if (cached) return cached;
  const pct = 100 / columns;
  const css =
    `none; display: inline-block; box-sizing: border-box; width: ${pct}%;` +
    ` border: 1px solid; padding: 2px 8px; vertical-align: top;` +
    ` overflow: hidden; white-space: nowrap; text-overflow: ellipsis;`;
  const options: vscode.DecorationRenderOptions = { textDecoration: css };
  if (isHeader) {
    options.fontWeight = 'bold';
    options.backgroundColor = new vscode.ThemeColor('editorWidget.background');
  }
  const type = vscode.window.createTextEditorDecorationType(options);
  tableCellTypeCache.set(key, type);
  return type;
}

export function disposeTableCellTypes(): void {
  for (const t of tableCellTypeCache.values()) t.dispose();
  tableCellTypeCache.clear();
}

function makeHeading(fontSize: string, color: string): vscode.TextEditorDecorationType {
  return vscode.window.createTextEditorDecorationType({
    textDecoration: `none; font-size: ${fontSize}; font-weight: bold; line-height: 2;`,
    color,
  });
}

export function disposeDecorationTypes(map: DecorationTypeMap): void {
  for (const key of Object.keys(map) as StaticDecorationKind[]) {
    map[key].dispose();
  }
}
