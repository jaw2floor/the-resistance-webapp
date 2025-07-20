import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

let scene, camera, renderer;
const cubes = [];

export function init3DBoard(container) {
  const width = container.clientWidth || 300;
  const height = container.clientHeight || 300;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  camera.position.z = 5;

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 5; i++) {
    const material = new THREE.MeshBasicMaterial({ color: 0x888888 });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.x = (i - 2) * 1.5;
    cubes.push(cube);
    scene.add(cube);
  }

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  cubes.forEach((cube) => {
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
  });
  renderer.render(scene, camera);
}

export function updateMission3D(index, result) {
  const cube = cubes[index - 1];
  if (!cube) return;
  let color = 0x888888;
  if (result === 'success') color = 0x28a745;
  else if (result === 'fail') color = 0xd32f2f;
  cube.material.color.setHex(color);
}
