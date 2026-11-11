import assert from 'node:assert/strict';
import test from 'node:test';
import { createSkyArController } from './ar-session.js';
import { nextTrackerMode, trackerChrome } from './tracker-chrome.js';

test('AR toggle shows the sky view and restores the globe time bar on exit', async () => {
  const listeners = [];
  const controller = createSkyArController({
    addOrientationListener(handler) { listeners.push(handler); },
    removeOrientationListener(handler) {
      const index = listeners.indexOf(handler);
      if (index >= 0) listeners.splice(index, 1);
    },
  });

  let mode = 'globe';
  const toggle = () => {
    if (controller.isActive()) {
      controller.stop();
      mode = nextTrackerMode(mode);
      return;
    }
    mode = nextTrackerMode(mode);
    controller.start({
      orientationPermission: Promise.resolve('granted'),
      cameraPromise: Promise.resolve(null),
      onOrientation() {},
      onCamera() {},
    });
  };

  assert.deepEqual(trackerChrome(mode), {
    skyAr: false,
    timeBar: true,
    panels: true,
    orbitEnabled: true,
  });

  toggle();
  assert.equal(mode, 'sky-ar');
  assert.equal(trackerChrome(mode).skyAr, true);
  assert.equal(trackerChrome(mode).timeBar, false);
  assert.equal(trackerChrome(mode).panels, false);
  assert.equal(trackerChrome(mode).orbitEnabled, true);
  assert.equal(controller.isActive(), true);

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(listeners.length, 1);

  toggle();
  assert.equal(mode, 'globe');
  assert.equal(controller.isActive(), false);
  assert.equal(listeners.length, 0);
  assert.deepEqual(trackerChrome(mode), {
    skyAr: false,
    timeBar: true,
    panels: true,
    orbitEnabled: true,
  });
});
