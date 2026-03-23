import React, { useRef, useEffect, useCallback } from 'react';
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

export default function EarthGlobe({ satellites = [], groupColors = {}, activeGroups = [], onSatelliteHover }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const earthRef = useRef(null);
  const atmosphereRef = useRef(null);
  const satellitePointsRef = useRef({});
  const animationRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0, isDragging: false, prevX: 0, prevY: 0 });
  const rotationRef = useRef({ x: 0.3, y: 0 });
  const targetRotationRef = useRef({ x: 0.3, y: 0 });
  const zoomRef = useRef(2.8);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseVecRef = useRef(new THREE.Vector2());

  const initScene = useCallback(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = zoomRef.current;
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Ocean (base sphere - dark blue)
    const oceanGeometry = new THREE.SphereGeometry(1, 64, 64);
    const oceanMaterial = new THREE.MeshPhongMaterial({
      color: 0x040d1a,
      emissive: 0x010508,
      specular: 0x0a1833,
      shininess: 40,
    });
    const ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
    scene.add(ocean);
    earthRef.current = ocean;

    // Grid lines (latitude/longitude) - subtle ocean grid
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x0a1f3d, transparent: true, opacity: 0.25 });
    for (let lat = -80; lat <= 80; lat += 20) {
      const points = [];
      for (let lng = 0; lng <= 360; lng += 2) {
        points.push(latLngToVector3(lat, lng - 180, 1.001));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial));
    }
    for (let lng = -180; lng < 180; lng += 30) {
      const points = [];
      for (let lat = -90; lat <= 90; lat += 2) {
        points.push(latLngToVector3(lat, lng, 1.001));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial));
    }

    // Load country GeoJSON and render land + borders
    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
      .then(r => r.json())
      .then(geojson => {
        const landMaterial = new THREE.MeshPhongMaterial({
          color: 0x0d2137,
          emissive: 0x050e1a,
          specular: 0x112244,
          shininess: 5,
          side: THREE.FrontSide,
        });
        const borderMaterial = new THREE.LineBasicMaterial({
          color: 0x1e4a7a,
          transparent: true,
          opacity: 0.8,
        });
        const coastMaterial = new THREE.LineBasicMaterial({
          color: 0x2a6499,
          transparent: true,
          opacity: 0.9,
        });

        geojson.features.forEach(feature => {
          const geom = feature.geometry;
          const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;

          polys.forEach(poly => {
            poly.forEach((ring, ringIdx) => {
              // Draw border lines
              const pts = ring.map(([lng, lat]) => latLngToVector3(lat, lng, 1.003));
              const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
              scene.add(new THREE.Line(lineGeo, ringIdx === 0 ? coastMaterial : borderMaterial));

              // Fill land polygon as a flat mesh (simplified fan triangulation)
              if (ringIdx === 0 && ring.length > 3) {
                const verts = [];
                const center = ring.reduce(([ax, ay], [x, y]) => [ax + x / ring.length, ay + y / ring.length], [0, 0]);
                const cVec = latLngToVector3(center[1], center[0], 1.002);
                for (let i = 0; i < ring.length - 1; i++) {
                  const v1 = latLngToVector3(ring[i][1], ring[i][0], 1.002);
                  const v2 = latLngToVector3(ring[i + 1][1], ring[i + 1][0], 1.002);
                  verts.push(cVec.x, cVec.y, cVec.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
                }
                const landGeo = new THREE.BufferGeometry();
                landGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
                landGeo.computeVertexNormals();
                scene.add(new THREE.Mesh(landGeo, landMaterial));
              }
            });
          });
        });
      })
      .catch(() => {
        // Fallback to simplified outlines if fetch fails
        addContinentOutlines(scene);
      });

    // Atmosphere glow
    const atmosphereGeometry = new THREE.SphereGeometry(1.08, 64, 64);
    const atmosphereMaterial = new THREE.ShaderMaterial({
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
          gl_FragColor = vec4(0.15, 0.5, 0.8, 1.0) * intensity;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphere);
    atmosphereRef.current = atmosphere;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x334466, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xccddff, 0.8);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);

    // Stars background
    const starsGeometry = new THREE.BufferGeometry();
    const starPositions = [];
    for (let i = 0; i < 3000; i++) {
      starPositions.push(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200
      );
    }
    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.8 });
    scene.add(new THREE.Points(starsGeometry, starsMaterial));

  }, []);

  function addContinentOutlines(scene) {
    // Simplified major continent boundary points
    const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x2a5a8a, transparent: true, opacity: 0.5 });

    // Define rough continent outlines
    const continents = [
      // North America (simplified)
      [
        [49, -125], [60, -140], [70, -160], [71, -155], [70, -140], [67, -135],
        [60, -115], [55, -80], [47, -60], [44, -65], [42, -70], [30, -82],
        [25, -80], [20, -90], [15, -90], [15, -85], [18, -88], [20, -97],
        [30, -115], [35, -120], [40, -124], [49, -125]
      ],
      // South America
      [
        [12, -70], [8, -62], [5, -52], [0, -50], [-5, -35], [-10, -37],
        [-23, -42], [-33, -52], [-40, -62], [-50, -70], [-55, -68], [-55, -65],
        [-50, -65], [-40, -58], [-35, -57], [-30, -50], [-20, -40], [-13, -38],
        [-5, -35], [-2, -42], [0, -48], [5, -55], [8, -60], [10, -65], [12, -70]
      ],
      // Europe
      [
        [36, -5], [38, -5], [43, -9], [48, -5], [50, 2], [53, 5], [57, 10],
        [60, 5], [63, 10], [70, 20], [70, 30], [60, 30], [55, 28], [47, 30],
        [42, 28], [37, 25], [36, 22], [38, 15], [40, 10], [43, 5], [38, 0], [36, -5]
      ],
      // Africa
      [
        [37, -5], [35, -1], [32, 10], [33, 12], [30, 32], [22, 37], [12, 44],
        [2, 42], [-5, 40], [-10, 40], [-15, 35], [-25, 33], [-30, 30],
        [-35, 20], [-34, 18], [-30, 17], [-20, 13], [-10, 14], [-5, 12],
        [0, 10], [5, 1], [5, -5], [10, -15], [15, -17], [20, -17], [25, -15],
        [30, -10], [35, -5], [37, -5]
      ],
      // Asia
      [
        [42, 28], [45, 40], [40, 50], [38, 58], [25, 62], [22, 60], [15, 55],
        [12, 44], [22, 37], [30, 32], [33, 36], [35, 36], [37, 40], [40, 45],
        [42, 50], [50, 55], [55, 60], [55, 70], [50, 80], [45, 80], [42, 75],
        [35, 75], [30, 70], [25, 68], [22, 72], [22, 80], [20, 85], [22, 88],
        [22, 92], [20, 95], [15, 100], [10, 98], [5, 105], [0, 105], [-5, 110],
        [-8, 115], [-7, 120], [0, 120], [5, 115], [10, 110], [15, 108],
        [22, 108], [25, 105], [30, 105], [35, 110], [35, 118], [38, 118],
        [40, 122], [42, 130], [45, 135], [48, 140], [52, 140], [55, 135],
        [60, 140], [63, 140], [65, 170], [68, 180], [72, 180], [75, 140],
        [73, 100], [70, 70], [65, 60], [60, 60], [55, 55], [48, 40], [42, 28]
      ],
      // Australia
      [
        [-12, 130], [-15, 125], [-20, 118], [-25, 114], [-30, 115], [-35, 117],
        [-35, 138], [-37, 140], [-38, 146], [-35, 150], [-30, 153], [-25, 152],
        [-20, 148], [-15, 145], [-12, 142], [-10, 135], [-12, 130]
      ],
    ];

    continents.forEach(pts => {
      const points = pts.map(([lat, lng]) => latLngToVector3(lat, lng, 1.003));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      scene.add(new THREE.Line(geometry, outlineMaterial));
    });
  }

  // Update satellite positions
  useEffect(() => {
    if (!sceneRef.current) return;

    const scene = sceneRef.current;

    // Remove old satellite points
    Object.values(satellitePointsRef.current).forEach(points => {
      scene.remove(points);
      points.geometry.dispose();
      points.material.dispose();
    });
    satellitePointsRef.current = {};

    // Group satellites by their group
    const groupedSats = {};
    satellites.forEach(sat => {
      const group = sat.group || 'unknown';
      if (!activeGroups.includes(group)) return;
      if (!groupedSats[group]) groupedSats[group] = [];
      groupedSats[group].push(sat);
    });

    // Create points for each group
    Object.entries(groupedSats).forEach(([group, sats]) => {
      const positions = [];
      const color = new THREE.Color(groupColors[group] || '#ffffff');

      sats.forEach(sat => {
        const radius = 1.01 + (sat.altitude || 400) / 40000;
        const vec = latLngToVector3(sat.lat, sat.lng, radius);
        positions.push(vec.x, vec.y, vec.z);
      });

      if (positions.length === 0) return;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({
        color,
        size: group === 'stations' ? 0.04 : 0.015,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const points = new THREE.Points(geometry, material);
      scene.add(points);
      satellitePointsRef.current[group] = points;
    });
  }, [satellites, groupColors, activeGroups]);

  // Animation loop
  useEffect(() => {
    initScene();

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);

      if (!mouseRef.current.isDragging) {
        targetRotationRef.current.y += 0.001;
      }

      rotationRef.current.x += (targetRotationRef.current.x - rotationRef.current.x) * 0.05;
      rotationRef.current.y += (targetRotationRef.current.y - rotationRef.current.y) * 0.05;

      if (earthRef.current) {
        earthRef.current.rotation.x = rotationRef.current.x;
        earthRef.current.rotation.y = rotationRef.current.y;
      }

      // Rotate satellite points with earth
      Object.values(satellitePointsRef.current).forEach(points => {
        points.rotation.x = rotationRef.current.x;
        points.rotation.y = rotationRef.current.y;
      });

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
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, [initScene]);

  // Event handlers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e) => {
      mouseRef.current.isDragging = true;
      mouseRef.current.prevX = e.clientX;
      mouseRef.current.prevY = e.clientY;
    };

    const handleMouseMove = (e) => {
      if (mouseRef.current.isDragging) {
        const dx = e.clientX - mouseRef.current.prevX;
        const dy = e.clientY - mouseRef.current.prevY;
        targetRotationRef.current.y += dx * 0.005;
        targetRotationRef.current.x += dy * 0.005;
        targetRotationRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotationRef.current.x));
        mouseRef.current.prevX = e.clientX;
        mouseRef.current.prevY = e.clientY;
      }
    };

    const handleMouseUp = () => {
      mouseRef.current.isDragging = false;
    };

    const handleWheel = (e) => {
      e.preventDefault();
      zoomRef.current = Math.max(1.5, Math.min(6, zoomRef.current + e.deltaY * 0.002));
    };

    // Touch support
    const handleTouchStart = (e) => {
      if (e.touches.length === 1) {
        mouseRef.current.isDragging = true;
        mouseRef.current.prevX = e.touches[0].clientX;
        mouseRef.current.prevY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e) => {
      if (mouseRef.current.isDragging && e.touches.length === 1) {
        const dx = e.touches[0].clientX - mouseRef.current.prevX;
        const dy = e.touches[0].clientY - mouseRef.current.prevY;
        targetRotationRef.current.y += dx * 0.005;
        targetRotationRef.current.x += dy * 0.005;
        targetRotationRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotationRef.current.x));
        mouseRef.current.prevX = e.touches[0].clientX;
        mouseRef.current.prevY = e.touches[0].clientY;
      }
    };

    const handleTouchEnd = () => {
      mouseRef.current.isDragging = false;
    };

    const handleResize = () => {
      if (!rendererRef.current || !cameraRef.current || !containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchmove', handleTouchMove);
    container.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('resize', handleResize);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
    />
  );
}