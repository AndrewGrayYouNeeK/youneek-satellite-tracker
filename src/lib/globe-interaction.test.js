import assert from 'node:assert/strict';
import test from 'node:test';
import { applyGlobeInteraction } from './globe-interaction.js';

test('device orientation does not lock orbit controls in the normal globe view', () => {
  const controls = { enabled: false, enablePan: false, autoRotate: true };
  const desktopEvent = { absolute: false, alpha: 0, beta: 0, gamma: 0 };
  const phoneEvent = { absolute: true, alpha: 184, beta: 62, gamma: -4, webkitCompassHeading: 210 };

  applyGlobeInteraction(controls, desktopEvent);
  assert.equal(controls.enabled, true);
  assert.equal(controls.autoRotate, true);

  applyGlobeInteraction(controls, phoneEvent);
  assert.equal(controls.enabled, true);
  assert.equal(phoneEvent.alpha, 184);
});
