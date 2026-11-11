import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyGlobeInteraction } from '@/lib/globe-interaction';
import {
  DESKTOP_MIN_WIDTH,
  HOME_TILT_RAD,
  cameraDistanceLimits,
  fitCameraDistance,
  viewOffsetForRect,
  visibleGlobeRect,
} from '@/lib/globe-frame';

const DEG2RAD = Math.PI / 180;

function latLngToVector3(lat, lng, radius) {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lng + 180) * DEG2RAD;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function readChromeBounds(container) {
  const origin = container.getBoundingClientRect();
  const edge = (name, prop) => {
    const el = document.querySelector(`[data-view-obstruction="${name}"]`);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (prop === 'right') return rect.right - origin.left;
    if (prop === 'left') return rect.left - origin.left;
    return rect.top - origin.top;
  };
  return {
    panelRight: edge('panel', 'right'),
    zoomLeft: edge('zoom', 'left'),
    timebarTop: edge('timebar', 'top'),
  };
}

export default function EarthGlobe({
  satellites = [],
  groupColors = {},
  activeGroups = [],
  zoomDelta = 0,
  onSatelliteClick,
  focusSatellite = null,
  viewResetToken = 0,
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const globeGroupRef = useRef(null);
  const satellitePointsRef = useRef([]);
  const satelliteDataRef = useRef(new Map());
  const animationRef = useRef(null);
  const fittedRef = useRef(3);
  const distanceLockedRef = useRef(false);
  const framingRef = useRef(false);
  const frameRef = useRef(null);
  const focusKeyRef = useRef('');
  const prevZoomDeltaRef = useRef(0);
  const viewResetSeenRef = useRef(viewResetToken);
  const propsRef = useRef({ satellites, groupColors, activeGroups, onSatelliteClick });
  propsRef.current = { satellites, groupColors, activeGroups, onSatelliteClick };

  const rebuildPoints = useCallback(() => {
    const globe = globeGroupRef.current;
    if (!globe) return;
    const { satellites: sats, groupColors: colors, activeGroups: groups } = propsRef.current;

    satellitePointsRef.current.forEach((pts) => {
      globe.remove(pts);
      pts.geometry.dispose();
      pts.material.dispose();
    });
    satellitePointsRef.current = [];
    satelliteDataRef.current = new Map();

    const grouped = {};
    sats.forEach((sat) => {
      const group = sat.group || 'unknown';
      if (!groups.includes(group)) return;
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(sat);
    });

    const addPointCloud = (items, size, color) => {
      if (items.length === 0) return;
      const positions = [];
      const pointColors = [];
      items.forEach((sat) => {
        const radius = 1.01 + (sat.altitude || 400) / 40000;
        const vec = latLngToVector3(sat.lat, sat.lng, radius);
        positions.push(vec.x, vec.y, vec.z);
        pointColors.push(color.r, color.g, color.b);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(pointColors, 3));
      const mat = new THREE.PointsMaterial({
        vertexColors: true,
        color: 0xffffff,
        size,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pts = new THREE.Points(geo, mat);
      globe.add(pts);
      satellitePointsRef.current.push(pts);
      satelliteDataRef.current.set(pts, items);
    };

    Object.entries(grouped).forEach(([group, items]) => {
      const groupColor = new THREE.Color(colors[group] || '#ffffff');
      const baseSize = group === 'stations' ? 0.045 : 0.02;
      addPointCloud(items.filter((sat) => !sat.highlighted), baseSize, groupColor);
      addPointCloud(items.filter((sat) => sat.highlighted), baseSize * 2.3, new THREE.Color(1, 1, 1));
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, Math.sin(HOME_TILT_RAD) * 4, Math.cos(HOME_TILT_RAD) * 4);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (err) {
      console.error(JSON.stringify({
        event: 'globe_init_failed',
        message: err instanceof Error ? err.message : String(err),
      }));
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    applyGlobeInteraction(controls, null);
    containerRef.current?.setAttribute('data-orbit-controls', controls.enabled ? 'enabled' : 'disabled');
    controls.target.set(0, 0, 0);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.zoomSpeed = 0.7;
    controls.rotateSpeed = 0.55;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.55;
    controls.minDistance = 1.6;
    controls.maxDistance = 12;
    controlsRef.current = controls;

    controls.addEventListener('start', () => {
      controls.autoRotate = false;
    });
    controls.addEventListener('end', () => {
      if (!focusKeyRef.current) controls.autoRotate = true;
    });
    controls.addEventListener('change', () => {
      if (framingRef.current) return;
      const distance = camera.position.length();
      if (Math.abs(distance - fittedRef.current) > 0.08) distanceLockedRef.current = true;
    });

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    const oceanMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshPhongMaterial({
        color: 0x030c18,
        emissive: 0x010408,
        specular: 0x0a1830,
        shininess: 50,
      })
    );
    globeGroup.add(oceanMesh);

    const gridMat = new THREE.LineBasicMaterial({ color: 0x0a2040, transparent: true, opacity: 0.3 });
    for (let lat = -80; lat <= 80; lat += 20) {
      const pts = [];
      for (let lng = 0; lng <= 360; lng += 2) pts.push(latLngToVector3(lat, lng - 180, 1.001));
      globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    for (let lng = -180; lng < 180; lng += 30) {
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 2) pts.push(latLngToVector3(lat, lng, 1.001));
      globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }

    const landMat = new THREE.MeshPhongMaterial({
      color: 0x0e2540,
      emissive: 0x060f1e,
      specular: 0x112244,
      shininess: 4,
      side: THREE.FrontSide,
    });
    const borderMat = new THREE.LineBasicMaterial({ color: 0x2060a0, transparent: true, opacity: 0.85 });
    const coastMat = new THREE.LineBasicMaterial({ color: 0x2a72b5, transparent: true, opacity: 0.95 });

    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
      .then((r) => r.json())
      .then((geojson) => {
        geojson.features.forEach((feature) => {
          const geom = feature.geometry;
          const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
          polys.forEach((poly) => {
            poly.forEach((ring, ringIdx) => {
              const pts = ring.map(([lng, lat]) => latLngToVector3(lat, lng, 1.003));
              globeGroup.add(new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(pts),
                ringIdx === 0 ? coastMat : borderMat
              ));

              if (ringIdx === 0 && ring.length > 3) {
                const cx = ring.reduce((s, [x]) => s + x, 0) / ring.length;
                const cy = ring.reduce((s, [, y]) => s + y, 0) / ring.length;
                const cVec = latLngToVector3(cy, cx, 1.002);
                const verts = [];
                for (let i = 0; i < ring.length - 1; i++) {
                  const v1 = latLngToVector3(ring[i][1], ring[i][0], 1.002);
                  const v2 = latLngToVector3(ring[i + 1][1], ring[i + 1][0], 1.002);
                  verts.push(cVec.x, cVec.y, cVec.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
                geo.computeVertexNormals();
                globeGroup.add(new THREE.Mesh(geo, landMat));
              }
            });
          });
        });
      })
      .catch(() => {
        const fallbackMat = new THREE.LineBasicMaterial({ color: 0x2a6499, transparent: true, opacity: 0.7 });
        const continents = [
          [[49, -125], [60, -140], [70, -160], [71, -155], [70, -140], [67, -135], [60, -115], [55, -80], [47, -60], [44, -65], [42, -70], [30, -82], [25, -80], [20, -90], [15, -90], [15, -85], [18, -88], [20, -97], [30, -115], [35, -120], [40, -124], [49, -125]],
          [[12, -70], [8, -62], [5, -52], [0, -50], [-5, -35], [-10, -37], [-23, -42], [-33, -52], [-40, -62], [-50, -70], [-55, -68], [-55, -65], [-50, -65], [-40, -58], [-35, -57], [-30, -50], [-20, -40], [-13, -38], [-5, -35], [-2, -42], [0, -48], [5, -55], [8, -60], [10, -65], [12, -70]],
          [[36, -5], [38, -5], [43, -9], [48, -5], [50, 2], [53, 5], [57, 10], [60, 5], [63, 10], [70, 20], [70, 30], [60, 30], [55, 28], [47, 30], [42, 28], [37, 25], [36, 22], [38, 15], [40, 10], [43, 5], [38, 0], [36, -5]],
          [[37, -5], [35, -1], [32, 10], [33, 12], [30, 32], [22, 37], [12, 44], [2, 42], [-5, 40], [-10, 40], [-15, 35], [-25, 33], [-30, 30], [-35, 20], [-34, 18], [-30, 17], [-20, 13], [-10, 14], [-5, 12], [0, 10], [5, 1], [5, -5], [10, -15], [15, -17], [20, -17], [25, -15], [30, -10], [35, -5], [37, -5]],
          [[42, 28], [48, 40], [40, 50], [38, 58], [25, 62], [22, 60], [15, 55], [12, 44], [22, 37], [30, 32], [33, 36], [37, 40], [42, 50], [55, 60], [55, 70], [50, 80], [42, 75], [35, 75], [25, 68], [22, 72], [22, 80], [20, 85], [22, 88], [22, 92], [20, 95], [15, 100], [5, 105], [-5, 110], [-8, 115], [-7, 120], [0, 120], [5, 115], [10, 110], [15, 108], [22, 108], [25, 105], [30, 105], [35, 110], [35, 118], [38, 118], [40, 122], [42, 130], [45, 135], [48, 140], [52, 140], [55, 135], [60, 140], [63, 140], [65, 170], [68, 180], [72, 180], [75, 140], [73, 100], [70, 70], [65, 60], [60, 60], [55, 55], [48, 40], [42, 28]],
          [[-12, 130], [-15, 125], [-20, 118], [-25, 114], [-30, 115], [-35, 117], [-35, 138], [-37, 140], [-38, 146], [-35, 150], [-30, 153], [-25, 152], [-20, 148], [-15, 145], [-12, 142], [-10, 135], [-12, 130]],
        ];
        continents.forEach((pts) => {
          const points = pts.map(([lat, lng]) => latLngToVector3(lat, lng, 1.003));
          globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), fallbackMat));
        });
      });

    const atmosphereMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.08, 64, 64),
      new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
            gl_FragColor = vec4(0.1, 0.4, 0.8, 1.0) * intensity;
          }
        `,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
      })
    );
    scene.add(atmosphereMesh);

    scene.add(new THREE.AmbientLight(0x223355, 0.7));
    const sun = new THREE.DirectionalLight(0xaaccff, 0.9);
    sun.position.set(5, 3, 5);
    scene.add(sun);

    const starPos = [];
    for (let i = 0; i < 3000; i++) {
      starPos.push((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200);
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.8 })));

    const frameCamera = ({ resetDistance }) => {
      const view = containerRef.current;
      const cam = cameraRef.current;
      const orbit = controlsRef.current;
      const gl = rendererRef.current;
      if (!view || !cam || !orbit || !gl) return;
      const w = view.clientWidth;
      const h = view.clientHeight;
      if (w < 2 || h < 2) return;

      const isDesktop = w >= DESKTOP_MIN_WIDTH;
      const rect = visibleGlobeRect(w, h, readChromeBounds(view), isDesktop);
      const fit = fitCameraDistance(cam.fov, w, h, rect);
      const limits = cameraDistanceLimits(fit);
      fittedRef.current = limits.fit;
      orbit.minDistance = limits.min;
      orbit.maxDistance = limits.max;

      const offset = viewOffsetForRect(w, h, rect);
      cam.aspect = w / h;
      cam.setViewOffset(offset.fullWidth, offset.fullHeight, offset.offsetX, offset.offsetY, offset.width, offset.height);
      gl.setSize(w, h);

      framingRef.current = true;
      if (resetDistance || !distanceLockedRef.current) {
        const dist = limits.fit;
        if (resetDistance) {
          cam.position.set(0, Math.sin(HOME_TILT_RAD) * dist, Math.cos(HOME_TILT_RAD) * dist);
          distanceLockedRef.current = false;
          if (!focusKeyRef.current) orbit.autoRotate = true;
        } else {
          const direction = cam.position.clone();
          if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1);
          cam.position.copy(direction.normalize().multiplyScalar(dist));
        }
      } else {
        const current = cam.position.length();
        const next = Math.min(limits.max, Math.max(limits.min, current));
        if (current > 1e-6) cam.position.multiplyScalar(next / current);
      }
      orbit.target.set(0, 0, 0);
      orbit.update();
      framingRef.current = false;
    };
    frameRef.current = frameCamera;
    frameCamera({ resetDistance: true });
    rebuildPoints();

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      controls.target.set(0, 0, 0);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    let layoutKey = '';
    const watchLayout = () => {
      const view = containerRef.current;
      if (!view) return;
      const bounds = readChromeBounds(view);
      const key = `${view.clientWidth}x${view.clientHeight}:${bounds.panelRight}:${bounds.zoomLeft}:${bounds.timebarTop}`;
      if (key === layoutKey) return;
      layoutKey = key;
      frameCamera({ resetDistance: false });
    };
    const resizeObserver = new ResizeObserver(watchLayout);
    resizeObserver.observe(container);
    document.querySelectorAll('[data-view-obstruction]').forEach((el) => resizeObserver.observe(el));
    const mutationObserver = new MutationObserver(() => {
      document.querySelectorAll('[data-view-obstruction]').forEach((el) => resizeObserver.observe(el));
      watchLayout();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', watchLayout);

    let pointerStart = null;
    const onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      pointerStart = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event) => {
      if (!pointerStart) return;
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      pointerStart = null;
      if (dx * dx + dy * dy > 9) return;
      const click = propsRef.current.onSatelliteClick;
      if (!click || !cameraRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.params.Points.threshold = 0.02 * (camera.position.length() / 3);
      camera.updateMatrixWorld();
      raycaster.setFromCamera({ x, y }, camera);
      const intersects = raycaster.intersectObjects(satellitePointsRef.current);
      if (intersects.length > 0) {
        const hit = intersects[0];
        const satData = satelliteDataRef.current.get(hit.object)?.[hit.index];
        click(satData ? { ...satData, group: satData.group } : null);
      } else {
        click(null);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      cancelAnimationFrame(animationRef.current);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', watchLayout);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      controlsRef.current = null;
      frameRef.current = null;
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [rebuildPoints]);

  useEffect(() => {
    rebuildPoints();
  }, [satellites, groupColors, activeGroups, rebuildPoints]);

  useEffect(() => {
    if (zoomDelta === prevZoomDeltaRef.current) return;
    const zoomIn = zoomDelta > prevZoomDeltaRef.current;
    prevZoomDeltaRef.current = zoomDelta;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const distance = camera.position.length() || fittedRef.current;
    const next = Math.min(controls.maxDistance, Math.max(controls.minDistance, distance * (zoomIn ? 0.82 : 1.22)));
    camera.position.multiplyScalar(next / distance);
    distanceLockedRef.current = true;
    controls.target.set(0, 0, 0);
    controls.update();
  }, [zoomDelta]);

  const focusRef = useRef(focusSatellite);
  focusRef.current = focusSatellite;
  const focusKey = focusSatellite?.name ? `${focusSatellite.group}:${focusSatellite.name}` : '';
  useEffect(() => {
    focusKeyRef.current = focusKey;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const sat = focusRef.current;
    if (!camera || !controls) return;
    applyGlobeInteraction(controls, null);
    containerRef.current?.setAttribute('data-orbit-controls', controls.enabled ? 'enabled' : 'disabled');
    if (!focusKey || sat?.lat == null) {
      controls.autoRotate = true;
      return;
    }
    const direction = latLngToVector3(sat.lat, sat.lng, 1).normalize();
    const distance = Math.max(controls.minDistance, Math.min(fittedRef.current * 0.62, controls.maxDistance));
    camera.position.copy(direction.multiplyScalar(distance));
    distanceLockedRef.current = true;
    controls.autoRotate = false;
    controls.target.set(0, 0, 0);
    controls.update();
  }, [focusKey]);

  useEffect(() => {
    if (viewResetSeenRef.current === viewResetToken) return;
    viewResetSeenRef.current = viewResetToken;
    frameRef.current?.({ resetDistance: true });
  }, [viewResetToken]);

  return (
    <div ref={containerRef} data-orbit-controls="enabled" className="w-full h-full cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }} />
  );
}
