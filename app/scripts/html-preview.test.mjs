import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const load = async (path) => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};

const { isHtmlExtension, resolveLocalReference, rewriteCssUrls } = await load('../src/utils/htmlPreview.ts');

test('html files are recognised by extension', () => {
  assert.equal(isHtmlExtension('html'), true);
  assert.equal(isHtmlExtension('HTM'), true);
  assert.equal(isHtmlExtension('md'), false);
  assert.equal(isHtmlExtension(null), false);
});

test('relative references resolve next to the page, on either path style', () => {
  assert.equal(resolveLocalReference('style.css', 'C:\\site\\index.html'), 'C:\\site\\style.css');
  assert.equal(resolveLocalReference('./img/a%20b.png?v=2#x', 'C:\\site\\index.html'), 'C:\\site\\img\\a b.png');
  assert.equal(resolveLocalReference('../shared/app.js', '/home/me/site/index.html'), '/home/me/shared/app.js');
  assert.equal(resolveLocalReference('../../../../../x.js', '/a/b/index.html'), '/x.js');
});

test('references that are not files beside the page are left alone', () => {
  for (const ref of ['https://cdn.test/x.js', '//cdn.test/x.js', 'data:image/png;base64,AA', '#top', '/root.css', 'mailto:a@b.c', '', '?q=1']) {
    assert.equal(resolveLocalReference(ref, 'C:\\site\\index.html'), null, ref);
  }
});

test('css url() references are rewritten, others kept', () => {
  const to = (p) => `local:${p}`;
  const css = "a{background:url('bg.png')} b{background:url( https://x.test/y.png )} c{background:url(data:image/gif;base64,AA)} d{src:url(\"f/font.woff2\")}";
  assert.equal(
    rewriteCssUrls(css, '/s/index.html', to),
    "a{background:url('local:/s/bg.png')} b{background:url( https://x.test/y.png )} c{background:url(data:image/gif;base64,AA)} d{src:url(\"local:/s/f/font.woff2\")}",
  );
});
