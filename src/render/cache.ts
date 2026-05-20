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

export function clearRenderCache(): void {
  memCache.clear();
}

export function getMathSvg(source: string, display: boolean): MathRenderResult | undefined {
  if (!cacheDir) return undefined;
  const color = getThemeColor();
  const key = `math-${display ? 'b' : 'i'}-${colorTag(color)}-${hash(source)}`;
  const cached = memCache.get(key);
  if (cached) return cached;
  const filePath = path.join(cacheDir, key + '.svg');
  const rendered = renderMathToSvg(source, display);
  if (!rendered) return undefined;
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, wrapSvg(rendered.svg, color), 'utf8');
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

function getThemeColor(): string {
  const kind = vscode.window.activeColorTheme.kind;
  const isLight =
    kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
  return isLight ? '#1f1f1f' : '#d4d4d4';
}

function colorTag(color: string): string {
  return color.replace('#', '');
}

function wrapSvg(svg: string, color: string): string {
  const prelude = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const colorized = svg.replace(/currentColor/g, color);
  return prelude + colorized;
}
