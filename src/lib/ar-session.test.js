import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSkyArController,
  readOrientationPermission,
  requestEnvironmentCamera,
  sampleFromOrientationEvent,
} from './ar-session.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function controllerWith(listeners = []) {
  return createSkyArController({
    addOrientationListener(handler) { listeners.push(handler); },
    removeOrientationListener(handler) {
      const index = listeners.indexOf(handler);
      if (index >= 0) listeners.splice(index, 1);
    },
  });
}

test('relative desktop orientation is ignored and compass headings are kept', () => {
  assert.equal(sampleFromOrientationEvent(null), null);
  assert.equal(sampleFromOrientationEvent({ absolute: false, alpha: 12, beta: 40, gamma: 0 }), null);
  assert.equal(sampleFromOrientationEvent({ absolute: true, alpha: null, beta: 40 }), null);
  const compass = sampleFromOrientationEvent({
    absolute: false,
    alpha: 3,
    beta: 80,
    gamma: 1,
    webkitCompassHeading: 275,
  });
  assert.equal(compass.heading, 275);
  assert.equal(compass.tilt, 10);
  const absolute = sampleFromOrientationEvent({ absolute: true, alpha: 400, beta: 45, gamma: 2 });
  assert.equal(absolute.heading, 40);
  assert.equal(absolute.tilt, 45);
});

test('orientation permission stays on the user gesture and maps denials', async () => {
  assert.equal(await readOrientationPermission(undefined), 'granted');
  assert.equal(await readOrientationPermission({}), 'granted');

  let calls = 0;
  const granted = await readOrientationPermission({
    requestPermission() {
      calls += 1;
      return Promise.resolve('granted');
    },
  });
  assert.equal(granted, 'granted');
  assert.equal(calls, 1);

  assert.equal(await readOrientationPermission({
    requestPermission: () => Promise.resolve('denied'),
  }), 'denied');
  assert.equal(await readOrientationPermission({
    requestPermission: () => Promise.reject(new Error('blocked')),
  }), 'denied');
  assert.equal(await readOrientationPermission({
    requestPermission() { throw new Error('not a gesture'); },
  }), 'denied');
});

test('camera request falls back when the device cannot open a camera', async () => {
  assert.equal(await requestEnvironmentCamera(undefined), null);
  assert.equal(await requestEnvironmentCamera({}), null);

  const stream = { id: 'cam' };
  assert.equal(await requestEnvironmentCamera({
    getUserMedia: () => Promise.resolve(stream),
  }), stream);
  assert.equal(await requestEnvironmentCamera({
    getUserMedia: () => Promise.reject(new Error('denied')),
  }), null);
  assert.equal(await requestEnvironmentCamera({
    getUserMedia() { throw new Error('unavailable'); },
  }), null);
});

test('late permission callbacks do not re-attach after exit', async () => {
  const listeners = [];
  const permission = deferred();
  const camera = deferred();
  let orientationCalls = 0;
  let cameraCalls = 0;
  let stoppedTracks = 0;
  const controller = controllerWith(listeners);

  controller.start({
    orientationPermission: permission.promise,
    cameraPromise: camera.promise,
    onOrientation() { orientationCalls += 1; },
    onCamera() { cameraCalls += 1; },
  });
  assert.equal(listeners.length, 0);

  controller.stop();
  assert.equal(controller.isActive(), false);

  permission.resolve('granted');
  camera.resolve({
    getTracks: () => [{ stop() { stoppedTracks += 1; } }],
  });
  await flush();
  await flush();

  assert.equal(listeners.length, 0);
  assert.equal(orientationCalls, 0);
  assert.equal(cameraCalls, 0);
  assert.equal(stoppedTracks, 1);
  assert.equal(controller.isActive(), false);
});

test('an active session attaches once and exit removes the listener and camera', async () => {
  const listeners = [];
  let stops = 0;
  const samples = [];
  let camera = null;
  const stream = { getTracks: () => [{ stop() { stops += 1; } }] };
  const controller = controllerWith(listeners);

  controller.start({
    orientationPermission: Promise.resolve('granted'),
    cameraPromise: Promise.resolve(stream),
    onOrientation(update) { samples.push(update); },
    onCamera(next) { camera = next; },
  });
  await flush();

  assert.equal(listeners.length, 1);
  assert.equal(camera, stream);
  listeners[0]({ absolute: false, alpha: 20, beta: 10, gamma: 0 });
  assert.equal(samples.length, 0);
  listeners[0]({ absolute: true, alpha: 15, beta: 70, gamma: 0 });
  assert.equal(samples.length, 1);
  assert.equal(samples[0].sample.heading, 15);

  controller.stop();
  assert.equal(listeners.length, 0);
  assert.equal(stops, 1);
  assert.equal(samples.length, 1);
  assert.equal(controller.isActive(), false);
});

test('denied orientation permission does not attach a listener', async () => {
  const listeners = [];
  const updates = [];
  const controller = controllerWith(listeners);
  controller.start({
    orientationPermission: Promise.resolve('denied'),
    cameraPromise: Promise.resolve(null),
    onOrientation(update) { updates.push(update); },
    onCamera() {},
  });
  await flush();
  assert.equal(listeners.length, 0);
  assert.deepEqual(updates, [{ granted: false, sample: null }]);
  controller.stop();
  assert.equal(listeners.length, 0);
});
