import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { materialPhoto, packMaterialMedia, unpackMaterialMedia } = require('../server/materialPhoto.js');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XcAAAAASUVORK5CYII=';

test('a photo can be saved, omitted without replacement, or explicitly removed', () => {
  assert.equal(materialPhoto(png), png);
  assert.equal(materialPhoto(undefined), undefined);
  assert.equal(materialPhoto(''), null);
  assert.equal(materialPhoto(null), null);
});

test('rejects non-images, unsupported formats, mismatched content, and malformed base64', () => {
  for (const value of [42, {}, 'https://example.com/image.jpg', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,aGVsbG8=', png.replace('image/png', 'image/jpeg'), png + '=']) {
    assert.throws(() => materialPhoto(value));
  }
});

test('rejects photos exceeding the server size limit', () => {
  assert.throws(() => materialPhoto('data:image/jpeg;base64,' + Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64')), /3 MB/);
});

test('stores a photo together with the documentation URL in the existing field', () => {
  const stored = packMaterialMedia('https://example.com/ficha.pdf', png);
  assert.deepEqual(unpackMaterialMedia(stored), { documentacionUrl: 'https://example.com/ficha.pdf', foto: png });
  assert.equal(packMaterialMedia(' https://example.com/ficha.pdf ', null), 'https://example.com/ficha.pdf');
  assert.deepEqual(unpackMaterialMedia('https://example.com/legacy.pdf'), { documentacionUrl: 'https://example.com/legacy.pdf', foto: null });
});
