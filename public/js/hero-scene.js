/**
 * IPA Installer — Three.js Hero Scene
 * Floating geometric shapes with cyberpunk glow, reacting to drag-and-drop.
 * Uses Three.js via CDN (ES module import map in HTML).
 */

import * as THREE from 'three';

export function initHeroScene(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  // --- Setup ---
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(0, 0, 6);

  // --- Lights ---
  const ambientLight = new THREE.AmbientLight(0x1a1a2e, 0.5);
  scene.add(ambientLight);

  // Main purple point light
  const purpleLight = new THREE.PointLight(0xa855f7, 2.5, 20);
  purpleLight.position.set(2, 2, 4);
  scene.add(purpleLight);

  // Secondary pink accent
  const pinkLight = new THREE.PointLight(0xec4899, 1.5, 15);
  pinkLight.position.set(-3, -1, 3);
  scene.add(pinkLight);

  // Cool blue rim
  const blueLight = new THREE.PointLight(0x7c3aed, 1.2, 18);
  blueLight.position.set(0, -3, 2);
  scene.add(blueLight);

  // --- Materials ---
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xa855f7,
    metalness: 0.1,
    roughness: 0.05,
    transmission: 0.92,
    thickness: 0.5,
    ior: 1.5,
    envMapIntensity: 1,
    transparent: true,
    opacity: 0.6,
  });

  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0xa855f7,
    wireframe: true,
    transparent: true,
    opacity: 0.08,
  });

  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xc084fc,
    transparent: true,
    opacity: 0.15,
  });

  // --- Create floating objects ---
  const objects = [];

  // Central icosahedron
  const icoGeo = new THREE.IcosahedronGeometry(1.1, 1);
  const icoMesh = new THREE.Mesh(icoGeo, glassMaterial);
  icoMesh.position.set(0, 0.3, 0);
  scene.add(icoMesh);
  objects.push({
    mesh: icoMesh,
    basePos: icoMesh.position.clone(),
    rotSpeed: { x: 0.003, y: 0.005, z: 0.002 },
    floatSpeed: 0.6,
    floatAmp: 0.15,
  });

  // Wireframe icosahedron (larger, slower)
  const wireIco = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.8, 1),
    wireframeMaterial,
  );
  wireIco.position.set(0, 0.3, 0);
  scene.add(wireIco);
  objects.push({
    mesh: wireIco,
    basePos: wireIco.position.clone(),
    rotSpeed: { x: -0.001, y: 0.003, z: -0.001 },
    floatSpeed: 0.4,
    floatAmp: 0.1,
  });

  // Small floating octahedra
  const smallGeo = new THREE.OctahedronGeometry(0.22, 0);
  const smallPositions = [
    { x: -2.2, y: 1.4, z: -1 },
    { x: 2.5, y: -0.8, z: -0.5 },
    { x: -1.8, y: -1.5, z: 0.5 },
    { x: 1.6, y: 1.8, z: -1.5 },
    { x: 3.0, y: 0.5, z: -2 },
    { x: -2.8, y: -0.3, z: -1.5 },
  ];

  smallPositions.forEach((pos, i) => {
    const mat = glowMaterial.clone();
    mat.opacity = 0.12 + Math.random() * 0.1;
    const mesh = new THREE.Mesh(smallGeo, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.scale.setScalar(0.6 + Math.random() * 0.8);
    scene.add(mesh);
    objects.push({
      mesh,
      basePos: mesh.position.clone(),
      rotSpeed: {
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.02,
        z: (Math.random() - 0.5) * 0.015,
      },
      floatSpeed: 0.3 + Math.random() * 0.5,
      floatAmp: 0.1 + Math.random() * 0.15,
      phase: Math.random() * Math.PI * 2,
    });
  });

  // Ring (torus)
  const torusGeo = new THREE.TorusGeometry(0.6, 0.03, 16, 60);
  const torusMat = new THREE.MeshBasicMaterial({
    color: 0xec4899,
    transparent: true,
    opacity: 0.2,
  });
  const torus = new THREE.Mesh(torusGeo, torusMat);
  torus.position.set(0, 0.3, 0);
  torus.rotation.x = Math.PI * 0.35;
  scene.add(torus);
  objects.push({
    mesh: torus,
    basePos: torus.position.clone(),
    rotSpeed: { x: 0, y: 0, z: 0.008 },
    floatSpeed: 0.5,
    floatAmp: 0.08,
  });

  // Second ring
  const torus2 = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.02, 16, 80),
    new THREE.MeshBasicMaterial({
      color: 0x7c3aed,
      transparent: true,
      opacity: 0.12,
    }),
  );
  torus2.position.set(0, 0.3, 0);
  torus2.rotation.x = Math.PI * 0.6;
  torus2.rotation.y = Math.PI * 0.2;
  scene.add(torus2);
  objects.push({
    mesh: torus2,
    basePos: torus2.position.clone(),
    rotSpeed: { x: 0, y: 0.004, z: -0.006 },
    floatSpeed: 0.35,
    floatAmp: 0.06,
  });

  // --- Particle field ---
  const particleCount = 120;
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 12;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 2;
    sizes[i] = Math.random() * 2 + 0.5;
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const particleMat = new THREE.PointsMaterial({
    color: 0xa855f7,
    size: 0.02,
    transparent: true,
    opacity: 0.4,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  });

  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // --- State ---
  let mouseX = 0;
  let mouseY = 0;
  let targetMouseX = 0;
  let targetMouseY = 0;
  let isDragging = false;
  let dragIntensity = 0;
  let uploadSuccess = false;
  let successIntensity = 0;
  const clock = new THREE.Clock();

  // --- Mouse tracking ---
  document.addEventListener('mousemove', (e) => {
    targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    targetMouseY = -(e.clientY / window.innerHeight - 0.5) * 2;
  });

  // --- Resize ---
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // --- Animation loop ---
  function animate() {
    requestAnimationFrame(animate);

    const elapsed = clock.getElapsedTime();

    // Smooth mouse follow
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;

    // Smooth drag intensity
    const targetDrag = isDragging ? 1 : 0;
    dragIntensity += (targetDrag - dragIntensity) * 0.08;

    // Success intensity
    const targetSuccess = uploadSuccess ? 1 : 0;
    successIntensity += (targetSuccess - successIntensity) * 0.05;

    // Animate objects
    objects.forEach((obj) => {
      const phase = obj.phase || 0;

      // Rotation
      obj.mesh.rotation.x += obj.rotSpeed.x * (1 + dragIntensity * 2);
      obj.mesh.rotation.y += obj.rotSpeed.y * (1 + dragIntensity * 2);
      obj.mesh.rotation.z += obj.rotSpeed.z * (1 + dragIntensity * 2);

      // Floating
      obj.mesh.position.y =
        obj.basePos.y +
        Math.sin(elapsed * obj.floatSpeed + phase) * obj.floatAmp;
      obj.mesh.position.x =
        obj.basePos.x +
        Math.cos(elapsed * obj.floatSpeed * 0.7 + phase) * obj.floatAmp * 0.5;

      // Parallax from mouse
      obj.mesh.position.x += mouseX * 0.15;
      obj.mesh.position.y += mouseY * 0.1;
    });

    // Particle drift
    const posArray = particleGeo.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      posArray[i * 3 + 1] += Math.sin(elapsed * 0.3 + i) * 0.0005;
      posArray[i * 3] += Math.cos(elapsed * 0.2 + i * 0.5) * 0.0003;
    }
    particleGeo.attributes.position.needsUpdate = true;

    // Light animations
    purpleLight.intensity = 2.5 + Math.sin(elapsed * 0.8) * 0.5 + dragIntensity * 2;
    pinkLight.intensity = 1.5 + Math.cos(elapsed * 0.6) * 0.3 + dragIntensity * 1.5;
    blueLight.intensity = 1.2 + Math.sin(elapsed * 1.1) * 0.2;

    // Drag effect: increase glow
    purpleLight.color.setHex(
      dragIntensity > 0.5 ? 0xc084fc : 0xa855f7,
    );
    particleMat.opacity = 0.4 + dragIntensity * 0.3;

    // Success effect: turn green briefly
    if (successIntensity > 0.01) {
      const greenMix = successIntensity;
      purpleLight.color.lerp(new THREE.Color(0x34d399), greenMix * 0.5);
    }

    // Camera subtle sway
    camera.position.x = mouseX * 0.3;
    camera.position.y = mouseY * 0.2;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  animate();

  // --- Public API ---
  return {
    setDragging(value) {
      isDragging = value;
    },
    triggerSuccess() {
      uploadSuccess = true;
      setTimeout(() => {
        uploadSuccess = false;
      }, 3000);
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    },
  };
}
