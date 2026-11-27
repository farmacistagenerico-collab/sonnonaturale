import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function luminance(hex) {
  const value = hex.slice(1).match(/../g).map(part => parseInt(part, 16) / 255);
  const linear = value.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

test('secondary UI copy meets WCAG AA contrast on the app light surfaces', () => {
  const tokens = Object.fromEntries([...css.matchAll(/--(text-[\w-]+):(#\w{6})/g)].map(([, name, value]) => [name, value]));
  assert.equal(tokens['text-muted-accessible'], '#55645a');
  assert.equal(tokens['text-positive-accessible'], '#285e4c');
  assert.equal(tokens['text-warning-accessible'], '#78542d');
  assert.equal(tokens['text-danger-accessible'], '#8a4e3b');
  for (const background of ['#ffffff', '#f7f7f2', '#eaf1eb', '#f1f4ee']) {
    assert.ok(contrast(tokens['text-muted-accessible'], background) >= 4.5, `muted text on ${background}`);
  }
  assert.ok(contrast(tokens['text-positive-accessible'], '#e9f2e9') >= 4.5);
  assert.ok(contrast(tokens['text-warning-accessible'], '#f7eee1') >= 4.5);
  assert.ok(contrast(tokens['text-danger-accessible'], '#fbefea') >= 4.5);
  assert.ok(css.includes('.sidebar-label') && css.includes('var(--text-muted-accessible)!important'));
  assert.ok(css.includes('.message-disclaimer') && css.includes('var(--text-muted-accessible)!important'));
});
