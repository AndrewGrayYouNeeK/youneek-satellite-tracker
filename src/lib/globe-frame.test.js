import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  GLOBE_FIT_RADIUS,
  cameraDistanceLimits,
  fitCameraDistance,
  viewOffsetForRect,
  visibleGlobeRect,
} from './globe-frame.js';

test('desktop framing clears the side panel and time bar', () => {
  const rect = visibleGlobeRect(1440, 900, {
    panelRight: 320,
    zoomLeft: 1380,
    timebarTop: 760,
  }, true);
  assert.ok(rect.left > 320);
  assert.ok(rect.bottom < 760);
  assert.ok(rect.right < 1380);
});

test('mobile framing ignores the overlay panel', () => {
  const rect = visibleGlobeRect(390, 844, {
    panelRight: 280,
    zoomLeft: 350,
    timebarTop: 720,
  }, false);
  assert.equal(rect.left, 16);
  assert.ok(rect.bottom < 720);
  assert.ok(rect.right > 350);
});

test('the origin projects to the center of the visible area and the globe fits inside it', () => {
  const width = 1440;
  const height = 900;
  const rect = visibleGlobeRect(width, height, {
    panelRight: 320,
    zoomLeft: 1380,
    timebarTop: 760,
  }, true);
  const fov = 45;
  const distance = fitCameraDistance(fov, width, height, rect);
  const limits = cameraDistanceLimits(distance);
  const offset = viewOffsetForRect(width, height, rect);

  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000);
  camera.position.set(0, Math.sin(0.3) * distance, Math.cos(0.3) * distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.setViewOffset(offset.fullWidth, offset.fullHeight, offset.offsetX, offset.offsetY, offset.width, offset.height);

  const origin = new THREE.Vector3(0, 0, 0).project(camera);
  const originX = (origin.x * 0.5 + 0.5) * width;
  const originY = (-origin.y * 0.5 + 0.5) * height;
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;
  assert.ok(Math.abs(originX - centerX) < 1, `origin x ${originX} vs ${centerX}`);
  assert.ok(Math.abs(originY - centerY) < 1, `origin y ${originY} vs ${centerY}`);

  const radius = GLOBE_FIT_RADIUS;
  const limbZ = (radius * radius) / distance;
  const limbRadius = Math.sqrt(radius * radius - limbZ * limbZ);
  const forward = camera.position.clone().normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  for (const point of [
    right.clone().multiplyScalar(limbRadius).addScaledVector(forward, limbZ),
    right.clone().multiplyScalar(-limbRadius).addScaledVector(forward, limbZ),
    up.clone().multiplyScalar(limbRadius).addScaledVector(forward, limbZ),
    up.clone().multiplyScalar(-limbRadius).addScaledVector(forward, limbZ),
  ]) {
    const projected = point.project(camera);
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    assert.ok(x >= rect.left - 1 && x <= rect.right + 1, `limb x ${x}`);
    assert.ok(y >= rect.top - 1 && y <= rect.bottom + 1, `limb y ${y}`);
  }

  assert.ok(limits.min < limits.fit);
  assert.ok(limits.fit <= limits.max);
  assert.equal(limits.fit, distance);
});
