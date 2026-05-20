import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { MermaidWorker } from './mermaidWorker';

export interface MermaidRenderResult {
  uri: vscode.Uri;
  width: string;
  height: string;
}

let cacheDir: string | undefined;
let worker: MermaidWorker | undefined;
const memCache = new Map<string, MermaidRenderResult>();
const dimCache = new Map<string, { width: string; height: string }>();
const inFlight = new Map<string, Promise<MermaidRenderResult>>();

export function initMermaid(extensionUri: vscode.Uri, storageUri: vscode.Uri): void {
  cacheDir = path.join(storageUri.fsPath, 'mermaid-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  worker = new MermaidWorker(extensionUri);
}

export function disposeMermaid(): void {
  if (worker) worker.dispose();
  worker = undefined;
  memCache.clear();
  dimCache.clear();
  inFlight.clear();
}

export function getMermaidSvg(source: string): MermaidRenderResult | undefined {
  if (!cacheDir) return undefined;
  const key = hash(source);
  const cached = memCache.get(key);
  if (cached) return cached;
  const filePath = path.join(cacheDir, key + '.svg');
  const dimsPath = path.join(cacheDir, key + '.dims');
  if (fs.existsSync(filePath) && fs.existsSync(dimsPath)) {
    const dims = readDims(dimsPath);
    const result: MermaidRenderResult = { uri: vscode.Uri.file(filePath), ...dims };
    memCache.set(key, result);
    return result;
  }
  return undefined;
}

export function requestMermaidSvg(source: string): Promise<MermaidRenderResult> {
  const cached = getMermaidSvg(source);
  if (cached) return Promise.resolve(cached);
  const key = hash(source);
  const existing = inFlight.get(key);
  if (existing) return existing;
  if (!worker || !cacheDir) return Promise.reject(new Error('mermaid worker not initialized'));
  const filePath = path.join(cacheDir, key + '.svg');
  const dimsPath = path.join(cacheDir, key + '.dims');
  const dir = cacheDir;
  const p = worker
    .request(source)
    .then((svg) => {
      const dims = parseSvgDimensions(svg);
      fs.writeFileSync(filePath, svg, 'utf8');
      fs.writeFileSync(dimsPath, `${dims.width}\n${dims.height}\n`, 'utf8');
      const result: MermaidRenderResult = { uri: vscode.Uri.file(filePath), ...dims };
      memCache.set(key, result);
      inFlight.delete(key);
      return result;
    })
    .catch((err) => {
      inFlight.delete(key);
      // Cache nothing on error so a future retry will re-render.
      throw err;
    });
  // Reference dir so noUnusedLocals doesn't complain on noop branches.
  void dir;
  inFlight.set(key, p);
  return p;
}

function hash(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

function readDims(p: string): { width: string; height: string } {
  const cached = dimCache.get(p);
  if (cached) return cached;
  const [width = '400px', height = '300px'] = fs.readFileSync(p, 'utf8').split('\n');
  const dims = { width, height };
  dimCache.set(p, dims);
  return dims;
}

function parseSvgDimensions(svg: string): { width: string; height: string } {
  const widthMatch = /<svg[^>]*\swidth="([^"]+)"/.exec(svg);
  const heightMatch = /<svg[^>]*\sheight="([^"]+)"/.exec(svg);
  let width = widthMatch?.[1] ?? '400px';
  let height = heightMatch?.[1] ?? '300px';
  // Mermaid often emits "100%" width — pin it to a sensible default so the
  // after-decoration has finite dimensions.
  if (width.endsWith('%')) width = '600px';
  if (height.endsWith('%')) height = '400px';
  if (/^\d+(\.\d+)?$/.test(width)) width += 'px';
  if (/^\d+(\.\d+)?$/.test(height)) height += 'px';
  return { width, height };
}
