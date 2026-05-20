import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
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
      vscode.window.showInformationMessage(
        `MD WYSIWYG: enabled for ${editor.document.fileName}`,
      );
    }),
    vscode.commands.registerCommand('mdWysiwyg.disable', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      vscode.window.showInformationMessage(
        `MD WYSIWYG: disabled for ${editor.document.fileName}`,
      );
    }),
  );
}

export function deactivate(): void {}
