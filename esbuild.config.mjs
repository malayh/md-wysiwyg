import esbuild from 'esbuild';
import { readFileSync } from 'fs';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const mathjaxVersion = JSON.parse(
  readFileSync('node_modules/mathjax-full/package.json', 'utf8'),
).version;

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode'],
  outfile: 'dist/extension.js',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
  define: {
    PACKAGE_VERSION: JSON.stringify(mathjaxVersion),
  },
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
