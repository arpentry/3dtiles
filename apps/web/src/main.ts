// main.ts – original demo adapted to new ECEF tiles + basic lighting
// -----------------------------------------------------------------------------
// * Exactly the same imports (THREE, OrbitControls, TilesRenderer)
// * Keeps orientation helpers and verbose debug logs
// * Adds an AmbientLight + a DirectionalLight that follows the camera so
//   textured root tiles are no longer black.
// -----------------------------------------------------------------------------

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TilesRenderer } from '3d-tiles-renderer';

// -----------------------------------------------------------------------------
// 1. Scene & renderer boiler-plate
// -----------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setPixelRatio( window.devicePixelRatio );
document.body.style.margin = '0';
document.body.appendChild( renderer.domElement );

const scene   = new THREE.Scene();
scene.background = new THREE.Color( 0x202428 );

const camera  = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.1, 1e9 );
const control = new OrbitControls( camera, renderer.domElement );
control.enableDamping = true;

// -----------------------------------------------------------------------------
// 1b. Lights – minimal but sufficient
// -----------------------------------------------------------------------------

// Soft ambient to keep everything from going black
const ambient = new THREE.AmbientLight( 0xffffff, 2 );
scene.add( ambient );

// Directional light that follows the camera so the terrain is lit
const sun = new THREE.DirectionalLight( 0xffffff, 10 );
scene.add( sun );

// -----------------------------------------------------------------------------
// 2. TilesRenderer – load the tileset *without* shifting its group
// -----------------------------------------------------------------------------

const tilesUrl      = 'http://localhost:8787/tileset.json';
const tilesRenderer = new TilesRenderer( tilesUrl );

// Enable more aggressive LOD to force child tile loading
tilesRenderer.errorTarget = 3; // Reduced from 6 to force more aggressive LOD selection

scene.add( tilesRenderer.group ); // ← IMPORTANT: leave at origin (ECEF)

// -----------------------------------------------------------------------------
// 3. Orientation helpers – red box + yellow triangle
// -----------------------------------------------------------------------------

function addOrientationHelpers () {
  // Red wireframe cube centred at origin (size 2 000 × 500 × 2 000 m)
  const box   = new THREE.Mesh( new THREE.BoxGeometry( 2000, 500, 2000 ),
                               new THREE.MeshBasicMaterial( { color: 0xff0000, wireframe: true } ) );
  box.position.set( 0, 250, 0 );
  scene.add( box );

  // Yellow double-sided triangle a little higher
  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute( 'position', new THREE.Float32BufferAttribute( [
    -500, 0, -500,
     500, 0, -500,
       0, 0,  500
  ], 3 ) );
  triGeo.computeVertexNormals();
  const tri = new THREE.Mesh( triGeo, new THREE.MeshBasicMaterial( { color: 0xffff00, side: THREE.DoubleSide } ) );
  tri.position.set( 0, 800, 0 );
  scene.add( tri );

  console.log( 'Debug helpers added – red box @ (0,250,0), yellow triangle @ y=800' );
}
addOrientationHelpers();

// -----------------------------------------------------------------------------
// 4. Tile-load events – position camera when root is ready, verbose logs
// -----------------------------------------------------------------------------

tilesRenderer.addEventListener( 'load-tile-set', () => {
  console.log( '%cTileset loaded successfully', 'color: lime' );

  // Bounding sphere in world (ECEF) coords
  const sphere = new THREE.Sphere();
  tilesRenderer.getBoundingSphere( sphere );
  console.log( 'Root bounding sphere:', sphere );

  const r = sphere.radius;
  const c = sphere.center;

  // Camera 1.8 radii out along +X +Y +Z diagonal
  camera.position.set( c.x + r * 1.8, c.y + r * 1.8, c.z + r * 1.8 );
  camera.lookAt( c );
  control.target.copy( c );

  console.log( 'Camera positioned at:', camera.position );
  console.log( 'Camera distance to center:', camera.position.distanceTo( c ) );
} );

// Enhanced tile loading logs
tilesRenderer.addEventListener( 'load-model', e => {
  const { scene: model, tile } = e as any;
  
  console.group( `%cTile Loaded: Level ${tile.__level || 'unknown'}`, 'color: cyan' );
  console.log( 'Tile URI:', tile.content?.uri );
  console.log( 'Tile bounds:', tile.boundingVolume );
  console.log( 'Geometric error:', tile.geometricError );
  console.log( 'Transform matrix:', tile.transform );
  
  if ( model ) {
    let meshCount = 0;
    let vertexCount = 0;
    
    // Check world position and bounding box of the loaded model
    model.updateMatrixWorld();
    const box = new THREE.Box3().setFromObject( model );
    console.log( 'Model world bounding box:', box );
    console.log( 'Model world position:', model.position );
    console.log( 'Model world matrix:', model.matrixWorld );
    
    // Add a colored wireframe box to visualize each tile's position
    const tileHelper = new THREE.BoxHelper( model, 
      tile.content?.uri?.includes('/0/') ? 0xff0000 :  // Red for root
      tile.content?.uri?.includes('/1/') ? 0x00ff00 :  // Green for level 1
      0x0000ff ); // Blue for other levels
    scene.add( tileHelper );
    
    model.traverse( ( o: any ) => {
      if ( o.isMesh ) {
        meshCount++;
        vertexCount += o.geometry.attributes.position.count;
        console.log( '  Mesh:', o.name || '(unnamed)', 'verts:', o.geometry.attributes.position.count );
        
        // Check if mesh has valid geometry
        o.geometry.computeBoundingBox();
        console.log( '    Local bbox:', o.geometry.boundingBox );
      }
    } );
    console.log( `Total: ${meshCount} meshes, ${vertexCount} vertices` );
  }
  console.groupEnd();
} );

// Add tile visibility debugging
tilesRenderer.addEventListener( 'tile-visibility-change', e => {
  const { tile, visible } = e as any;
  console.log( `%cTile visibility: ${visible ? 'VISIBLE' : 'HIDDEN'}`, 
               visible ? 'color: green' : 'color: orange', 
               tile.content?.uri );
} );

// Add debugging for LOD selection
let lastDebugTime = 0;

// -----------------------------------------------------------------------------
// 5. Main render loop
// -----------------------------------------------------------------------------

function render () {
  requestAnimationFrame( render );

  control.update();

  // Keep the directional light on the camera so we always look "with the sun"
  sun.position.copy( camera.position );
  sun.target.position.copy( control.target );
  sun.target.updateMatrixWorld();

  tilesRenderer.setCamera( camera );
  tilesRenderer.setResolutionFromRenderer( camera, renderer );
  tilesRenderer.update();

  // Debug LOD information every 2 seconds
  const now = Date.now();
  if ( now - lastDebugTime > 2000 ) {
    lastDebugTime = now;
    console.log( '%cLOD Debug Info:', 'color: yellow' );
    console.log( 'Camera distance to target:', camera.position.distanceTo( control.target ) );
    console.log( 'Error target:', tilesRenderer.errorTarget );
    // Note: visibleTiles and downloadQueue properties may not be available in the API
  }

  renderer.render( scene, camera );
}
render();

// -----------------------------------------------------------------------------
// 6. Handle browser resize
// -----------------------------------------------------------------------------

window.addEventListener( 'resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
} );