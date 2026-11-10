import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../functions/compte_rendu_VF4.pdf.js', import.meta.url), 'utf8');
const { onRequestGet } = await import('data:text/javascript,' + encodeURIComponent(source));

function setup({status = 200, range = null, enabled = undefined, dbPresent = true, reject = false} = {}) {
  const asset = new Response(status === 304 ? null : '%PDF-1.7 mock', {status, headers: {'content-type': 'application/pdf', 'etag': 'original'}});
  const seen = [];
  let queued;
  const env = {
    ASSETS: { fetch: async (req) => { seen.push({kind: 'asset', request: req}); return asset; } },
    DB: dbPresent ? {
      prepare: (sql) => {
        seen.push({kind: 'sql', sql});
        return {bind: (day) => ({run: async () => {
          seen.push({kind: 'write', day});
          if (reject) throw new Error('temporary D1 error');
        }})};
      }
    } : null,
  };
  if (enabled !== undefined) env.PDF_COUNTER_ENABLED = enabled;
  const headers = range ? {'Range': range} : {};
  const context = {
    request: new Request('https://preview.pages.dev/compte_rendu_VF4.pdf', {headers}),
    env,
    waitUntil: (p) => {queued = p;},
  };
  return {context, asset, seen, drain: async () => {if (queued) await queued;}};
}

test('default-safe: returns same PDF with original headers, no DB writes', async () => {
  const t = setup();
  const r = await onRequestGet(t.context);
  assert.strictEqual(r, t.asset);
  assert.equal(r.headers.get('etag'), 'original');
  assert.equal(t.seen.filter(x => x.kind === 'write').length, 0);
});

test('enabled: one normal GET counts once', async () => {
  const t = setup({enabled: 'true'});
  assert.strictEqual(await onRequestGet(t.context), t.asset);
  await t.drain();
  assert.equal(t.seen.filter(x => x.kind === 'write').length, 1);
  assert.match(t.seen.find(x => x.kind === 'sql').sql, /ON CONFLICT\(day\)/);
});

test('initial Range counts with 200 (Pages) or 206', async () => {
  for (const status of [200, 206]) {
    const t = setup({enabled: 'true', status, range: 'bytes=0-65535'});
    assert.strictEqual(await onRequestGet(t.context), t.asset);
    await t.drain();
    assert.equal(t.seen.filter(x => x.kind === 'write').length, 1);
  }
});

test('later ranges, malformed multi-ranges, missing flag and non-2xx do not count', async () => {
  for (const opts of [
    {enabled: 'true', range: 'bytes=65536-'},
    {enabled: 'true', range: 'bytes=0-2,4-8'},
    {enabled: 'false'},
    {enabled: 'true', status: 404},
    {enabled: 'true', status: 304},
    {enabled: 'true', dbPresent: false},
  ]) {
    const t = setup(opts);
    assert.strictEqual(await onRequestGet(t.context), t.asset);
    await t.drain();
    assert.equal(t.seen.filter(x => x.kind === 'write').length, 0);
  }
});

test('D1 write failure does not block or change the PDF response', async () => {
  const t = setup({enabled: 'true', reject: true});
  assert.strictEqual(await onRequestGet(t.context), t.asset);
  await t.drain();
});
