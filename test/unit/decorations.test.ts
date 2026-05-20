import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../src/parser';
import { computeDecorations, type DecorationSpec } from '../../src/decorations';

function decorate(source: string, cursorOffset: number): DecorationSpec[] {
  const ast = parseMarkdown(source);
  return computeDecorations(ast, source, cursorOffset);
}

function slice(source: string, spec: DecorationSpec): string {
  return source.slice(spec.start, spec.end);
}

describe('computeDecorations — block-scope reveal', () => {
  it('emits no decorations when cursor is inside the only block', () => {
    const src = 'Hello **bold** world.';
    expect(decorate(src, 3)).toEqual([]);
  });

  it('decorates a block when cursor is in a different block', () => {
    const src = 'Para one with **bold**.\n\nPara two.';
    // Cursor in para two (offset 26 is inside "Para two.").
    const specs = decorate(src, 26);
    expect(specs.length).toBeGreaterThan(0);
    // Para one should be decorated; "Para two." should not.
    const boldSpec = specs.find((s) => s.kind === 'bold');
    expect(boldSpec).toBeDefined();
    expect(slice(src, boldSpec!)).toBe('bold');
  });
});

describe('computeDecorations — inline formatting', () => {
  it('hides ** markers around bold', () => {
    const src = 'a **b** c\n\nx';
    const specs = decorate(src, src.length); // cursor in second block
    const hidden = specs.filter((s) => s.kind === 'hidden');
    expect(hidden.map((s) => slice(src, s))).toEqual(['**', '**']);
    expect(specs.find((s) => s.kind === 'bold')).toMatchObject({
      kind: 'bold',
    });
  });

  it('hides * markers around italic', () => {
    const src = 'a *b* c\n\nx';
    const specs = decorate(src, src.length);
    const hidden = specs.filter((s) => s.kind === 'hidden');
    expect(hidden.map((s) => slice(src, s))).toEqual(['*', '*']);
    const italic = specs.find((s) => s.kind === 'italic');
    expect(italic).toBeDefined();
    expect(slice(src, italic!)).toBe('b');
  });

  it('hides ~~ markers around strikethrough', () => {
    const src = 'a ~~b~~ c\n\nx';
    const specs = decorate(src, src.length);
    const hidden = specs.filter((s) => s.kind === 'hidden');
    expect(hidden.map((s) => slice(src, s))).toEqual(['~~', '~~']);
    expect(specs.find((s) => s.kind === 'strike')).toBeDefined();
  });

  it('hides backticks around inline code', () => {
    const src = 'a `code` b\n\nx';
    const specs = decorate(src, src.length);
    const hidden = specs.filter((s) => s.kind === 'hidden');
    expect(hidden.map((s) => slice(src, s))).toEqual(['`', '`']);
    const code = specs.find((s) => s.kind === 'inlineCode');
    expect(code).toBeDefined();
    expect(slice(src, code!)).toBe('code');
  });

  it('hides link target and styles link text', () => {
    const src = '[hello](https://example.com)\n\nx';
    const specs = decorate(src, src.length);
    const link = specs.find((s) => s.kind === 'linkText');
    expect(link).toBeDefined();
    expect(slice(src, link!)).toBe('hello');
    const hidden = specs.filter((s) => s.kind === 'hidden');
    expect(hidden.map((s) => slice(src, s))).toEqual(['[', '](https://example.com)']);
  });
});

describe('computeDecorations — headings', () => {
  it('hides ## prefix and applies heading2 style', () => {
    const src = '## Title\n\nbody';
    const specs = decorate(src, src.length); // cursor in "body"
    const hidden = specs.find((s) => s.kind === 'hidden');
    expect(hidden).toBeDefined();
    expect(slice(src, hidden!)).toBe('## ');
    const heading = specs.find((s) => s.kind === 'heading2');
    expect(heading).toBeDefined();
    expect(slice(src, heading!)).toBe('Title');
  });

  it('emits heading1..heading6 based on depth', () => {
    for (let depth = 1; depth <= 6; depth++) {
      const src = `${'#'.repeat(depth)} Title\n\nbody`;
      const specs = decorate(src, src.length);
      expect(specs.some((s) => s.kind === `heading${depth}`)).toBe(true);
    }
  });
});

describe('computeDecorations — thematic break', () => {
  it('hides --- and emits hr decoration', () => {
    const src = 'para\n\n---\n\nx';
    const specs = decorate(src, src.length);
    const hr = specs.find((s) => s.kind === 'hr');
    expect(hr).toBeDefined();
    expect(slice(src, hr!)).toBe('---');
    const hidden = specs.find((s) => s.kind === 'hidden' && slice(src, s) === '---');
    expect(hidden).toBeDefined();
  });
});

describe('computeDecorations — lists', () => {
  it('emits a bullet decoration for each unordered item', () => {
    const src = '- one\n- two\n\nx';
    const specs = decorate(src, src.length);
    const bullets = specs.filter((s) => s.kind === 'bullet');
    expect(bullets.length).toBe(2);
    expect(slice(src, bullets[0]!)).toBe('- ');
    expect(slice(src, bullets[1]!)).toBe('- ');
  });

  it('emits no bullet for ordered items', () => {
    const src = '1. one\n2. two\n\nx';
    const specs = decorate(src, src.length);
    expect(specs.find((s) => s.kind === 'bullet')).toBeUndefined();
  });

  it('emits taskOpen with bracket offset for unchecked tasks', () => {
    const src = '- [ ] todo\n\nx';
    const specs = decorate(src, src.length);
    const task = specs.find((s) => s.kind === 'taskOpen');
    expect(task).toBeDefined();
    expect(slice(src, task!)).toBe('- [ ] ');
    expect(src[task!.taskBracketOffset!]).toBe('[');
    expect(src.slice(task!.taskBracketOffset!, task!.taskBracketOffset! + 3)).toBe('[ ]');
  });

  it('emits taskDone for completed tasks', () => {
    const src = '- [x] done\n\nx';
    const specs = decorate(src, src.length);
    const task = specs.find((s) => s.kind === 'taskDone');
    expect(task).toBeDefined();
    expect(slice(src, task!)).toBe('- [x] ');
  });

  it('still decorates inline formatting inside list items', () => {
    const src = '- has **bold** in it\n\nx';
    const specs = decorate(src, src.length);
    expect(specs.find((s) => s.kind === 'bold')).toBeDefined();
    expect(specs.find((s) => s.kind === 'bullet')).toBeDefined();
  });
});

describe('computeDecorations — code fences', () => {
  it('emits codeBlock for the whole fenced range and hides fence lines', () => {
    const src = '```ts\nfoo();\n```\n\nx';
    const specs = decorate(src, src.length);
    const block = specs.find((s) => s.kind === 'codeBlock');
    expect(block).toBeDefined();
    expect(slice(src, block!)).toBe('```ts\nfoo();\n```');
    const hidden = specs.filter((s) => s.kind === 'hidden').map((s) => slice(src, s));
    expect(hidden).toContain('```ts');
    expect(hidden).toContain('```');
  });

  it('skips mermaid fences (deferred to Phase 5)', () => {
    const src = '```mermaid\nflowchart\n```\n\nx';
    const specs = decorate(src, src.length);
    expect(specs.find((s) => s.kind === 'codeBlock')).toBeUndefined();
  });
});

describe('computeDecorations — tables', () => {
  it('emits per-cell decorations, hides alignment row, and tags column count', () => {
    const src =
      '| A | B |\n| --- | --- |\n| a1 | b1 |\n| a2 | b2 |\n| a3 | b3 |\n\nx';
    const specs = decorate(src, src.length);

    const headerCells = specs.filter((s) => s.kind === 'tableHeaderCell');
    expect(headerCells.length).toBe(2);
    expect(headerCells.map((s) => slice(src, s))).toEqual(['A', 'B']);
    expect(headerCells.every((s) => s.columns === 2)).toBe(true);

    const bodyCells = specs.filter((s) => s.kind === 'tableCell');
    expect(bodyCells.length).toBe(6);
    expect(bodyCells.every((s) => s.columns === 2)).toBe(true);

    const hiddenSlices = specs
      .filter((s) => s.kind === 'hidden')
      .map((s) => slice(src, s));
    expect(hiddenSlices).toContain('| --- | --- |');
  });

  it('reveals the whole table when cursor is inside any row', () => {
    const src = '| A | B |\n| --- | --- |\n| a1 | b1 |\n\npara';
    // Cursor inside body row "a1".
    const cursor = src.indexOf('a1') + 1;
    const specs = decorate(src, cursor);
    expect(specs.find((s) => s.kind === 'tableHeaderCell')).toBeUndefined();
    expect(specs.find((s) => s.kind === 'tableCell')).toBeUndefined();
  });

  it('still decorates inline formatting inside cells', () => {
    const src = '| A | B |\n| --- | --- |\n| **bold** | b1 |\n\nx';
    const specs = decorate(src, src.length);
    expect(specs.find((s) => s.kind === 'bold')).toBeDefined();
  });
});

describe('computeDecorations — math', () => {
  it('hides $...$ span and emits zero-width mathInline carrying the LaTeX', () => {
    const src = 'Inline $E = mc^2$ here.\n\nx';
    const specs = decorate(src, src.length); // cursor outside first block
    const hidden = specs.find((s) => s.kind === 'hidden' && slice(src, s) === '$E = mc^2$');
    expect(hidden).toBeDefined();
    const math = specs.find((s) => s.kind === 'mathInline');
    expect(math).toBeDefined();
    expect(math!.start).toBe(math!.end);
    expect(math!.mathSource).toBe('E = mc^2');
  });

  it('hides the $$...$$ block and emits zero-width mathBlock carrying the LaTeX', () => {
    const src = 'para\n\n$$\n\\int_0^1 x^2 dx\n$$\n\nx';
    const specs = decorate(src, src.length);
    const math = specs.find((s) => s.kind === 'mathBlock');
    expect(math).toBeDefined();
    expect(math!.start).toBe(math!.end);
    expect(math!.mathSource).toContain('\\int_0^1 x^2 dx');
    expect(specs.some((s) => s.kind === 'hidden' && slice(src, s).includes('\\int_0^1'))).toBe(true);
  });

  it('omits math decorations when cursor is inside the math block', () => {
    const src = 'para\n\n$$\n\\int x\n$$\n\ny';
    const cursor = src.indexOf('\\int');
    const specs = decorate(src, cursor);
    expect(specs.find((s) => s.kind === 'mathBlock')).toBeUndefined();
  });
});

describe('computeDecorations — blockquote', () => {
  it('hides leading > on each line and emits blockquoteBar', () => {
    const src = '> first line\n> second line\n\nx';
    const specs = decorate(src, src.length);
    const bar = specs.find((s) => s.kind === 'blockquoteBar');
    expect(bar).toBeDefined();
    const markers = specs
      .filter((s) => s.kind === 'blockquoteMarker')
      .map((s) => slice(src, s));
    expect(markers).toEqual(['> ', '> ']);
  });
});
