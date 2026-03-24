import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';

// Equirectangular (flat) projection: lat/lng -> flat plane XY
function latLngToFlat(lat, lng, scale = 1) {
  const x = (lng / 180) * scale;
  const y = (lat / 90) * (scale / 2);
  return new THREE.Vector3(x, y, 0);
}

export default function FlatEarthMap({ satellites = [], groupColors = {}, activeGroups = [], zoomDelta = 0, onSatelliteClick }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const mapGroupRef = useRef(null);
  const satellitePointsRef = useRef({});
  const satelliteDataRef = useRef({});
  const animationRef = useRef(null);
  const mouseRef = useRef({ isDown: false, hasMoved: false, prevX: 0, prevY: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const targetPanRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1.8);
  const prevZoomDeltaRef = useRef(0);

  const SCALE = 2; // map width = 4 units, height = 2 units

  const initScene = useCallback(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030c18);
    sceneRef.current = scene;

    const aspect = width / height;
    const frustumSize = zoomRef.current;
    const camera = new THREE.OrthographicCamera(
      -frustumSize * aspect, frustumSize * aspect,
      frustumSize, -frustumSize,
      0.1, 100
    );
    camera.position.z = 10;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x030c18, 1);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const mapGroup = new THREE.Group();
    scene.add(mapGroup);
    mapGroupRef.current = mapGroup;

    // ── Stars background ──
    const starPos = [];
    for (let i = 0; i < 1500; i++) {
      starPos.push((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10, -5);
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.02, transparent: true, opacity: 0.6 })));

    // ── Ocean background plane ──
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(SCALE * 2, SCALE),
      new THREE.MeshBasicMaterial({ color: 0x030c18 })
    );
    mapGroup.add(ocean);

    // ── Outer border ──
    const borderPts = [
      new THREE.Vector3(-SCALE, -SCALE / 2, 0.01),
      new THREE.Vector3(SCALE, -SCALE / 2, 0.01),
      new THREE.Vector3(SCALE, SCALE / 2, 0.01),
      new THREE.Vector3(-SCALE, SCALE / 2, 0.01),
      new THREE.Vector3(-SCALE, -SCALE / 2, 0.01),
    ];
    mapGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(borderPts),
      new THREE.LineBasicMaterial({ color: 0x2a72b5, transparent: true, opacity: 0.8 })
    ));

    // ── Lat/lng grid ──
    const gridMat = new THREE.LineBasicMaterial({ color: 0x0a2040, transparent: true, opacity: 0.5 });
    for (let lat = -80; lat <= 80; lat += 20) {
      const pts = [latLngToFlat(lat, -180, SCALE), latLngToFlat(lat, 180, SCALE)].map(v => new THREE.Vector3(v.x, v.y, 0.01));
      mapGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    for (let lng = -180; lng <= 180; lng += 30) {
      const pts = [latLngToFlat(-90, lng, SCALE), latLngToFlat(90, lng, SCALE)].map(v => new THREE.Vector3(v.x, v.y, 0.01));
      mapGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }

    // ── Equator highlight ──
    mapGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-SCALE, 0, 0.015), new THREE.Vector3(SCALE, 0, 0.015)]),
      new THREE.LineBasicMaterial({ color: 0x1a4060, transparent: true, opacity: 0.9 })
    ));

    // ── Country outlines from GeoJSON ──
    const coastMat = new THREE.LineBasicMaterial({ color: 0x2a72b5, transparent: true, opacity: 0.95 });
    const landMat = new THREE.MeshBasicMaterial({ color: 0x0e2540, side: THREE.DoubleSide });

    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
      .then(r => r.json())
      .then(geojson => {
        geojson.features.forEach(feature => {
          const geom = feature.geometry;
          const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
          polys.forEach(poly => {
            poly.forEach((ring, ringIdx) => {
              const pts = ring.map(([lng, lat]) => {
                const v = latLngToFlat(lat, lng, SCALE);
                return new THREE.Vector3(v.x, v.y, 0.02);
              });
              mapGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), coastMat));

              // Fill land
              if (ringIdx === 0 && ring.length > 3) {
                const cx = ring.reduce((s, [x]) => s + x, 0) / ring.length;
                const cy = ring.reduce((s, [, y]) => s + y, 0) / ring.length;
                const cVec = latLngToFlat(cy, cx, SCALE);
                const verts = [];
                for (let i = 0; i < ring.length - 1; i++) {
                  const v1 = latLngToFlat(ring[i][1], ring[i][0], SCALE);
                  const v2 = latLngToFlat(ring[i + 1][1], ring[i + 1][0], SCALE);
                  verts.push(cVec.x, cVec.y, 0.018, v1.x, v1.y, 0.018, v2.x, v2.y, 0.018);
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
                mapGroup.add(new THREE.Mesh(geo, landMat));
              }
            });
          });
        });
      })
      .catch(() => {}); // silently fail, grid still visible

    // ── Flat Earth ice wall around the edge (Antarctica as outer ring) ──
    const iceWallPts = [];
    for (let lng = -180; lng <= 180; lng += 5) {
      const v = latLngToFlat(-85, lng, SCALE);
      iceWallPts.push(new THREE.Vector3(v.x, v.y, 0.025));
    }
    mapGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(iceWallPts),
      new THREE.LineBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.7 })
    ));

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 1));

  }, []);

  // Zoom handling
  useEffect(() => {
    if (zoomDelta !== prevZoomDeltaRef.current) {
      prevZoomDeltaRef.current = zoomDelta;
      zoomRef.current = Math.max(0.5, Math.min(4, zoomRef.current + (zoomDelta > 0 ? -0.3 : 0.3)));
    }
  }, [zoomDelta]);

  // Update satellite dots
  useEffect(() => {
    if (!sceneRef.current || !mapGroupRef.current) return;

    Object.values(satellitePointsRef.current).forEach(pts => {
      mapGroupRef.current.remove(pts);
      pts.geometry.dispose();
      pts.material.dispose();
    });
    satellitePointsRef.current = {};
    satelliteDataRef.current = {};

    const groupedSats = {};
    satellites.forEach(sat => {
      const group = sat.group || 'unknown';
      if (!activeGroups.includes(group)) return;
      if (!groupedSats[group]) groupedSats[group] = [];
      groupedSats[group].push(sat);
    });

    Object.entries(groupedSats).forEach(([group, sats]) => {
      const positions = [];
      const color = new THREE.Color(groupColors[group] || '#ffffff');
      sats.forEach(sat => {
        const v = latLngToFlat(sat.lat, sat.lng, SCALE);
        // Altitude offset: higher = slightly above the plane visually (z only)
        const z = 0.03 + (sat.altitude || 400) / 200000;
        positions.push(v.x, v.y, z);
      });
      if (positions.length === 0) return;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color,
        size: group === 'stations' ? 0.025 : 0.008,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pts = new THREE.Points(geo, mat);
      mapGroupRef.current.add(pts);
      satellitePointsRef.current[group] = pts;
      satelliteDataRef.current[group] = sats;
    });
  }, [satellites, groupColors, activeGroups]);

  // Animation loop
  useEffect(() => {
    initScene();

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);

      // Smooth pan
      panRef.current.x += (targetPanRef.current.x - panRef.current.x) * 0.08;
      panRef.current.y += (targetPanRef.current.y - panRef.current.y) * 0.08;

      if (mapGroupRef.current) {
        mapGroupRef.current.position.x = panRef.current.x;
        mapGroupRef.current.position.y = panRef.current.y;
      }

      // Smooth zoom via orthographic camera frustum
      if (cameraRef.current && containerRef.current) {
        const aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
        const f = zoomRef.current;
        const cam = cameraRef.current;
        cam.left   += (-f * aspect - cam.left)   * 0.05;
        cam.right  += ( f * aspect - cam.right)  * 0.05;
        cam.top    += ( f - cam.top)             * 0.05;
        cam.bottom += (-f - cam.bottom)          * 0.05;
        cam.updateProjectionMatrix();
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animate();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (rendererRef.current && containerRef.current) {
        try { containerRef.current.removeChild(rendererRef.current.domElement); } catch {}
        rendererRef.current.dispose();
      }
    };
  }, [initScene]);

  // Mouse / touch / wheel events for pan + click
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onDown = (e) => {
      mouseRef.current = { isDown: true, hasMoved: false, prevX: e.clientX, prevY: e.clientY };
    };
    const onMove = (e) => {
      if (!mouseRef.current.isDown) return;
      const dx = e.clientX - mouseRef.current.prevX;
      const dy = e.clientY - mouseRef.current.prevY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) mouseRef.current.hasMoved = true;
      // Convert pixel delta to world units
      const aspect = container.clientWidth / container.clientHeight;
      const worldW = zoomRef.current * aspect * 2;
      const worldH = zoomRef.current * 2;
      targetPanRef.current.x += (dx / container.clientWidth) * worldW;
      targetPanRef.current.y -= (dy / container.clientHeight) * worldH;
      mouseRef.current.prevX = e.clientX;
      mouseRef.current.prevY = e.clientY;
    };
    const onUp = (e) => {
      if (!mouseRef.current.hasMoved && onSatelliteClick) {
        // Find nearest sat by projected screen distance
        const rect = container.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.params.Points.threshold = 0.04;
        raycaster.setFromCamera({ x: nx, y: ny }, cameraRef.current);
        const pts = Object.values(satellitePointsRef.current);
        const intersects = raycaster.intersectObjects(pts);
        if (intersects.length > 0) {
          const hit = intersects[0];
          const group = Object.keys(satellitePointsRef.current).find(k => satellitePointsRef.current[k] === hit.object);
          const satData = satelliteDataRef.current[group]?.[hit.index];
          if (satData) onSatelliteClick({ ...satData, group });
        } else {
          onSatelliteClick(null);
        }
      }
      mouseRef.current.isDown = false;
    };
    const onWheel = (e) => {
      e.preventDefault();
      zoomRef.current = Math.max(0.5, Math.min(4, zoomRef.current + e.deltaY * 0.001));
    };
    const onResize = () => {
      if (!rendererRef.current || !cameraRef.current || !containerRef.current) return;
      const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight;
      rendererRef.current.setSize(w, h);
      const aspect = w / h;
      const f = zoomRef.current;
      cameraRef.current.left = -f * aspect;
      cameraRef.current.right = f * aspect;
      cameraRef.current.top = f;
      cameraRef.current.bottom = -f;
      cameraRef.current.updateProjectionMatrix();
    };

    container.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);

    return () => {
      container.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    };
  }, [onSatelliteClick]);

  return (
    <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }} />
  );
}