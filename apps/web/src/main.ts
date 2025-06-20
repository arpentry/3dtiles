import { TilesRenderer, EnvironmentControls } from '3d-tiles-renderer';
import { DebugTilesPlugin } from '3d-tiles-renderer/src/plugins/index.js';
import * as THREE from 'three';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';

const params = {
  errorTarget: 6,
  displayBoxBounds: true,
  displayRegionBounds: false,
  displaySphereBounds: false,
  maxDepth: 15,
  enableDebug: true,
};

// Initialize ThreeJS Scene
const scene = new THREE.Scene();

// Initialize ThreeJS Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x151c1f); // Darker background for terrain

document.body.appendChild(renderer.domElement);
renderer.domElement.tabIndex = 1;

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  1,
  10000, // Increased far plane for terrain
);
// Position camera for Swiss terrain - higher up to see the landscape
camera.position.set(400, 400, 400);

// controls
const controls = new EnvironmentControls(scene, camera, renderer.domElement);
controls.minZoom = 1;
controls.maxZoom = 5000;
controls.enableDamping = true;

// lights - enhanced lighting for terrain
const dirLight = new THREE.DirectionalLight(0xffffff, 4);
dirLight.position.set(1, 2, 3);
scene.add(dirLight);

const ambLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambLight);

// Create groups for geospatial positioning (following the example pattern)
const offsetParent = new THREE.Group();
scene.add(offsetParent);

const geospatialRotationParent = new THREE.Group();
offsetParent.add(geospatialRotationParent);

// Initialize TilesRenderer with 3D Tiles 1.0 tileset
const tilesRenderer = new TilesRenderer('http://localhost:8787/tileset.json'); // 3D Tiles 1.0 endpoint

// Register plugins for 3D Tiles 1.0
tilesRenderer.registerPlugin(new DebugTilesPlugin());

// Configure tiles renderer
tilesRenderer.fetchOptions.mode = 'cors';
tilesRenderer.lruCache.minSize = 900;
tilesRenderer.lruCache.maxSize = 1300;
tilesRenderer.errorTarget = params.errorTarget;
tilesRenderer.maxDepth = params.maxDepth;

// Add tiles to the geospatial rotation parent (for proper geographic positioning)
geospatialRotationParent.add(tilesRenderer.group);

onWindowResize();
window.addEventListener('resize', onWindowResize, false);

const gui = new GUI();

// Debug options
const debugFolder = gui.addFolder('Debug');
debugFolder.add(params, 'enableDebug');
debugFolder.add(params, 'displayBoxBounds');
debugFolder.add(params, 'displayRegionBounds');
debugFolder.add(params, 'displaySphereBounds');

// Tiles options
const tilesFolder = gui.addFolder('Tiles');
tilesFolder.add(params, 'errorTarget', 0, 50);
tilesFolder.add(params, 'maxDepth', 1, 25);

gui.open();

function renderLoop() {
  requestAnimationFrame(renderLoop);

  controls.update();
  camera.updateMatrixWorld();
  
  // Update tiles renderer parameters
  tilesRenderer.errorTarget = params.errorTarget;
  tilesRenderer.maxDepth = params.maxDepth;
  
  // Update debug plugin
  const debugPlugin = tilesRenderer.getPluginByName('DEBUG_TILES_PLUGIN') as DebugTilesPlugin;
  if (debugPlugin) {
    debugPlugin.enabled = params.enableDebug;
    debugPlugin.displayBoxBounds = params.displayBoxBounds;
    debugPlugin.displayRegionBounds = params.displayRegionBounds;
    debugPlugin.displaySphereBounds = params.displaySphereBounds;
  }

  // Handle geospatial positioning (similar to the NASA example)
  if (tilesRenderer.root && (tilesRenderer.root as any).boundingVolume?.region) {
    const box = new THREE.Box3();
    tilesRenderer.getOrientedBoundingBox(box, geospatialRotationParent.matrix);
    geospatialRotationParent.matrix.decompose(
      geospatialRotationParent.position,
      geospatialRotationParent.quaternion,
      geospatialRotationParent.scale
    );
    geospatialRotationParent.position.set(0, 0, 0);
    geospatialRotationParent.quaternion.invert();
    geospatialRotationParent.scale.set(1, 1, 1);
  }

  // Center the tiles
  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();
  
  if (tilesRenderer.getBoundingBox(box)) {
    box.getCenter(tilesRenderer.group.position);
    tilesRenderer.group.position.multiplyScalar(-1);
  } else if (tilesRenderer.getBoundingSphere(sphere)) {
    tilesRenderer.group.position.copy(sphere.center);
    tilesRenderer.group.position.multiplyScalar(-1);
  }

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
