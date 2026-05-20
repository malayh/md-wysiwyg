import * as vscode from 'vscode';
import { WysiwygController } from './controller';
import {
  createDecorationTypes,
  disposeDecorationTypes,
  type DecorationTypeMap,
} from './decorationTypes';

let decorationTypes: DecorationTypeMap | undefined;
const controllers = new Map<string, WysiwygController>();

function editorKey(editor: vscode.TextEditor): string {
  return `${editor.document.uri.toString()}#${editor.viewColumn ?? 0}`;
}

export function activate(context: vscode.ExtensionContext): void {
  decorationTypes = createDecorationTypes();
  context.subscriptions.push({
    dispose: () => {
      if (decorationTypes) disposeDecorationTypes(decorationTypes);
      decorationTypes = undefined;
    },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('mdWysiwyg.enable', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('MD WYSIWYG: no active editor');
        return;
      }
      if (editor.document.languageId !== 'markdown') {
        vscode.window.showWarningMessage('MD WYSIWYG: active editor is not a markdown file');
        return;
      }
      const key = editorKey(editor);
      if (controllers.has(key)) {
        vscode.window.showInformationMessage('MD WYSIWYG: already enabled for this editor');
        return;
      }
      const controller = new WysiwygController(editor, decorationTypes!);
      controllers.set(key, controller);
      vscode.window.showInformationMessage(
        `MD WYSIWYG: enabled for ${editor.document.fileName}`,
      );
    }),
    vscode.commands.registerCommand(
      'mdWysiwyg.toggleTask',
      async (args: { uri: string; offset: number }) => {
        if (!args || typeof args.uri !== 'string' || typeof args.offset !== 'number') return;
        const uri = vscode.Uri.parse(args.uri);
        const doc = await vscode.workspace.openTextDocument(uri);
        const text = doc.getText();
        if (text[args.offset] !== '[' || text[args.offset + 2] !== ']') return;
        const inside = text[args.offset + 1];
        let replacement: string;
        if (inside === ' ') replacement = '[x]';
        else if (inside === 'x' || inside === 'X') replacement = '[ ]';
        else return;
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          uri,
          new vscode.Range(doc.positionAt(args.offset), doc.positionAt(args.offset + 3)),
          replacement,
        );
        await vscode.workspace.applyEdit(edit);
      },
    ),
    vscode.commands.registerCommand('mdWysiwyg.disable', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const key = editorKey(editor);
      const controller = controllers.get(key);
      if (!controller) {
        vscode.window.showInformationMessage('MD WYSIWYG: not enabled for this editor');
        return;
      }
      controller.dispose();
      controllers.delete(key);
      vscode.window.showInformationMessage(
        `MD WYSIWYG: disabled for ${editor.document.fileName}`,
      );
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      const visible = new Set(vscode.window.visibleTextEditors.map(editorKey));
      for (const [key, controller] of controllers) {
        if (!visible.has(key)) {
          controller.dispose();
          controllers.delete(key);
        }
      }
    }),
  );
}

export function deactivate(): void {
  for (const c of controllers.values()) c.dispose();
  controllers.clear();
}
