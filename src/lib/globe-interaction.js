// The normal globe view is dragged with OrbitControls. Device orientation
// belongs to the sky AR view and must not freeze or jitter this camera.

export function applyGlobeInteraction(controls, orientationSample) {
  if (!controls) return controls;
  void orientationSample;
  controls.enabled = true;
  return controls;
}
