import { TilesRenderer, EnvironmentControls } from '3d-tiles-renderer';
import * as THREE from 'three';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { DebugTilesPlugin } from '../node_modules/3d-tiles-renderer/src/plugins';

const params = {
  errorTarget: 6,
  displayBoxBounds: true,
};

// Initialize ThreeJS Scene
const scene = new THREE.Scene();

// Initialize ThreeJS Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xd8cec0);

document.body.appendChild(renderer.domElement);
renderer.domElement.tabIndex = 1;

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  1,
  4000,
);
camera.position.set(0, 1500, 0);
camera.lookAt(0, 0, 0);

// controls
const controls = new EnvironmentControls(scene, camera, renderer.domElement);
controls.minZoom = 2;
controls.cameraRadius = 1;
controls.enableDamping = true;

// lights
const dirLight = new THREE.DirectionalLight(0xffffff);
dirLight.position.set(1, 2, 3);
scene.add(dirLight);

const ambLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambLight);

const tilesParent = new THREE.Group();
tilesParent.rotation.set(Math.PI / 2, 0, 0);
scene.add(tilesParent);

const tilesRenderer = new TilesRenderer(
  'https://raw.githubusercontent.com/NASA-AMMOS/3DTilesSampleData/master/msl-dingo-gap/0528_0260184_to_s64o256_colorize/0528_0260184_to_s64o256_colorize/0528_0260184_to_s64o256_colorize_tileset.json',
);
tilesRenderer.registerPlugin(new DebugTilesPlugin());
tilesRenderer.fetchOptions.mode = 'cors';
tilesRenderer.lruCache.minSize = 900;
tilesRenderer.lruCache.maxSize = 1300;
tilesRenderer.errorTarget = 12;

// const tilesRenderer = new TilesRenderer(import.meta.env.VITE_TILESET_URL);
// tilesRenderer.setCamera(camera);
// tilesRenderer.setResolutionFromRenderer(camera, renderer);

tilesParent.add(tilesRenderer.group);
onWindowResize();
window.addEventListener('resize', onWindowResize, false);

const gui = new GUI();

gui.add(params, 'displayBoxBounds');
gui.add(params, 'errorTarget', 0, 100);
gui.open();

function renderLoop() {
  requestAnimationFrame(renderLoop);

  controls.update();
  camera.updateMatrixWorld();
  tilesRenderer.errorTarget = params.errorTarget;
  const debugPlugin = tilesRenderer.getPluginByName(
    'DEBUG_TILES_PLUGIN',
  ) as DebugTilesPlugin;
  debugPlugin.displayBoxBounds = params.displayBoxBounds;

  tilesRenderer.setCamera(camera);
  tilesRenderer.setResolutionFromRenderer(camera, renderer);
  tilesRenderer.update();

  renderer.render(scene, camera);
}

renderLoop();

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
}
