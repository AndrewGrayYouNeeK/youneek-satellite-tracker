import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

const dom = new Window({ url: 'https://starlit.youneek.dev/' });
const globals = [
  'document',
  'HTMLElement',
  'Element',
  'Node',
  'DocumentFragment',
  'SVGElement',
  'HTMLCanvasElement',
  'HTMLVideoElement',
  'MutationObserver',
  'ResizeObserver',
  'Event',
  'CustomEvent',
  'PointerEvent',
  'MouseEvent',
  'KeyboardEvent',
  'Image',
  'getComputedStyle',
];
globalThis.window = dom;
globalThis.self = dom;
for (const name of globals) {
  if (dom[name] !== undefined) globalThis[name] = dom[name];
}
// CI runs Node 20, which has no global navigator. React DOM reads
// navigator.userAgent while it loads. Node 22 already provides one and
// does not allow replacing it.
if (globalThis.navigator == null) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: dom.navigator,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let rafId = 0;
const requestFrame = () => ++rafId;
const cancelFrame = () => {};
globalThis.requestAnimationFrame = requestFrame;
globalThis.cancelAnimationFrame = cancelFrame;
dom.requestAnimationFrame = requestFrame;
dom.cancelAnimationFrame = cancelFrame;

if (typeof dom.matchMedia !== 'function') {
  dom.matchMedia = () => ({
    matches: false,
    media: '',
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() { return false; },
  });
}
globalThis.matchMedia = dom.matchMedia.bind(dom);

globalThis.fetch = async () => new Response('unavailable', {
  status: 500,
  headers: { 'Content-Type': 'text/plain' },
});

let orientationListeners = 0;
const origAdd = dom.addEventListener.bind(dom);
const origRemove = dom.removeEventListener.bind(dom);
dom.addEventListener = (type, listener, options) => {
  if (String(type).startsWith('deviceorientation')) orientationListeners += 1;
  return origAdd(type, listener, options);
};
dom.removeEventListener = (type, listener, options) => {
  if (String(type).startsWith('deviceorientation')) orientationListeners = Math.max(0, orientationListeners - 1);
  return origRemove(type, listener, options);
};

const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: Home } = await import('./Home.jsx');

function buttonByText(label) {
  return [...document.querySelectorAll('button')].find((button) => button.textContent.includes(label));
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function installSensors({ requestPermission, getUserMedia } = {}) {
  globalThis.DeviceOrientationEvent = requestPermission
    ? { requestPermission }
    : function DeviceOrientationEvent() {};
  let stopped = 0;
  const mediaDevices = {
    getUserMedia: getUserMedia || (async () => ({
      getTracks: () => [{ stop() { stopped += 1; } }],
    })),
  };
  const geolocation = {
    getCurrentPosition(success) {
      success({ coords: { latitude: 40.7, longitude: -74 } });
    },
  };
  Object.defineProperty(globalThis.navigator, 'mediaDevices', { configurable: true, value: mediaDevices });
  Object.defineProperty(globalThis.navigator, 'geolocation', { configurable: true, value: geolocation });
  return {
    stopped: () => stopped,
  };
}

async function renderHome() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Home));
  });
  await settle();
  return {
    host,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

test('AR toggle shows the sky AR view and restores the globe time bar on exit', async () => {
  installSensors();
  orientationListeners = 0;
  const view = await renderHome();
  try {
    const globe = document.querySelector('[data-orbit-controls]');
    assert.ok(globe, 'globe view is mounted');
    assert.equal(globe.getAttribute('data-orbit-controls'), 'enabled');
    assert.ok(document.querySelector('[data-view-obstruction="timebar"]'));
    assert.equal(document.querySelector('[data-sky-ar]'), null);
    assert.equal(orientationListeners, 0);

    dom.dispatchEvent(new dom.Event('deviceorientation'));
    await settle();
    assert.equal(globe.getAttribute('data-orbit-controls'), 'enabled');
    assert.equal(orientationListeners, 0);
    assert.ok(document.querySelector('[data-view-obstruction="timebar"]'));

    const open = buttonByText('AR Mode');
    assert.ok(open);
    await act(async () => {
      open.click();
    });
    await settle();
    await settle();

    assert.ok(document.querySelector('[data-sky-ar="true"]'));
    assert.ok(buttonByText('Exit Sky AR'));
    assert.equal(document.querySelector('[data-view-obstruction="timebar"]'), null);
    assert.ok(document.querySelector('[data-ar-time-control="true"]'));
    assert.ok(document.body.textContent.includes('Drag to look around'));
    assert.equal(globe.getAttribute('data-orbit-controls'), 'enabled');
    assert.ok(globe.parentElement.className.includes('pointer-events-none'));
    assert.equal(document.querySelector('[data-view-obstruction="panel"]'), null);
    assert.ok(orientationListeners > 0);

    const exit = buttonByText('Exit Sky AR');
    await act(async () => {
      exit.click();
    });
    await settle();

    assert.equal(document.querySelector('[data-sky-ar]'), null);
    assert.ok(document.querySelector('[data-view-obstruction="timebar"]'));
    assert.equal(document.querySelector('[data-ar-time-control]'), null);
    assert.ok(document.querySelector('[data-view-obstruction="panel"]'));
    assert.ok(buttonByText('AR Mode'));
    assert.equal(globe.getAttribute('data-orbit-controls'), 'enabled');
    assert.equal(globe.parentElement.className.includes('pointer-events-none'), false);
    assert.equal(orientationListeners, 0);
  } finally {
    await view.unmount();
  }
});

test('late permission callbacks do not re-attach after exit', async () => {
  let resolvePermission = () => {};
  let resolveCamera = () => {};
  let stopped = 0;
  installSensors({
    requestPermission() {
      return new Promise((resolve) => {
        resolvePermission = resolve;
      });
    },
    getUserMedia() {
      return new Promise((resolve) => {
        resolveCamera = resolve;
      });
    },
  });
  orientationListeners = 0;
  const view = await renderHome();
  try {
    const open = buttonByText('AR Mode');
    await act(async () => {
      open.click();
    });
    await settle();
    assert.ok(document.querySelector('[data-sky-ar="true"]'));
    assert.equal(orientationListeners, 0);

    await act(async () => {
      buttonByText('Exit Sky AR').click();
    });
    await settle();
    assert.equal(document.querySelector('[data-sky-ar]'), null);
    assert.ok(document.querySelector('[data-view-obstruction="timebar"]'));

    resolvePermission('granted');
    resolveCamera({
      getTracks: () => [{ stop() { stopped += 1; } }],
    });
    await settle();
    await settle();

    assert.equal(orientationListeners, 0);
    assert.equal(document.querySelector('[data-sky-ar]'), null);
    assert.ok(document.querySelector('[data-view-obstruction="timebar"]'));
    assert.equal(document.querySelector('[data-orbit-controls]').getAttribute('data-orbit-controls'), 'enabled');
    assert.equal(stopped, 1);
  } finally {
    await view.unmount();
  }
});
