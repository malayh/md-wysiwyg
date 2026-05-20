import type {
  Root,
  RootContent,
  PhrasingContent,
  Heading,
  Blockquote,
  ThematicBreak,
  List,
  ListItem,
  Code,
  Table,
  TableRow,
} from 'mdast';
import type { InlineMath, Math as MathBlock } from 'mdast-util-math';

export type DecorationKind =
  | 'hidden'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inlineCode'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'linkText'
  | 'hr'
  | 'blockquoteBar'
  | 'blockquoteMarker'
  | 'bullet'
  | 'taskOpen'
  | 'taskDone'
  | 'codeBlock'
  | 'tableCell'
  | 'tableHeaderCell'
  | 'mathInline'
  | 'mathBlock';

export interface DecorationSpec {
  kind: DecorationKind;
  start: number;
  end: number;
  /** For task list decorations: offset of `[` so the controller can build a toggle hover. */
  taskBracketOffset?: number;
  /** For table cells: number of columns in the row, so the controller can pick a width-sized decoration type. */
  columns?: number;
  /** For math decorations: raw LaTeX source so the controller can render to SVG. */
  mathSource?: string;
}

export function computeDecorations(
  ast: Root,
  source: string,
  cursorOffset: number,
): DecorationSpec[] {
  const out: DecorationSpec[] = [];
  const revealed = findCursorBlock(ast, cursorOffset);
  for (const block of ast.children) {
    if (block === revealed) continue;
    decorateBlock(block, source, out);
  }
  return out;
}

function findCursorBlock(ast: Root, offset: number): RootContent | undefined {
  for (const block of ast.children) {
    const pos = block.position;
    if (!pos || pos.start.offset == null || pos.end.offset == null) continue;
    if (offset >= pos.start.offset && offset <= pos.end.offset) return block;
  }
  return undefined;
}

function decorateBlock(node: RootContent, source: string, out: DecorationSpec[]): void {
  switch (node.type) {
    case 'heading':
      decorateHeading(node, source, out);
      break;
    case 'paragraph':
      decoratePhrasing(node.children, source, out);
      break;
    case 'thematicBreak':
      decorateHr(node, out);
      break;
    case 'blockquote':
      decorateBlockquote(node, source, out);
      break;
    case 'list':
      decorateList(node, source, out);
      break;
    case 'code':
      decorateCode(node, source, out);
      break;
    case 'table':
      decorateTable(node, source, out);
      break;
    case 'math':
      decorateMathBlock(node, out);
      break;
    default:
      break;
  }
}

function decorateHeading(node: Heading, source: string, out: DecorationSpec[]): void {
  const pos = node.position;
  if (!pos || pos.start.offset == null || pos.end.offset == null) return;
  const start = pos.start.offset;
  const end = pos.end.offset;

  const firstChild = node.children[0];
  const contentStart = firstChild?.position?.start.offset ?? start + node.depth + 1;

  if (contentStart > start) {
    out.push({ kind: 'hidden', start, end: contentStart });
  }
  out.push({ kind: `heading${node.depth}` as DecorationKind, start: contentStart, end });

  decoratePhrasing(node.children, source, out);
}

function decoratePhrasing(
  children: PhrasingContent[],
  source: string,
  out: DecorationSpec[],
): void {
  for (const child of children) {
    const pos = child.position;
    if (!pos || pos.start.offset == null || pos.end.offset == null) continue;
    const start = pos.start.offset;
    const end = pos.end.offset;

    switch (child.type) {
      case 'strong': {
        const inner = innerRange(child);
        if (inner) {
          out.push({ kind: 'hidden', start, end: inner.start });
          out.push({ kind: 'bold', start: inner.start, end: inner.end });
          out.push({ kind: 'hidden', start: inner.end, end });
          decoratePhrasing(child.children, source, out);
        }
        break;
      }
      case 'emphasis': {
        const inner = innerRange(child);
        if (inner) {
          out.push({ kind: 'hidden', start, end: inner.start });
          out.push({ kind: 'italic', start: inner.start, end: inner.end });
          out.push({ kind: 'hidden', start: inner.end, end });
          decoratePhrasing(child.children, source, out);
        }
        break;
      }
      case 'delete': {
        const inner = innerRange(child);
        if (inner) {
          out.push({ kind: 'hidden', start, end: inner.start });
          out.push({ kind: 'strike', start: inner.start, end: inner.end });
          out.push({ kind: 'hidden', start: inner.end, end });
          decoratePhrasing(child.children, source, out);
        }
        break;
      }
      case 'inlineCode': {
        let mark = 0;
        while (source[start + mark] === '`') mark++;
        if (mark === 0) mark = 1;
        out.push({ kind: 'hidden', start, end: start + mark });
        out.push({ kind: 'inlineCode', start: start + mark, end: end - mark });
        out.push({ kind: 'hidden', start: end - mark, end });
        break;
      }
      case 'link': {
        const inner = innerRange(child);
        if (inner) {
          out.push({ kind: 'hidden', start, end: inner.start });
          out.push({ kind: 'linkText', start: inner.start, end: inner.end });
          out.push({ kind: 'hidden', start: inner.end, end });
          decoratePhrasing(child.children as PhrasingContent[], source, out);
        }
        break;
      }
      case 'inlineMath': {
        out.push({ kind: 'hidden', start, end });
        out.push({
          kind: 'mathInline',
          start: end,
          end,
          mathSource: (child as InlineMath).value,
        });
        break;
      }
      default:
        break;
    }
  }
}

function innerRange(node: {
  children: PhrasingContent[];
}): { start: number; end: number } | undefined {
  const first = node.children[0]?.position;
  const last = node.children[node.children.length - 1]?.position;
  if (!first || !last || first.start.offset == null || last.end.offset == null) return undefined;
  return { start: first.start.offset, end: last.end.offset };
}

function decorateHr(node: ThematicBreak, out: DecorationSpec[]): void {
  const pos = node.position;
  if (!pos || pos.start.offset == null || pos.end.offset == null) return;
  out.push({ kind: 'hidden', start: pos.start.offset, end: pos.end.offset });
  out.push({ kind: 'hr', start: pos.start.offset, end: pos.end.offset });
}

function decorateBlockquote(node: Blockquote, source: string, out: DecorationSpec[]): void {
  const pos = node.position;
  if (!pos || pos.start.offset == null || pos.end.offset == null) return;
  const start = pos.start.offset;
  const end = pos.end.offset;

  out.push({ kind: 'blockquoteBar', start, end });

  let i = start;
  while (i < end) {
    if (i === start || source[i - 1] === '\n') {
      let j = i;
      while (j < end && (source[j] === ' ' || source[j] === '\t')) j++;
      if (source[j] === '>') {
        j++;
        if (source[j] === ' ') j++;
        out.push({ kind: 'blockquoteMarker', start: i, end: j });
        i = j;
        continue;
      }
    }
    i++;
  }

  for (const child of node.children) {
    decorateBlock(child as RootContent, source, out);
  }
}

function decorateList(node: List, source: string, out: DecorationSpec[]): void {
  const isOrdered = node.ordered === true;
  for (const item of node.children) {
    decorateListItem(item, isOrdered, source, out);
  }
}

function decorateListItem(
  item: ListItem,
  isOrdered: boolean,
  source: string,
  out: DecorationSpec[],
): void {
  const pos = item.position;
  if (!pos || pos.start.offset == null) return;
  const itemStart = pos.start.offset;

  let i = itemStart;
  while (i < source.length && (source[i] === ' ' || source[i] === '\t')) i++;
  const markerStart = i;

  if (isOrdered) {
    while (i < source.length && source[i]! >= '0' && source[i]! <= '9') i++;
    if (source[i] === '.' || source[i] === ')') i++;
  } else if (source[i] === '-' || source[i] === '*' || source[i] === '+') {
    i++;
  } else {
    return;
  }
  if (source[i] === ' ') i++;

  const bracketOffset = i;
  const isTask =
    source[i] === '[' &&
    (source[i + 1] === ' ' || source[i + 1]?.toLowerCase() === 'x') &&
    source[i + 2] === ']' &&
    source[i + 3] === ' ';

  if (isTask) {
    const isDone = source[bracketOffset + 1]?.toLowerCase() === 'x';
    out.push({
      kind: isDone ? 'taskDone' : 'taskOpen',
      start: markerStart,
      end: i + 4,
      taskBracketOffset: bracketOffset,
    });
  } else if (!isOrdered) {
    out.push({ kind: 'bullet', start: markerStart, end: i });
  }

  for (const child of item.children) {
    decorateBlock(child as RootContent, source, out);
  }
}

function decorateTable(node: Table, source: string, out: DecorationSpec[]): void {
  const pos = node.position;
  if (!pos || pos.start.offset == null || pos.end.offset == null) return;
  const rows = node.children;
  if (rows.length === 0) return;

  const columns = rows[0]!.children.length || 1;

  for (let r = 0; r < rows.length; r++) {
    const cellKind: DecorationKind = r === 0 ? 'tableHeaderCell' : 'tableCell';
    decorateRowCells(rows[r]!, cellKind, columns, source, out);
  }

  if (rows.length >= 2) {
    const headerEnd = rows[0]!.position?.end.offset;
    const firstBodyStart = rows[1]!.position?.start.offset;
    if (headerEnd != null && firstBodyStart != null) {
      let alignStart = headerEnd;
      while (alignStart < firstBodyStart && source[alignStart] === '\n') alignStart++;
      let alignEnd = firstBodyStart;
      while (alignEnd > alignStart && source[alignEnd - 1] === '\n') alignEnd--;
      if (alignEnd > alignStart) {
        out.push({ kind: 'hidden', start: alignStart, end: alignEnd });
      }
    }
  } else {
    const headerEnd = rows[0]!.position?.end.offset;
    if (headerEnd != null) {
      let alignStart = headerEnd;
      while (alignStart < pos.end.offset && source[alignStart] === '\n') alignStart++;
      const nl = source.indexOf('\n', alignStart);
      const alignEnd = nl === -1 ? pos.end.offset : nl;
      if (alignEnd > alignStart) {
        out.push({ kind: 'hidden', start: alignStart, end: alignEnd });
      }
    }
  }
}

function decorateRowCells(
  row: TableRow,
  cellKind: DecorationKind,
  columns: number,
  source: string,
  out: DecorationSpec[],
): void {
  const rowPos = row.position;
  if (!rowPos || rowPos.start.offset == null || rowPos.end.offset == null) return;
  const rowStart = rowPos.start.offset;
  const rowEnd = rowPos.end.offset;

  const pipePositions: number[] = [];
  for (let i = rowStart; i < rowEnd; i++) {
    if (source[i] === '|' && source[i - 1] !== '\\') pipePositions.push(i);
  }

  const boundaries = [rowStart - 1, ...pipePositions, rowEnd];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const segStart = boundaries[i]! + 1;
    const segEnd = boundaries[i + 1]!;
    if (segEnd <= segStart) continue;

    let contentStart = segStart;
    let contentEnd = segEnd;
    while (contentStart < contentEnd && isHSpace(source[contentStart]!)) contentStart++;
    while (contentEnd > contentStart && isHSpace(source[contentEnd - 1]!)) contentEnd--;

    if (contentStart > segStart) {
      out.push({ kind: 'hidden', start: segStart, end: contentStart });
    }
    if (contentEnd > contentStart) {
      out.push({ kind: cellKind, start: contentStart, end: contentEnd, columns });
    }
    if (segEnd > contentEnd) {
      out.push({ kind: 'hidden', start: contentEnd, end: segEnd });
    }
  }

  for (const p of pipePositions) {
    out.push({ kind: 'hidden', start: p, end: p + 1 });
  }

  for (const cell of row.children) {
    decoratePhrasing(cell.children, source, out);
  }
}

function isHSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t';
}

function decorateMathBlock(node: MathBlock, out: DecorationSpec[]): void {
  const pos = node.position;
  if (!pos || pos.start.offset == null || pos.end.offset == null) return;
  out.push({ kind: 'hidden', start: pos.start.offset, end: pos.end.offset });
  out.push({
    kind: 'mathBlock',
    start: pos.end.offset,
    end: pos.end.offset,
    mathSource: node.value,
  });
}

function decorateCode(node: Code, source: string, out: DecorationSpec[]): void {
  const pos = node.position;
  if (!pos || pos.start.offset == null || pos.end.offset == null) return;
  if (node.lang === 'mermaid') return; // Phase 5

  const start = pos.start.offset;
  const end = pos.end.offset;

  out.push({ kind: 'codeBlock', start, end });

  const isFenced = source[start] === '`' || source[start] === '~';
  if (!isFenced) return;

  const openNl = source.indexOf('\n', start);
  if (openNl !== -1 && openNl < end) {
    out.push({ kind: 'hidden', start, end: openNl });
  }
  const closeNl = source.lastIndexOf('\n', end - 1);
  if (closeNl !== -1 && closeNl > start) {
    out.push({ kind: 'hidden', start: closeNl + 1, end });
  }
}
