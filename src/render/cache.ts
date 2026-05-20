import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { renderMathToSvg } from './math';

export interface MathRenderResult {
  uri: vscode.Uri;
  width: string;
  height: string;
}

let cacheDir: string | undefined;
const memCache = new Map<string, MathRenderResult>();

export function initRenderCache(storageUri: vscode.Uri): void {
  cacheDir = path.join(storageUri.fsPath, 'render-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
}

export function getMathSvg(source: string, display: boolean): MathRenderResult | undefined {
  if (!cacheDir) return undefined;
  const key = `math-${display ? 'b' : 'i'}-${hash(source)}`;
  const cached = memCache.get(key);
  if (cached) return cached;
  const filePath = path.join(cacheDir, key + '.svg');
  const rendered = renderMathToSvg(source, display);
  if (!rendered) return undefined;
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, wrapSvg(rendered.svg), 'utf8');
  }
  const result: MathRenderResult = {
    uri: vscode.Uri.file(filePath),
    width: rendered.width,
    height: rendered.height,
  };
  memCache.set(key, result);
  return result;
}

function hash(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

function wrapSvg(svg: string): string {
  const prelude = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const withAttrs = svg.replace(
    /<svg /,
    '<svg xmlns="http://www.w3.org/2000/svg" style="color: currentColor;" ',
  );
  return prelude + withAttrs;
}
