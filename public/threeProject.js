import * as THREE from '../build/three.module.js';
import { GLTFLoader } from './jsm/loaders/GLTFLoader.js';
import { RGBELoader } from './jsm/loaders/RGBELoader.js';

import { GUI } from './jsm/libs/dat.gui.module.js';

import { BokehShader, BokehDepthShader } from './jsm/shaders/BokehShader2.js';

//------------------------------------------------------------------------------

// Base
let scene, camera, renderer;

// Bokeh
const postprocessing = { enabled: true };
let materialDepth, effectController;

const shaderSettings = {
  rings: 4,
  samples: 5,
};

//------------------------------------------------------------------------------

// Canvas
const canvas = document.getElementById('canvas');
const width = canvas.clientWidth;
const height = canvas.clientHeight;

//------------------------------------------------------------------------------

// glb object (pushed)
const glbObject = [];

//------------------------------------------------------------------------------

// Texture loader
const textureLoader = new THREE.TextureLoader();

// Material
function glbMaterial() {
  const diffuse = textureLoader.load('./glb/blue_baseColor.png');
  diffuse.encoding = THREE.sRGBEncoding;
  diffuse.flipY = false;

  const normalMap = textureLoader.load('./glb/blue_normal.png');
  diffuse.flipY = false;

  const occRoughMet = textureLoader.load(
    './glb/blue_occlusionRoughnessMetallic.png'
  );
  occRoughMet.flipY = false;

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: diffuse,
    normalMap: normalMap,
    aoMap: occRoughMet,
    roughnessMap: occRoughMet,
    roughness: 1, // do not adjust
    metalnessMap: occRoughMet,
    metalness: 1, // do not adjust
    envMapIntensity: 1, // Default value
  });

  return mat;
}

//------------------------------------------------------------------------------

init();
animate();

//------------------------------------------------------------------------------
//------------------------------------------------------------------------------
//------------------------------------------------------------------------------

function init() {
  // Scene
  scene = new THREE.Scene();

  // Fog
  scene.fog = new THREE.Fog(0x0d0d0e, 0.7, 17, 4000);

  // Camera
  camera = new THREE.PerspectiveCamera(70, width / height, 1, 10);
  camera.position.z = 5;

  // Renderer
  renderer = new THREE.WebGLRenderer({
    antialias: false,
    canvas: canvas,
    alpha: false,
  });

  // Canvas background color
  renderer.setClearColor(0x0d0d0e, 1);

  // Tone mapping
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputEncoding = THREE.sRGBEncoding;

  // Light settings
  renderer.physicallyCorrectLights = true;

  // Shadow settings
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  //------------------------------------------------------------------------------

  // HDRI
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  new RGBELoader()
    .setDataType(THREE.UnsignedByteType)
    .setPath('hdr/')
    .load('sunflowers_1k.hdr', function (texture) {
      const envMap = pmremGenerator.fromEquirectangular(texture).texture;

      //scene.background = envMap;
      scene.environment = envMap;

      texture.dispose();
      pmremGenerator.dispose();

      // -------------------------------------

      // 3D Model
      const loader = new GLTFLoader().setPath('glb/');
      loader.load('blue.glb', function (geometry) {
        const theScene = geometry.scene.children[0];
        theScene.getObjectByName('test').material = glbMaterial();

        glbObject.push(theScene.getObjectByName('test'));

        scene.add(theScene);
      });

      // -------------------------------------
    });

  //------------------------------------------------------------------------------

  const depthShader = BokehDepthShader;

  materialDepth = new THREE.ShaderMaterial({
    uniforms: depthShader.uniforms,
    vertexShader: depthShader.vertexShader,
    fragmentShader: depthShader.fragmentShader,
  });

  materialDepth.uniforms['mNear'].value = camera.near;
  materialDepth.uniforms['mFar'].value = camera.far;

  initPostprocessing();

  effectController = {
    enabled: true,
    focalDepth: 3.9,
    fstop: 17.85,
    maxblur: 1.45,
    vignetting: true,
    depthblur: false,
    threshold: 0.5,
    gain: 6.0,
    bias: 0.5,
    fringe: 0.7,
    focalLength: 35,
    noise: true,
    dithering: 0.0001,

    shaderFocus: false,
    showFocus: false,
    manualdof: false,
    pentagon: false,
  };

  const matChanger = function () {
    for (const e in effectController) {
      if (e in postprocessing.bokeh_uniforms) {
        postprocessing.bokeh_uniforms[e].value = effectController[e];
      }
    }

    postprocessing.enabled = effectController.enabled;
    postprocessing.bokeh_uniforms['znear'].value = camera.near;
    postprocessing.bokeh_uniforms['zfar'].value = camera.far;
    camera.setFocalLength(effectController.focalLength);
  };

  const gui = new GUI();

  gui.add(effectController, 'enabled').onChange(matChanger);
  gui
    .add(effectController, 'focalDepth', 0.0, 200.0)
    .listen()
    .onChange(matChanger);

  gui.add(effectController, 'fstop', 0.1, 22, 0.001).onChange(matChanger);
  gui.add(effectController, 'maxblur', 0.0, 5.0, 0.025).onChange(matChanger);

  gui.add(effectController, 'vignetting').onChange(matChanger);

  gui.add(effectController, 'depthblur').onChange(matChanger);

  gui.add(effectController, 'threshold', 0, 1, 0.001).onChange(matChanger);
  gui.add(effectController, 'gain', 0, 100, 0.001).onChange(matChanger);
  gui.add(effectController, 'bias', 0, 3, 0.001).onChange(matChanger);
  gui.add(effectController, 'fringe', 0, 5, 0.001).onChange(matChanger);

  gui.add(effectController, 'focalLength', 16, 80, 0.001).onChange(matChanger);

  gui.add(effectController, 'noise').onChange(matChanger);

  gui.add(effectController, 'dithering', 0, 0.001, 0.0001).onChange(matChanger);

  gui.add(shaderSettings, 'rings', 1, 8).step(1).onChange(shaderUpdate);
  gui.add(shaderSettings, 'samples', 1, 13).step(1).onChange(shaderUpdate);
  gui.close();

  matChanger();
}

//------------------------------------------------------------------------------
//------------------------------------------------------------------------------
//------------------------------------------------------------------------------

function initPostprocessing() {
  postprocessing.scene = new THREE.Scene();

  postprocessing.camera = new THREE.OrthographicCamera(
    width / -2,
    width / 2,
    height / 2,
    height / -2,
    -10000,
    10000
  );
  postprocessing.camera.position.z = 100;

  postprocessing.scene.add(postprocessing.camera);

  const pars = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBFormat,
  };

  postprocessing.rtTextureDepth = new THREE.WebGLRenderTarget(
    width,
    height,
    pars
  );

  postprocessing.rtTextureColor = new THREE.WebGLRenderTarget(
    width,
    height,
    pars
  );

  const bokeh_shader = BokehShader;

  postprocessing.bokeh_uniforms = THREE.UniformsUtils.clone(
    bokeh_shader.uniforms
  );

  postprocessing.bokeh_uniforms['tColor'].value =
    postprocessing.rtTextureColor.texture;
  postprocessing.bokeh_uniforms['tDepth'].value =
    postprocessing.rtTextureDepth.texture;
  postprocessing.bokeh_uniforms['textureWidth'].value = window.innerWidth;
  postprocessing.bokeh_uniforms['textureHeight'].value = window.innerHeight;

  postprocessing.materialBokeh = new THREE.ShaderMaterial({
    uniforms: postprocessing.bokeh_uniforms,
    vertexShader: bokeh_shader.vertexShader,
    fragmentShader: bokeh_shader.fragmentShader,
    defines: {
      RINGS: shaderSettings.rings,
      SAMPLES: shaderSettings.samples,
    },
  });

  postprocessing.quad = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    postprocessing.materialBokeh
  );

  postprocessing.quad.position.z = -500;
  postprocessing.scene.add(postprocessing.quad);
}

function shaderUpdate() {
  postprocessing.materialBokeh.defines.RINGS = shaderSettings.rings;
  postprocessing.materialBokeh.defines.SAMPLES = shaderSettings.samples;
  postprocessing.materialBokeh.needsUpdate = true;
}

// Animate
function animate() {
  requestAnimationFrame(animate);

  // Resize
  if (canvas.width !== width || canvas.height !== height) {
    renderer.setSize(width, height, false);

    postprocessing.rtTextureDepth.setSize(width, height);
    postprocessing.rtTextureColor.setSize(width, height);

    postprocessing.bokeh_uniforms['textureWidth'].value = width;
    postprocessing.bokeh_uniforms['textureHeight'].value = height;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    console.log(width + ' PX');
  }

  // -------------------------------------

  // glb animation
  const time = -performance.now() / 1000;

  for (let i = 0; i < glbObject.length; i++) {
    glbObject[i].rotation.x = (time / 7) * Math.PI;
  }

  // -------------------------------------

  if (postprocessing.enabled) {
    renderer.clear();

    renderer.setRenderTarget(postprocessing.rtTextureColor);
    renderer.clear();
    renderer.render(scene, camera);

    scene.overrideMaterial = materialDepth;
    renderer.setRenderTarget(postprocessing.rtTextureDepth);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;

    renderer.setRenderTarget(null);
    renderer.render(postprocessing.scene, postprocessing.camera);
  } else {
    scene.overrideMaterial = null;

    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, camera);
  }
}
