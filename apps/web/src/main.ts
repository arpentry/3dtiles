import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TilesRenderer } from '3d-tiles-renderer';
import { VertexNormalsHelper } from 'three/examples/jsm/helpers/VertexNormalsHelper.js';

// -----------------------------------------------------------------------------
// Scene setup
// -----------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x87ceeb); // Sky blue background
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 10;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.style.margin = '0';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  1,
  1e8,
);
const controls = new OrbitControls(camera, renderer.domElement);

// Simple controls setup
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 100;
controls.maxDistance = 1000000;

// -----------------------------------------------------------------------------
// Lighting
// -----------------------------------------------------------------------------

const ambientLight = new THREE.AmbientLight(0x404040, 50);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(0, 1, 0.3);
scene.add(directionalLight);

// -----------------------------------------------------------------------------
// 3D Tiles setup
// -----------------------------------------------------------------------------

const tilesUrl = 'http://localhost:8787/tileset.json';
const tilesRenderer = new TilesRenderer(tilesUrl);

// Debug-friendly settings
tilesRenderer.errorTarget = 50;
tilesRenderer.maxDepth = 10;
tilesRenderer.displayActiveTiles = true;

scene.add(tilesRenderer.group);

// State tracking
let tilesetLoaded = false;
let tilesLoadedCount = 0;
let tilesetBounds: THREE.Box3 | null = null;
let groundGrid: THREE.GridHelper | null = null;

// Store all VertexNormalsHelpers for toggling
const vertexNormalsHelpers: VertexNormalsHelper[] = [];
const tileHelpers = new Map();

// -----------------------------------------------------------------------------
// Debug helpers
// -----------------------------------------------------------------------------

function addCoordinateAxes() {
  // Large coordinate axes for reference
  const axesHelper = new THREE.AxesHelper(50000);
  scene.add(axesHelper);
  console.log(
    '📐 World axes visible. Red: X (East), Green: Y (Up/Elevation), Blue: Z (North).',
  );
}

function createGroundGrid(bounds: THREE.Box3) {
  // Remove old grid if exists
  if (groundGrid) {
    scene.remove(groundGrid);
  }

  // Create grid that matches the tileset bounds
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.z - bounds.min.z;
  const size = Math.max(width, height);
  const divisions = 20;

  groundGrid = new THREE.GridHelper(size, divisions, 0x888888, 0x444444);

  // Position grid at the center of the tileset bounds at ground level
  groundGrid.position.set(
    (bounds.max.x + bounds.min.x) / 2,
    bounds.min.y - 10, // Slightly below terrain
    (bounds.max.z + bounds.min.z) / 2,
  );

  scene.add(groundGrid);
  console.log('🔳 Ground grid created:', {
    size: size.toFixed(0),
    center: `(${groundGrid.position.x.toFixed(0)}, ${groundGrid.position.y.toFixed(0)}, ${groundGrid.position.z.toFixed(0)})`,
  });
}

function checkTileVisibility(model: THREE.Object3D, tileName: string) {
  // Check if tile is in camera frustum
  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  frustum.setFromProjectionMatrix(matrix);

  const box = new THREE.Box3().setFromObject(model);
  const isVisible = frustum.intersectsBox(box);

  const distance = camera.position.distanceTo(
    box.getCenter(new THREE.Vector3()),
  );

  console.log(
    `   👁️ ${tileName}: ${isVisible ? 'VISIBLE' : 'NOT VISIBLE'} in frustum, distance: ${distance.toFixed(0)}m`,
  );

  return isVisible;
}

// -----------------------------------------------------------------------------
// Camera positioning
// -----------------------------------------------------------------------------

function centerCameraOnBounds(bounds: THREE.Box3) {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  // Position camera further away to see the entire tileset
  const distance = maxDim * 4; // Increased from 2 to 4 for more distance
  camera.position.set(
    center.x,
    center.y + distance * 0.7, // Above and slightly back
    center.z + distance * 0.7,
  );

  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();

  console.log('📷 Camera centered on tileset:', {
    center: `(${center.x.toFixed(0)}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)})`,
    distance: distance.toFixed(0),
    bounds_size: `${size.x.toFixed(0)} × ${size.y.toFixed(0)} × ${size.z.toFixed(0)}`,
  });
}

// Initial position - moved further away for better overview
camera.position.set(0, 30000, 30000);
camera.lookAt(0, 0, 0);
controls.update();

addCoordinateAxes();

// -----------------------------------------------------------------------------
// Event handlers
// -----------------------------------------------------------------------------

tilesRenderer.addEventListener('load-tile-set', () => {
  tilesetLoaded = true;
  console.log('🎉 TILESET LOADED');

  // Wait a bit for tiles to potentially load, then recalculate bounds
  setTimeout(() => {
    // Calculate actual bounds from tileset content
    const box = new THREE.Box3();
    tilesRenderer.getBoundingBox(box);

    if (box.isEmpty()) {
      console.warn('⚠️ Empty bounding box, using sphere bounds');
      const sphere = new THREE.Sphere();
      tilesRenderer.getBoundingSphere(sphere);
      if (sphere.radius > 0) {
        box.setFromCenterAndSize(
          sphere.center,
          new THREE.Vector3(
            sphere.radius * 2,
            sphere.radius * 2,
            sphere.radius * 2,
          ),
        );
      }
    }

    // If still empty, calculate from loaded tile models
    if (box.isEmpty() && tilesRenderer.group.children.length > 0) {
      console.log('📦 Calculating bounds from loaded tiles...');
      tilesRenderer.group.traverse((child) => {
        if ((child as any).isMesh || child.type === 'Mesh') {
          const childBox = new THREE.Box3().setFromObject(child);
          box.union(childBox);
        }
      });
    }

    if (!box.isEmpty()) {
      tilesetBounds = box;
      console.log('📦 Final tileset bounds:', {
        min: `(${box.min.x.toFixed(0)}, ${box.min.y.toFixed(0)}, ${box.min.z.toFixed(0)})`,
        max: `(${box.max.x.toFixed(0)}, ${box.max.y.toFixed(0)}, ${box.max.z.toFixed(0)})`,
        size: `${(box.max.x - box.min.x).toFixed(0)} × ${(box.max.y - box.min.y).toFixed(0)} × ${(box.max.z - box.min.z).toFixed(0)}`,
      });

      centerCameraOnBounds(box);
      createGroundGrid(box);

      // Check visibility of all loaded tiles
      scene.children.forEach((child) => {
        if (child.name.startsWith('tile-box-')) {
          const tileModel = scene.children.find(
            (c) => c.name === child.name.replace('tile-box-', 'tile-'),
          );
          if (tileModel) {
            checkTileVisibility(tileModel, child.name);
          }
        }
      });
    } else {
      console.warn('⚠️ Could not determine tileset bounds');
    }
  }, 1000); // Wait 1 second for initial tiles to load
});

const material = new THREE.MeshStandardMaterial({
  color: 0xffffff,
});

// Compare two materials and log differences
function compareMaterials(matA: THREE.Material, matB: THREE.Material) {
  if (!matA || !matB) {
    console.log('One or both materials are undefined');
    return;
  }
  const keys = [
    'type',
    'color',
    'metalness',
    'roughness',
    'emissive',
    'map',
    'normalMap',
    'side',
    'transparent',
    'opacity',
    'vertexColors',
    'wireframe',
  ];
  keys.forEach((key) => {
    const a = (matA as any)[key];
    const b = (matB as any)[key];
    if (a !== b) {
      // Special handling for color objects
      if (a && a.isColor && b && b.isColor) {
        if (!a.equals(b)) {
          console.log(`Material difference in ${key}:`, a, b);
        }
      } else {
        console.log(`Material difference in ${key}:`, a, b);
      }
    }
  });
}

tilesRenderer.addEventListener('load-model', (event) => {
  tilesLoadedCount++;
  const { scene: model, tile } = event as any;

  // Unique key for the tile using its URI
  const tileKey = tile.content.uri;

  // Debug: Log material and normals
  model.traverse((obj: any) => {
    if (obj.isMesh) {
      // obj.material = material;
      console.log(material);
      console.log('Material:', obj.material);
      compareMaterials(material, obj.material);
      console.log('Normals:', obj.geometry.attributes.normal);
      // Add VertexNormalsHelper for visualization
      const helper = new VertexNormalsHelper(obj, 500, 0x00ff00);
      helper.visible = false; // Hide by default
      scene.add(helper);
      vertexNormalsHelpers.push(helper);
    }
  });

  console.log(
    `🏔️ TILE ${tilesLoadedCount} LOADED: ${tileKey}`,
  );

  if (model) {
    // Calculate and log model bounds
    const modelBox = new THREE.Box3().setFromObject(model);
    const modelSize = modelBox.getSize(new THREE.Vector3());
    const modelCenter = modelBox.getCenter(new THREE.Vector3());

    console.log(
      `   📍 Position: (${modelCenter.x.toFixed(0)}, ${modelCenter.y.toFixed(0)}, ${modelCenter.z.toFixed(0)})`,
    );
    console.log(
      `   📏 Size: ${modelSize.x.toFixed(0)} × ${modelSize.y.toFixed(0)} × ${modelSize.z.toFixed(0)}`,
    );

    // Count mesh details
    let meshCount = 0;
    let vertexCount = 0;
    model.traverse((obj: any) => {
      if (obj.isMesh) {
        meshCount++;
        if (obj.geometry?.attributes?.position) {
          vertexCount += obj.geometry.attributes.position.count;
        }
      }
    });
    console.log(`   🔺 ${meshCount} meshes, ${vertexCount} vertices`);

    // Add clear bounding box visualization
    const colors = [0x00ff00, 0xffa500, 0xff00ff, 0x00ffff, 0xffff00]; // Green, Orange, Magenta, Cyan, Yellow
    let level = 0;
    const uri = tile.content?.uri;
    if (uri) {
      const parts = uri.split('/');
      if (parts.length > 2 && parts[1] === 'tiles') {
        level = parseInt(parts[2], 10);
      }
    }
    const color = colors[level % colors.length];
    const boxHelper = new THREE.BoxHelper(model, color);
    boxHelper.name = `tile-box-${tileKey}`;
    scene.add(boxHelper);
    console.log(`   📦 Bounding box added (color: #${color.toString(16)})`);

    // Add a point at the tile center for reference
    const centerGeometry = new THREE.SphereGeometry(50, 8, 6);
    const centerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const centerPoint = new THREE.Mesh(centerGeometry, centerMaterial);
    centerPoint.position.copy(modelCenter);
    centerPoint.name = `tile-center-${tileKey}`;
    scene.add(centerPoint);
    console.log(`   🎯 Center point added (red sphere)`);

    // Store helpers for later removal
    tileHelpers.set(tileKey, { boxHelper, centerPoint });

    // Store reference to model for visibility checking
    model.name = `tile-model-${tileKey}`;

    // Check if this tile is visible
    checkTileVisibility(model, `TILE ${tileKey}`);
  }
});

tilesRenderer.addEventListener('tile-load-error', (event) => {
  console.error('❌ TILE LOAD ERROR:', event);
});

// -----------------------------------------------------------------------------
// Render loop
// -----------------------------------------------------------------------------

function animate() {
  requestAnimationFrame(animate);

  controls.update();

  // // Update lighting to follow camera
  // directionalLight.position
  //   .copy(camera.position)
  //   .normalize()
  //   .multiplyScalar(10000);

  // Update tiles
  tilesRenderer.setCamera(camera);
  tilesRenderer.setResolutionFromRenderer(camera, renderer);
  tilesRenderer.update();

  renderer.render(scene, camera);
}

animate();

// -----------------------------------------------------------------------------
// Window resize
// -----------------------------------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// -----------------------------------------------------------------------------
// Keyboard controls
// -----------------------------------------------------------------------------

window.addEventListener('keydown', (event) => {
  switch (event.key.toLowerCase()) {
    case 'c':
      // Center on tileset
      if (tilesetBounds) {
        centerCameraOnBounds(tilesetBounds);
        console.log('🎯 Centered on tileset');
      } else {
        console.warn('⚠️ No tileset bounds available');
      }
      break;

    case 't':
      // Top-down view
      if (tilesetBounds) {
        const center = tilesetBounds.getCenter(new THREE.Vector3());
        const size = tilesetBounds.getSize(new THREE.Vector3());
        camera.position.set(
          center.x,
          center.y + Math.max(size.x, size.z) * 3, // Increased from 1.5 to 3 for more distance
          center.z,
        );
        camera.lookAt(center);
        controls.target.copy(center);
        controls.update();
        console.log('📐 Top-down view');
      }
      break;

    case 'f':
      // Find tiles - go to first loaded tile
      const firstTile = scene.children.find((child) =>
        child.name.startsWith('tile-center-'),
      );
      if (firstTile) {
        camera.position.copy(firstTile.position);
        camera.position.y += 1000; // Move up
        camera.position.z += 1000; // Move back
        camera.lookAt(firstTile.position);
        controls.target.copy(firstTile.position);
        controls.update();
        console.log('🔍 Moved to first tile position');
      } else {
        console.warn('⚠️ No tiles loaded yet');
      }
      break;

    case 'v':
      // Check visibility of all tiles
      console.log('👁️ VISIBILITY CHECK:');
      scene.children.forEach((child) => {
        if (child.name.startsWith('tile-center-')) {
          const tileKey = child.name.replace('tile-center-', '');
          const tileModel = scene.children.find(
            (c) => c.name === `tile-model-${tileKey}`,
          );
          if (tileModel) {
            checkTileVisibility(tileModel, `TILE ${tileKey}`);
          }
        }
      });
      break;

    case 'g':
      // Toggle grid
      if (groundGrid) {
        groundGrid.visible = !groundGrid.visible;
        console.log(`🔳 Grid ${groundGrid.visible ? 'visible' : 'hidden'}`);
      }
      break;

    case 'a':
      // Toggle axes
      const axes = scene.children.find(
        (child) => child instanceof THREE.AxesHelper,
      );
      if (axes) {
        axes.visible = !axes.visible;
        console.log(`📐 Axes ${axes.visible ? 'visible' : 'hidden'}`);
      }
      break;

    case 'b':
      // Toggle bounding boxes
      scene.children.forEach((child) => {
        if (child.name.startsWith('tile-box-')) {
          child.visible = !child.visible;
        }
      });
      console.log('📦 Tile bounding boxes toggled');
      break;

    case 'p':
      // Toggle center points
      scene.children.forEach((child) => {
        if (child.name.startsWith('tile-center-')) {
          child.visible = !child.visible;
        }
      });
      console.log('🎯 Tile center points toggled');
      break;

    case 'd':
      // Toggle debug tiles outline
      tilesRenderer.displayActiveTiles = !tilesRenderer.displayActiveTiles;
      console.log(
        `🐛 Debug tiles ${tilesRenderer.displayActiveTiles ? 'enabled' : 'disabled'}`,
      );
      break;

    case 'n':
      // Toggle vertex normals helpers
      if (vertexNormalsHelpers.length > 0) {
        const visible = !vertexNormalsHelpers[0].visible;
        vertexNormalsHelpers.forEach((helper) => (helper.visible = visible));
        console.log(`🔺 Vertex normals ${visible ? 'visible' : 'hidden'}`);
      } else {
        console.log('⚠️ No vertex normals helpers loaded yet');
      }
      break;

    case 'i':
      // Print info
      console.log('ℹ️ CURRENT STATE:');
      console.log('   Camera:', camera.position);
      console.log('   Target:', controls.target);
      console.log('   Tileset loaded:', tilesetLoaded);
      console.log('   Tiles loaded:', tilesLoadedCount);
      console.log('   Scene objects:', scene.children.length);
      if (tilesetBounds) {
        const center = tilesetBounds.getCenter(new THREE.Vector3());
        const size = tilesetBounds.getSize(new THREE.Vector3());
        console.log('   Tileset center:', center);
        console.log('   Tileset size:', size);
      }
      break;

    case 'h':
      console.log(`
🎮 DEBUG CONTROLS:
  C - Center camera on tileset
  T - Top-down view  
  F - Find and go to first tile
  V - Check visibility of all tiles
  G - Toggle ground grid
  A - Toggle coordinate axes
  B - Toggle tile bounding boxes
  P - Toggle tile center points
  D - Toggle debug tile outlines
  N - Toggle vertex normals helpers
  I - Print current state info
  H - Show this help

🔧 DEBUG FEATURES:
  ✅ Tileset loaded: ${tilesetLoaded}
  ✅ Tiles loaded: ${tilesLoadedCount}
  ✅ Ground grid aligned to tileset
  ✅ Tile bounding boxes (green)
  ✅ Tile center points (red spheres)
  ✅ Coordinate axes (R=East, G=Up, B=North)
  ✅ Frustum visibility checking
  ✅ Vertex normals helpers (green lines, N to toggle)
      `);
      break;
  }
});

// -----------------------------------------------------------------------------
// Status display
// -----------------------------------------------------------------------------

console.log('�� SIMPLIFIED 3D TILES VIEWER (DEBUG MODE)');
console.log('📡 Loading tileset:', tilesUrl);
console.log(
  '⌨️  Press H for help, C to center, F to find tiles, V to check visibility',
);
console.log(
  '🎯 Features: Ground grid, tile boxes, center points, coordinate axes, visibility check',
);
