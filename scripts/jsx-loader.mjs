import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';

const srcDir = fileURLToPath(new URL('../src/', import.meta.url));

function fileUrlIfExists(candidate) {
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
  return pathToFileURL(candidate).href;
}

function resolveAlias(specifier) {
  if (!specifier.startsWith('@/')) return null;
  const base = path.join(srcDir, specifier.slice(2));
  return fileUrlIfExists(base)
    || fileUrlIfExists(`${base}.js`)
    || fileUrlIfExists(`${base}.jsx`)
    || fileUrlIfExists(path.join(base, 'index.js'))
    || fileUrlIfExists(path.join(base, 'index.jsx'));
}

export async function resolve(specifier, context, nextResolve) {
  const aliased = resolveAlias(specifier);
  if (aliased) return { url: aliased, shortCircuit: true };
  if (specifier.endsWith('.jsx') && context.parentURL) {
    return { url: new URL(specifier, context.parentURL).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.split('?')[0].endsWith('.jsx')) return nextLoad(url, context);
  const source = await readFile(new URL(url), 'utf8');
  const transformed = transformSync(source, {
    loader: 'jsx',
    format: 'esm',
    jsx: 'automatic',
    sourcefile: url,
  });
  return {
    format: 'module',
    source: transformed.code,
    shortCircuit: true,
  };
}
