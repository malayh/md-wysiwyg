import * as vscode from 'vscode';
import type { Root } from 'mdast';
import { parseMarkdown } from './parser';
import {
  computeDecorations,
  type DecorationKind,
  type DecorationSpec,
} from './decorations';
import type { DecorationTypeMap } from './decorationTypes';

const EDIT_DEBOUNCE_MS = 80;
const CURSOR_DEBOUNCE_MS = 30;

export class WysiwygController {
  private disposables: vscode.Disposable[] = [];
  private editTimer: NodeJS.Timeout | undefined;
  private cursorTimer: NodeJS.Timeout | undefined;
  private lastVersion = -1;
  private cachedAst: Root | undefined;
  private disposed = false;

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
    const buckets = new Map<DecorationKind, vscode.DecorationOptions[]>();
    for (const kind of Object.keys(this.decorationTypes) as DecorationKind[]) {
      buckets.set(kind, []);
    }
    const doc = this.editor.document;
    const uriString = doc.uri.toString();
    for (const spec of specs) {
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
      buckets.get(spec.kind)!.push(options);
    }
    for (const [kind, options] of buckets) {
      this.editor.setDecorations(this.decorationTypes[kind], options);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.editTimer) clearTimeout(this.editTimer);
    if (this.cursorTimer) clearTimeout(this.cursorTimer);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    for (const kind of Object.keys(this.decorationTypes) as DecorationKind[]) {
      this.editor.setDecorations(this.decorationTypes[kind], []);
    }
  }
}
