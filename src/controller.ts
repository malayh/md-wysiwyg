import * as vscode from 'vscode';
import type { Root } from 'mdast';
import { parseMarkdown } from './parser';
import { computeDecorations, type DecorationSpec } from './decorations';
import {
  getOrCreateTableCellType,
  type DecorationTypeMap,
  type StaticDecorationKind,
} from './decorationTypes';
import { getMathSvg } from './render/cache';

const EDIT_DEBOUNCE_MS = 80;
const CURSOR_DEBOUNCE_MS = 30;

export class WysiwygController {
  private disposables: vscode.Disposable[] = [];
  private editTimer: NodeJS.Timeout | undefined;
  private cursorTimer: NodeJS.Timeout | undefined;
  private lastVersion = -1;
  private cachedAst: Root | undefined;
  private disposed = false;
  private lastUsedTypes = new Set<vscode.TextEditorDecorationType>();

  constructor(
    private editor: vscode.TextEditor,
    private decorationTypes: DecorationTypeMap,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document !== this.editor.document) return;
        this.scheduleEdit();
      }),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor !== this.editor) return;
        this.scheduleCursor();
      }),
    );
    this.update();
  }

  isFor(editor: vscode.TextEditor): boolean {
    return this.editor === editor;
  }

  private scheduleEdit(): void {
    if (this.editTimer) clearTimeout(this.editTimer);
    this.editTimer = setTimeout(() => this.update(), EDIT_DEBOUNCE_MS);
  }

  private scheduleCursor(): void {
    if (this.cursorTimer) clearTimeout(this.cursorTimer);
    this.cursorTimer = setTimeout(() => this.update(), CURSOR_DEBOUNCE_MS);
  }

  private update(): void {
    if (this.disposed) return;
    const doc = this.editor.document;
    const source = doc.getText();
    if (doc.version !== this.lastVersion || !this.cachedAst) {
      this.cachedAst = parseMarkdown(source);
      this.lastVersion = doc.version;
    }
    const cursorOffset = doc.offsetAt(this.editor.selection.active);
    const specs = computeDecorations(this.cachedAst, source, cursorOffset);
    this.applyDecorations(specs);
  }

  private applyDecorations(specs: DecorationSpec[]): void {
    const groups = new Map<vscode.TextEditorDecorationType, vscode.DecorationOptions[]>();
    const doc = this.editor.document;
    const uriString = doc.uri.toString();

    for (const spec of specs) {
      const type = this.resolveDecorationType(spec);
      if (!type) continue;
      const range = new vscode.Range(doc.positionAt(spec.start), doc.positionAt(spec.end));
      const options: vscode.DecorationOptions = { range };
      if (spec.taskBracketOffset != null) {
        const args = encodeURIComponent(
          JSON.stringify({ uri: uriString, offset: spec.taskBracketOffset }),
        );
        const md = new vscode.MarkdownString(
          `[Toggle task](command:mdWysiwyg.toggleTask?${args})`,
        );
        md.isTrusted = true;
        options.hoverMessage = md;
      }
      if (spec.mathSource != null && (spec.kind === 'mathInline' || spec.kind === 'mathBlock')) {
        const isBlock = spec.kind === 'mathBlock';
        const rendered = getMathSvg(spec.mathSource, isBlock);
        if (rendered) {
          options.renderOptions = {
            after: {
              contentIconPath: rendered.uri,
              width: rendered.width,
              height: rendered.height,
              margin: isBlock ? '0 0 0 0' : '0 0 0 0.15em',
            },
          };
        }
        const fence = isBlock ? '$$' : '$';
        options.hoverMessage = new vscode.MarkdownString(
          '```latex\n' + fence + spec.mathSource + fence + '\n```',
        );
      }
      let bucket = groups.get(type);
      if (!bucket) {
        bucket = [];
        groups.set(type, bucket);
      }
      bucket.push(options);
    }

    const usedNow = new Set<vscode.TextEditorDecorationType>();
    for (const [type, options] of groups) {
      this.editor.setDecorations(type, options);
      usedNow.add(type);
    }
    for (const type of this.lastUsedTypes) {
      if (!usedNow.has(type)) this.editor.setDecorations(type, []);
    }
    for (const kind of Object.keys(this.decorationTypes) as StaticDecorationKind[]) {
      const type = this.decorationTypes[kind];
      if (!usedNow.has(type)) this.editor.setDecorations(type, []);
    }
    this.lastUsedTypes = usedNow;
  }

  private resolveDecorationType(spec: DecorationSpec): vscode.TextEditorDecorationType | undefined {
    if (spec.kind === 'tableCell' || spec.kind === 'tableHeaderCell') {
      const cols = spec.columns ?? 1;
      return getOrCreateTableCellType(cols, spec.kind === 'tableHeaderCell');
    }
    return this.decorationTypes[spec.kind];
  }

  dispose(): void {
    this.disposed = true;
    if (this.editTimer) clearTimeout(this.editTimer);
    if (this.cursorTimer) clearTimeout(this.cursorTimer);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    for (const kind of Object.keys(this.decorationTypes) as StaticDecorationKind[]) {
      this.editor.setDecorations(this.decorationTypes[kind], []);
    }
    for (const type of this.lastUsedTypes) {
      this.editor.setDecorations(type, []);
    }
    this.lastUsedTypes.clear();
  }
}
