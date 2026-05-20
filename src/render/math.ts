import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import type { LiteElement } from 'mathjax-full/js/adaptors/lite/Element.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({ packages: AllPackages });
const svgOutput = new SVG({ fontCache: 'local' });
const doc = mathjax.document('', { InputJax: tex, OutputJax: svgOutput });

export interface RenderedMath {
  svg: string;
  width: string;
  height: string;
}

export function renderMathToSvg(source: string, display: boolean): RenderedMath | undefined {
  const container = doc.convert(source, { display, em: 16, ex: 8, containerWidth: 1280 });
  const svgNode = adaptor.firstChild(container) as LiteElement | undefined;
  if (!svgNode) return undefined;
  const svg = adaptor.outerHTML(svgNode);
  const width = /width="([^"]+)"/.exec(svg)?.[1] ?? '1em';
  const height = /height="([^"]+)"/.exec(svg)?.[1] ?? '1em';
  return { svg, width, height };
}
