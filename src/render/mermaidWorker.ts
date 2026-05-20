import * as vscode from 'vscode';

interface IncomingMessage {
  type: 'rendered' | 'error' | 'ready';
  id?: string;
  svg?: string;
  error?: string;
}

interface PendingRequest {
  resolve: (svg: string) => void;
  reject: (err: Error) => void;
}

export class MermaidWorker {
  private panel: vscode.WebviewPanel | undefined;
  private pending = new Map<string, PendingRequest>();
  private ready = false;
  private queued: { id: string; source: string }[] = [];
  private nextId = 0;

  constructor(private extensionUri: vscode.Uri) {}

  request(source: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const id = String(this.nextId++);
      this.pending.set(id, { resolve, reject });
      this.ensurePanel();
      if (this.ready && this.panel) {
        this.panel.webview.postMessage({ type: 'render', id, source });
      } else {
        this.queued.push({ id, source });
      }
    });
  }

  dispose(): void {
    if (this.panel) this.panel.dispose();
    this.panel = undefined;
    this.ready = false;
    for (const p of this.pending.values()) p.reject(new Error('worker disposed'));
    this.pending.clear();
    this.queued = [];
  }

  private ensurePanel(): void {
    if (this.panel) return;
    const panel = vscode.window.createWebviewPanel(
      'mdWysiwygMermaid',
      'mdWysiwyg mermaid worker',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
      },
    );
    this.panel = panel;
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'mermaid.min.js'),
    );
    panel.webview.html = renderHtml(scriptUri, panel.webview.cspSource);
    panel.webview.onDidReceiveMessage((msg: IncomingMessage) => this.onMessage(msg));
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.ready = false;
      for (const p of this.pending.values()) p.reject(new Error('worker panel closed'));
      this.pending.clear();
      this.queued = [];
    });
  }

  private onMessage(msg: IncomingMessage): void {
    if (msg.type === 'ready') {
      this.ready = true;
      const queued = this.queued;
      this.queued = [];
      for (const { id, source } of queued) {
        this.panel?.webview.postMessage({ type: 'render', id, source });
      }
      return;
    }
    if (msg.type === 'rendered' && msg.id != null && msg.svg != null) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        pending.resolve(msg.svg);
        this.pending.delete(msg.id);
      }
      return;
    }
    if (msg.type === 'error' && msg.id != null) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        pending.reject(new Error(msg.error ?? 'mermaid render failed'));
        this.pending.delete(msg.id);
      }
    }
  }
}

function renderHtml(scriptUri: vscode.Uri, csp: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${csp} 'unsafe-inline'; style-src ${csp} 'unsafe-inline'; img-src ${csp} data:; font-src ${csp} data:;">
</head>
<body>
<div id="staging" style="position:absolute;left:-10000px;top:-10000px;width:1200px;"></div>
<script src="${scriptUri.toString()}"></script>
<script>
(function() {
  const vscode = acquireVsCodeApi();
  if (typeof mermaid === 'undefined') {
    vscode.postMessage({ type: 'error', id: '-1', error: 'mermaid global not loaded' });
    return;
  }
  mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' });
  window.addEventListener('message', async (e) => {
    const msg = e.data;
    if (!msg || msg.type !== 'render') return;
    try {
      const { svg } = await mermaid.render('m-' + msg.id, msg.source, document.getElementById('staging'));
      vscode.postMessage({ type: 'rendered', id: msg.id, svg });
    } catch (err) {
      vscode.postMessage({ type: 'error', id: msg.id, error: String((err && err.message) || err) });
    }
  });
  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}
