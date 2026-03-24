import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';

const DEG2RAD = Math.PI / 180;
const DISC_RADIUS = 2.0;
const DISC_THICKNESS = 0.08;

// Equirectangular -> flat disc (azimuthal equidistant from north pole, flat earther style)
// North pole = center, south pole = edge (Antarctica = ice wall)
function latLngToDisc(lat, lng) {
  // Distance from north pole: 0 at 90°N, DISC_RADIUS at 90°S
  const r = ((90 - lat) / 180) * DISC_RADIUS;
  const angle = lng * DEG2RAD;
  const x = r * Math.sin(angle);
  const z = r * Math.cos(angle);
  return { x, z };
}

function latLngToDiscVec3(lat, lng, y = 0) {
  const { x, z } = latLngToDisc(lat, lng);
  return new THREE.Vector3(x, y, z);
}

export default function FlatEarthMap({ satellites = [], groupColors = {}, activeGroups = [], zoomDelta = 0, onSatelliteClick }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const sceneGroupRef = useRef(null);
  const satellitePointsRef = useRef({});
  const satelliteDataRef = useRef({});
  const animationRef = useRef(null);
  const mouseRef = useRef({ isDown: false, hasMoved: false, prevX: 0, prevY: 0 });
  const rotationRef = useRef({ x: 0.55, y: 0.3 });
  const targetRotRef = useRef({ x: 0.55, y: 0.3 });
  const zoomRef = useRef(5.5);
  const prevZoomDeltaRef = useRef(0);

  const initScene = useCallback(() => {
    if (!containerRef.current) return;
    const W = containerRef.current.clientWidth;
    const H = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000508);
    scene.fog = new THREE.FogExp2(0x000508, 0.04);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 500);
    camera.position.set(0, zoomRef.current * 0.7, zoomRef.current);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const group = new THREE.Group();
    scene.add(group);
    sceneGroupRef.current = group;

    // ── Stars ──
    const starPos = [];
    for (let i = 0; i < 4000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 80 + Math.random() * 40;
      starPos.push(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, transparent: true, opacity: 0.85, sizeAttenuation: true })));

    // ── Disc (ocean) ──
    const discGeo = new THREE.CylinderGeometry(DISC_RADIUS, DISC_RADIUS, DISC_THICKNESS, 128, 1);
    const discMat = new THREE.MeshPhongMaterial({
      color: 0x030c18,
      emissive: 0x010408,
      specular: 0x0a2040,
      shininess: 30,
    });
    const discMesh = new THREE.Mesh(discGeo, discMat);
    discMesh.receiveShadow = true;
    group.add(discMesh);

    // ── Ice wall (Antarctica ring at edge) ──
    const iceWallGeo = new THREE.CylinderGeometry(DISC_RADIUS, DISC_RADIUS + 0.05, 0.25, 128, 1, true);
    const iceWallMat = new THREE.MeshPhongMaterial({
      color: 0xaaddff,
      emissive: 0x224466,
      transparent: true,
      opacity: 0.85,
      side: THREE.FrontSide,
    });
    const iceWall = new THREE.Mesh(iceWallGeo, iceWallMat);
    iceWall.position.y = DISC_THICKNESS / 2 + 0.1;
    group.add(iceWall);

    // Icy top cap ring
    const iceCapGeo = new THREE.RingGeometry(DISC_RADIUS - 0.12, DISC_RADIUS + 0.05, 128);
    const iceCapMat = new THREE.MeshPhongMaterial({ color: 0xcceeFF, emissive: 0x112233, side: THREE.DoubleSide });
    const iceCap = new THREE.Mesh(iceCapGeo, iceCapMat);
    iceCap.rotation.x = -Math.PI / 2;
    iceCap.position.y = DISC_THICKNESS / 2 + 0.001;
    group.add(iceCap);

    // ── Lat/lng grid lines on top of disc ──
    const gridMat = new THREE.LineBasicMaterial({ color: 0x0a2040, transparent: true, opacity: 0.45 });
    // Latitude rings
    for (let lat = 0; lat >= -70; lat -= 15) {
      const pts = [];
      for (let lng = 0; lng <= 360; lng += 3) {
        const v = latLngToDiscVec3(lat + 90 > 0 ? lat : 0, lng - 180, DISC_THICKNESS / 2 + 0.001);
        pts.push(v);
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    // Longitude spokes
    for (let lng = -180; lng < 180; lng += 30) {
      const pts = [
        latLngToDiscVec3(89, lng, DISC_THICKNESS / 2 + 0.001),
        latLngToDiscVec3(-80, lng, DISC_THICKNESS / 2 + 0.001),
      ];
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }

    // ── Country land from GeoJSON ──
    const landMat = new THREE.MeshPhongMaterial({
      color: 0x0e2540,
      emissive: 0x061525,
      specular: 0x112244,
      shininess: 2,
      side: THREE.DoubleSide,
    });
    const coastMat = new THREE.LineBasicMaterial({ color: 0x2a72b5, transparent: true, opacity: 0.95 });

    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
      .then(r => r.json())
      .then(geojson => {
        geojson.features.forEach(feature => {
          const geom = feature.geometry;
          const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
          polys.forEach(poly => {
            poly.forEach((ring, ringIdx) => {
              const y = DISC_THICKNESS / 2 + 0.002;
              const pts = ring.map(([lng, lat]) => latLngToDiscVec3(lat, lng, y));
              group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), coastMat));

              if (ringIdx === 0 && ring.length > 3) {
                const cx = ring.reduce((s, [x]) => s + x, 0) / ring.length;
                const cy = ring.reduce((s, [, yy]) => s + yy, 0) / ring.length;
                const cVec = latLngToDiscVec3(cy, cx, y + 0.001);
                const verts = [];
                for (let i = 0; i < ring.length - 1; i++) {
                  const v1 = latLngToDiscVec3(ring[i][1], ring[i][0], y + 0.001);
                  const v2 = latLngToDiscVec3(ring[i + 1][1], ring[i + 1][0], y + 0.001);
                  verts.push(cVec.x, cVec.y, cVec.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
                group.add(new THREE.Mesh(geo, landMat));
              }
            });
          });
        });
      })
      .catch(() => {});

    // ── Dome / atmosphere ──
    const domeGeo = new THREE.SphereGeometry(DISC_RADIUS * 1.4, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPosition;
        void main() {
          float h = vPosition.y / ${(DISC_RADIUS * 1.4).toFixed(2)};
          float edge = 1.0 - abs(vPosition.x * vPosition.x + vPosition.z * vPosition.z) / ${(DISC_RADIUS * 1.4 * DISC_RADIUS * 1.4).toFixed(2)};
          float alpha = (1.0 - h) * edge * 0.18;
          gl_FragColor = vec4(0.1, 0.35, 0.9, alpha);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = DISC_THICKNESS / 2;
    group.add(dome);

    // ── Edge glow ──
    const edgeGeo = new THREE.TorusGeometry(DISC_RADIUS, 0.08, 16, 128);
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x1a6aff, transparent: true, opacity: 0.25 });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = DISC_THICKNESS / 2;
    group.add(edge);

    // ── Underside: flat rock/stone bottom ──
    const bottomGeo = new THREE.CylinderGeometry(DISC_RADIUS * 0.98, DISC_RADIUS * 1.02, 0.01, 64);
    const bottomMat = new THREE.MeshPhongMaterial({ color: 0x050d1a, emissive: 0x020508 });
    const bottom = new THREE.Mesh(bottomGeo, bottomMat);
    bottom.position.y = -DISC_THICKNESS / 2;
    group.add(bottom);

    // ── Turtles holding up the disc (fun flat earth lore) ──
    // Just 4 glowing pillars underneath as a nod to the turtles/elephants
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const pillarGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.8, 8);
      const pillarMat = new THREE.MeshPhongMaterial({ color: 0x112233, emissive: 0x0a1a2a });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(
        Math.sin(angle) * DISC_RADIUS * 0.55,
        -DISC_THICKNESS / 2 - 0.4,
        Math.cos(angle) * DISC_RADIUS * 0.55
      );
      group.add(pillar);
    }

    // ── Lighting ──
    scene.add(new THREE.AmbientLight(0x223355, 0.6));
    const sun = new THREE.DirectionalLight(0xffd070, 1.2);
    sun.position.set(6, 8, 4);
    sun.castShadow = true;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x4488cc, 0.3);
    fill.position.set(-4, 2, -4);
    scene.add(fill);

  }, []);

  // Zoom
  useEffect(() => {
    if (zoomDelta !== prevZoomDeltaRef.current) {
      prevZoomDeltaRef.current = zoomDelta;
      zoomRef.current = Math.max(2, Math.min(12, zoomRef.current + (zoomDelta > 0 ? -0.6 : 0.6)));
    }
  }, [zoomDelta]);

  // Update satellite dots
  useEffect(() => {
    if (!sceneGroupRef.current) return;

    Object.values(satellitePointsRef.current).forEach(pts => {
      sceneGroupRef.current.remove(pts);
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
        const yOff = DISC_THICKNESS / 2 + 0.01 + (sat.altitude || 400) / 3000;
        const v = latLngToDiscVec3(sat.lat, sat.lng, yOff);
        positions.push(v.x, v.y, v.z);
      });
      if (positions.length === 0) return;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color,
        size: group === 'stations' ? 0.06 : 0.022,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });
      const pts = new THREE.Points(geo, mat);
      sceneGroupRef.current.add(pts);
      satellitePointsRef.current[group] = pts;
      satelliteDataRef.current[group] = sats;
    });
  }, [satellites, groupColors, activeGroups]);

  // Animation + orbit controls
  useEffect(() => {
    initScene();

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);

      if (!mouseRef.current.isDown) {
        targetRotRef.current.y += 0.001;
      }

      rotationRef.current.x += (targetRotRef.current.x - rotationRef.current.x) * 0.06;
      rotationRef.current.y += (targetRotRef.current.y - rotationRef.current.y) * 0.06;

      const cam = cameraRef.current;
      if (cam) {
        const z = zoomRef.current;
        const tx = rotationRef.current.x;
        const ty = rotationRef.current.y;
        cam.position.x = z * Math.sin(ty) * Math.cos(tx);
        cam.position.y = z * Math.sin(tx);
        cam.position.z = z * Math.cos(ty) * Math.cos(tx);
        cam.lookAt(0, 0, 0);
        // Smooth zoom
        const targetZ = zoomRef.current;
        const curZ = cam.position.length();
        if (Math.abs(targetZ - curZ) > 0.01) {
          cam.position.normalize().multiplyScalar(targetZ);
        }
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

  // Mouse events
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
      targetRotRef.current.y += dx * 0.005;
      targetRotRef.current.x = Math.max(-0.1, Math.min(Math.PI / 2, targetRotRef.current.x - dy * 0.005));
      mouseRef.current.prevX = e.clientX;
      mouseRef.current.prevY = e.clientY;
    };
    const onUp = (e) => {
      if (!mouseRef.current.hasMoved && onSatelliteClick) {
        const rect = container.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.params.Points.threshold = 0.05;
        raycaster.setFromCamera({ x: nx, y: ny }, cameraRef.current);
        const pts = Object.values(satellitePointsRef.current);
        const intersects = raycaster.intersectObjects(pts);
        if (intersects.length > 0) {
          const hit = intersects[0];
          const grp = Object.keys(satellitePointsRef.current).find(k => satellitePointsRef.current[k] === hit.object);
          const satData = satelliteDataRef.current[grp]?.[hit.index];
          if (satData) onSatelliteClick({ ...satData, group: grp });
        } else {
          onSatelliteClick(null);
        }
      }
      mouseRef.current.isDown = false;
    };
    const onWheel = (e) => {
      e.preventDefault();
      zoomRef.current = Math.max(2, Math.min(12, zoomRef.current + e.deltaY * 0.005));
    };
    const onResize = () => {
      if (!rendererRef.current || !cameraRef.current || !containerRef.current) return;
      const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
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