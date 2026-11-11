// Sky AR session. Permission requests are started by the caller inside the
// click that opens AR (iOS ignores them otherwise). A generation token drops
// results that resolve after Exit.

function releaseStream(next) {
  if (!next || typeof next.getTracks !== 'function') return;
  for (const track of next.getTracks()) {
    try {
      track.stop();
    } catch {
      // The track may already have ended.
    }
  }
}

function wrap360(value) {
  return ((value % 360) + 360) % 360;
}

export function sampleFromOrientationEvent(event) {
  if (!event || typeof event.alpha !== 'number' || typeof event.beta !== 'number') return null;
  if (!Number.isFinite(event.alpha) || !Number.isFinite(event.beta)) return null;
  const hasCompass = typeof event.webkitCompassHeading === 'number' && Number.isFinite(event.webkitCompassHeading);
  // Relative laptop events are not a sky heading. They jitter and read as
  // zeros on desktops that fire deviceorientation without a compass.
  if (event.absolute !== true && !hasCompass) return null;
  const heading = hasCompass ? event.webkitCompassHeading : event.alpha;
  return {
    heading: wrap360(heading),
    tilt: 90 - event.beta,
    roll: typeof event.gamma === 'number' && Number.isFinite(event.gamma) ? event.gamma : 0,
  };
}

export function readOrientationPermission(deviceOrientationEvent = globalThis.DeviceOrientationEvent) {
  if (typeof deviceOrientationEvent?.requestPermission !== 'function') {
    return Promise.resolve('granted');
  }
  try {
    return Promise.resolve(deviceOrientationEvent.requestPermission()).then(
      (state) => (state === 'granted' ? 'granted' : 'denied'),
      () => 'denied',
    );
  } catch {
    return Promise.resolve('denied');
  }
}

export function requestEnvironmentCamera(mediaDevices = globalThis.navigator?.mediaDevices) {
  if (typeof mediaDevices?.getUserMedia !== 'function') return Promise.resolve(null);
  try {
    return Promise.resolve(mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment' },
    })).then(
      (stream) => stream ?? null,
      () => null,
    );
  } catch {
    return Promise.resolve(null);
  }
}

export function createSkyArController({
  addOrientationListener,
  removeOrientationListener,
  requestFullscreen,
  exitFullscreen,
} = {}) {
  let generation = 0;
  let active = false;
  let listener = null;
  let stream = null;

  function detachListener() {
    if (!listener) return;
    removeOrientationListener?.(listener);
    listener = null;
  }

  function cancelPending() {
    generation += 1;
    active = false;
    detachListener();
    releaseStream(stream);
    stream = null;
  }

  return {
    isActive() {
      return active;
    },

    start({ orientationPermission, cameraPromise, onOrientation, onCamera }) {
      cancelPending();
      const token = generation;
      active = true;
      try {
        requestFullscreen?.();
      } catch {
        // Fullscreen is optional. Sky AR still opens in the page.
      }

      Promise.resolve(orientationPermission).then((state) => {
        if (token !== generation) return;
        if (state !== 'granted') {
          onOrientation?.({ granted: false, sample: null });
          return;
        }
        const handler = (event) => {
          if (token !== generation) return;
          const sample = sampleFromOrientationEvent(event);
          if (!sample) return;
          onOrientation?.({ granted: true, sample });
        };
        listener = handler;
        addOrientationListener?.(handler);
        if (token !== generation) detachListener();
      }, () => {
        if (token !== generation) return;
        onOrientation?.({ granted: false, sample: null });
      });

      Promise.resolve(cameraPromise).then((next) => {
        if (token !== generation) {
          releaseStream(next);
          return;
        }
        stream = next ?? null;
        onCamera?.(stream);
      }, () => {
        if (token !== generation) return;
        onCamera?.(null);
      });
    },

    stop() {
      const wasActive = active;
      cancelPending();
      if (!wasActive) return;
      try {
        exitFullscreen?.();
      } catch {
        // Leaving fullscreen is best-effort.
      }
    },
  };
}
