import assert from 'node:assert/strict';
import test from 'node:test';

await import('../google-slides.js');

const GoogleSlides = globalThis.RecordWebGoogleSlides;

test('normalizes editable Google Slides URLs to presentation mode', () => {
  const parsed = GoogleSlides.parse('https://docs.google.com/presentation/d/deck-123/edit#slide=id.p');
  assert.equal(parsed?.pathname, '/presentation/d/deck-123/present');
  assert.equal(parsed?.hash, '#slide=id.p');
});

test('preserves published presentation URLs and distinguishes their deck keys', () => {
  const published = 'https://docs.google.com/presentation/d/e/published-123/pub?start=false';
  assert.equal(GoogleSlides.parse(published)?.href, published);
  assert.equal(GoogleSlides.deckKey(published), 'published:published-123');
  assert.equal(GoogleSlides.deckKey('https://docs.google.com/presentation/d/deck-123/view'), 'deck:deck-123');
});

test('rejects non-Slides and insecure URLs', () => {
  assert.equal(GoogleSlides.parse('https://example.com/presentation/d/deck-123/edit'), null);
  assert.equal(GoogleSlides.parse('http://docs.google.com/presentation/d/deck-123/edit'), null);
  assert.equal(GoogleSlides.parse('not a URL'), null);
});
