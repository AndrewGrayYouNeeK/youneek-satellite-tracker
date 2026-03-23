import React, { useRef, useEffect, useCallback } from 'react';
// satelliteDataRef maps group -> array of sat objects (same order as Points geometry)
import * as THREE from 'three';

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

export default function EarthGlobe({ satellites = [], groupColors = {}, activeGroups = [], zoomDelta = 0, onSatelliteClick }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const globeGroupRef = useRef(null); // single group that rotates everything
  const satellitePointsRef = useRef({});
  const satelliteDataRef = useRef({}); // group -> sat array (parallel to Points geometry)
  const animationRef = useRef(null);
  const mouseRef = useRef({ isDragging: false, prevX: 0, prevY: 0 });
  const rotationRef = useRef({ x: 0.3, y: 0 });
  const targetRotationRef = useRef({ x: 0.3, y: 0 });
  const zoomRef = useRef(2.8);
  const prevZoomDeltaRef = useRef(0);

  const initScene = useCallback(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = zoomRef.current;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Single pivot group for the entire globe (ocean + land + grid)
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    // ── Ocean sphere (dark blue) ──
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

    // ── Subtle lat/lng grid ──
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

    // ── Country land + borders from GeoJSON ──
    const landMat = new THREE.MeshPhongMaterial({
      color: 0x0e2540,
      emissive: 0x060f1e,
      specular: 0x112244,
      shininess: 4,
      side: THREE.FrontSide,
    });
    const borderMat = new THREE.LineBasicMaterial({ color: 0x2060a0, transparent: true, opacity: 0.85 });
    const coastMat  = new THREE.LineBasicMaterial({ color: 0x2a72b5, transparent: true, opacity: 0.95 });

    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
      .then(r => r.json())
      .then(geojson => {
        geojson.features.forEach(feature => {
          const geom = feature.geometry;
          const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
          polys.forEach(poly => {
            poly.forEach((ring, ringIdx) => {
              // Draw coastline / border line
              const pts = ring.map(([lng, lat]) => latLngToVector3(lat, lng, 1.003));
              globeGroup.add(new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(pts),
                ringIdx === 0 ? coastMat : borderMat
              ));

              // Fill land with fan triangulation from centroid
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
        // Fallback: simple continent lines
        const fallbackMat = new THREE.LineBasicMaterial({ color: 0x2a6499, transparent: true, opacity: 0.7 });
        const continents = [
          [[49,-125],[60,-140],[70,-160],[71,-155],[70,-140],[67,-135],[60,-115],[55,-80],[47,-60],[44,-65],[42,-70],[30,-82],[25,-80],[20,-90],[15,-90],[15,-85],[18,-88],[20,-97],[30,-115],[35,-120],[40,-124],[49,-125]],
          [[12,-70],[8,-62],[5,-52],[0,-50],[-5,-35],[-10,-37],[-23,-42],[-33,-52],[-40,-62],[-50,-70],[-55,-68],[-55,-65],[-50,-65],[-40,-58],[-35,-57],[-30,-50],[-20,-40],[-13,-38],[-5,-35],[-2,-42],[0,-48],[5,-55],[8,-60],[10,-65],[12,-70]],
          [[36,-5],[38,-5],[43,-9],[48,-5],[50,2],[53,5],[57,10],[60,5],[63,10],[70,20],[70,30],[60,30],[55,28],[47,30],[42,28],[37,25],[36,22],[38,15],[40,10],[43,5],[38,0],[36,-5]],
          [[37,-5],[35,-1],[32,10],[33,12],[30,32],[22,37],[12,44],[2,42],[-5,40],[-10,40],[-15,35],[-25,33],[-30,30],[-35,20],[-34,18],[-30,17],[-20,13],[-10,14],[-5,12],[0,10],[5,1],[5,-5],[10,-15],[15,-17],[20,-17],[25,-15],[30,-10],[35,-5],[37,-5]],
          [[42,28],[48,40],[40,50],[38,58],[25,62],[22,60],[15,55],[12,44],[22,37],[30,32],[33,36],[37,40],[42,50],[55,60],[55,70],[50,80],[42,75],[35,75],[25,68],[22,72],[22,80],[20,85],[22,88],[22,92],[20,95],[15,100],[5,105],[-5,110],[-8,115],[-7,120],[0,120],[5,115],[10,110],[15,108],[22,108],[25,105],[30,105],[35,110],[35,118],[38,118],[40,122],[42,130],[45,135],[48,140],[52,140],[55,135],[60,140],[63,140],[65,170],[68,180],[72,180],[75,140],[73,100],[70,70],[65,60],[60,60],[55,55],[48,40],[42,28]],
          [[-12,130],[-15,125],[-20,118],[-25,114],[-30,115],[-35,117],[-35,138],[-37,140],[-38,146],[-35,150],[-30,153],[-25,152],[-20,148],[-15,145],[-12,142],[-10,135],[-12,130]],
        ];
        continents.forEach(pts => {
          const points = pts.map(([lat, lng]) => latLngToVector3(lat, lng, 1.003));
          globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), fallbackMat));
        });
      });

    // ── Atmosphere glow ──
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
    scene.add(atmosphereMesh); // NOT in globeGroup — atmosphere stays fixed

    // ── Lights ──
    scene.add(new THREE.AmbientLight(0x223355, 0.7));
    const sun = new THREE.DirectionalLight(0xaaccff, 0.9);
    sun.position.set(5, 3, 5);
    scene.add(sun);

    // ── Stars ──
    const starPos = [];
    for (let i = 0; i < 3000; i++) {
      starPos.push((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200);
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.8 })));

  }, []);

  // Handle zoom button presses
  useEffect(() => {
    if (zoomDelta !== prevZoomDeltaRef.current) {
      prevZoomDeltaRef.current = zoomDelta;
      zoomRef.current = Math.max(1.5, Math.min(6, zoomRef.current + (zoomDelta > 0 ? -0.4 : 0.4)));
    }
  }, [zoomDelta]);

  // Update satellite positions
  useEffect(() => {
    if (!sceneRef.current || !globeGroupRef.current) return;

    // Remove old sat points from globe group
    Object.values(satellitePointsRef.current).forEach(pts => {
      globeGroupRef.current.remove(pts);
      pts.geometry.dispose();
      pts.material.dispose();
    });
    satellitePointsRef.current = {};

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
        const radius = 1.01 + (sat.altitude || 400) / 40000;
        const vec = latLngToVector3(sat.lat, sat.lng, radius);
        positions.push(vec.x, vec.y, vec.z);
      });
      if (positions.length === 0) return;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color,
        size: group === 'stations' ? 0.04 : 0.015,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pts = new THREE.Points(geo, mat);
      globeGroupRef.current.add(pts);
      satellitePointsRef.current[group] = pts;
    });
  }, [satellites, groupColors, activeGroups]);

  // Animation loop
  useEffect(() => {
    initScene();

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);

      if (!mouseRef.current.isDragging) targetRotationRef.current.y += 0.001;

      rotationRef.current.x += (targetRotationRef.current.x - rotationRef.current.x) * 0.05;
      rotationRef.current.y += (targetRotationRef.current.y - rotationRef.current.y) * 0.05;

      if (globeGroupRef.current) {
        globeGroupRef.current.rotation.x = rotationRef.current.x;
        globeGroupRef.current.rotation.y = rotationRef.current.y;
      }

      if (cameraRef.current) {
        cameraRef.current.position.z += (zoomRef.current - cameraRef.current.position.z) * 0.05;
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

  // Mouse / touch / resize events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onDown  = (e) => { mouseRef.current.isDragging = true; mouseRef.current.prevX = e.clientX; mouseRef.current.prevY = e.clientY; };
    const onUp    = ()  => { mouseRef.current.isDragging = false; };
    const onMove  = (e) => {
      if (!mouseRef.current.isDragging) return;
      const dx = e.clientX - mouseRef.current.prevX;
      const dy = e.clientY - mouseRef.current.prevY;
      targetRotationRef.current.y += dx * 0.005;
      targetRotationRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotationRef.current.x + dy * 0.005));
      mouseRef.current.prevX = e.clientX;
      mouseRef.current.prevY = e.clientY;
    };
    const onWheel = (e) => { e.preventDefault(); zoomRef.current = Math.max(1.5, Math.min(6, zoomRef.current + e.deltaY * 0.002)); };
    let lastPinchDist = null;
    const onTouchStart = (e) => {
      if (e.touches.length === 1) onDown({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
      if (e.touches.length === 2) lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    };
    const onTouchMove  = (e) => {
      if (e.touches.length === 1) onMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
      if (e.touches.length === 2 && lastPinchDist !== null) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        zoomRef.current = Math.max(1.5, Math.min(6, zoomRef.current - (dist - lastPinchDist) * 0.01));
        lastPinchDist = dist;
      }
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
    container.addEventListener('touchstart', onTouchStart);
    container.addEventListener('touchmove', onTouchMove);
    container.addEventListener('touchend', onUp);
    window.addEventListener('resize', onResize);

    return () => {
      container.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onUp);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }} />
  );
}