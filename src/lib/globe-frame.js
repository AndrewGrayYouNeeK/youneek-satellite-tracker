// Frames the unit globe in the screen region that is not covered by the
// desktop side panel or the time bar. Mobile ignores the overlay panel and
// centers horizontally in the full viewport.

export const DESKTOP_MIN_WIDTH = 768;
export const GLOBE_FIT_RADIUS = 1.15;
export const MIN_CAMERA_DISTANCE = 1.6;
export const HOME_TILT_RAD = 0.3;
export const FRAME_GAP_PX = 16;

export function visibleGlobeRect(viewportWidth, viewportHeight, bounds, isDesktop) {
  const gap = FRAME_GAP_PX;
  let left = gap;
  let top = gap;
  let right = viewportWidth - gap;
  let bottom = viewportHeight - gap;

  if (isDesktop && bounds.panelRight != null) {
    left = Math.max(left, bounds.panelRight + gap);
  }
  if (isDesktop && bounds.zoomLeft != null) {
    right = Math.min(right, bounds.zoomLeft - gap);
  }
  if (bounds.timebarTop != null) {
    bottom = Math.min(bottom, bounds.timebarTop - gap);
  }

  if (right - left < 120) {
    left = gap;
    right = viewportWidth - gap;
  }
  if (bottom - top < 120) {
    top = gap;
    bottom = viewportHeight - gap;
  }

  return { left, top, right, bottom };
}

// setViewOffset shifts the projection so the camera's look-at point (the
// origin) lands on this pixel. offsetX/offsetY match three.js PerspectiveCamera:
// canvasX = width/2 - offsetX.
export function viewOffsetForRect(viewportWidth, viewportHeight, rect) {
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;
  return {
    fullWidth: viewportWidth,
    fullHeight: viewportHeight,
    offsetX: viewportWidth / 2 - centerX,
    offsetY: viewportHeight / 2 - centerY,
    width: viewportWidth,
    height: viewportHeight,
  };
}

export function fitCameraDistance(fovDeg, viewportWidth, viewportHeight, rect, radius = GLOBE_FIT_RADIUS) {
  const visibleWidth = Math.max(1, rect.right - rect.left);
  const visibleHeight = Math.max(1, rect.bottom - rect.top);
  const verticalFov = (fovDeg * Math.PI) / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (viewportWidth / viewportHeight));
  const visibleVerticalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (visibleHeight / viewportHeight));
  const visibleHorizontalFov = 2 * Math.atan(Math.tan(horizontalFov / 2) * (visibleWidth / viewportWidth));
  const distanceForHeight = radius / Math.sin(visibleVerticalFov / 2);
  const distanceForWidth = radius / Math.sin(visibleHorizontalFov / 2);
  return Math.max(distanceForHeight, distanceForWidth, MIN_CAMERA_DISTANCE);
}

export function cameraDistanceLimits(fitDistance) {
  const min = MIN_CAMERA_DISTANCE;
  const max = Math.max(fitDistance * 1.7, min + 0.5);
  return { min, max, fit: Math.min(Math.max(fitDistance, min), max) };
}
