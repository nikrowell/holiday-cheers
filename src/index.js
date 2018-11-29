import { Renderer, Camera, Transform, Geometry, Mesh, Program, Color, Vec2 } from 'ogl';
import { glsl, fill, flatten, random } from './utils';

// https://github.com/oframe/ogl/blob/master/src/core/Renderer.js
const renderer = new Renderer({
  dpr: window.devicePixelRatio,
  webgl: 1,
  alpha: true
});

// WebGL rendering context with a transparent clear color
// so the subtle body background gradient shows through
// not sure if there are performance implications with this
// I suppose the background could be a big plane or triangle shader
const gl = renderer.gl;
gl.clearColor(1,1,1,0);

// Not sure what the best practice is for camera settings...
const camera = new Camera(gl, {
  fov: 45,
  near: 0.1,
  far: 5000
});

camera.position.set(0, 0, 100);

// Transforms are essentially 3D object containers with position, rotation, scale, children etc
// and are the base class that Camera and Mesh extend
const scene = new Transform();

const uniforms = {
  resolution: {value: new Vec2()},
  mouse: {value: new Vec2()},
  time: {value: 0},
};

// https://www.schemecolor.com/white-christmas.php
// convert colors to Color instances, which are essentially normalized r, g, b arrays
const colors = ['930101', 'DF0000', 'D9DFDC', 'B0BFC2'].map(hex => new Color(hex));

// function to generate ImageData of text from an offscreen canvas
// https://developer.mozilla.org/en-US/docs/Web/API/ImageData
function getTextBitmap(text) {

  text = text.toUpperCase();
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const fontSize = Math.min(window.innerWidth / (text.length * 2), 80);

  // Rubik-specific values that tighten up the bounding box
  // for single line text independent of font size
  // TODO: load Rubik via webfontloader before calling init() when not running locally?
  // or maybe a different font with slightly lighter weight and tighter kerning?
  const crop = {
    x: -0.04,
    y: -0.21,
    width: 0.985,
    height: 0.75
  };

  // after setting the font initially, we resize the canvas to
  // the bounding box of the text to save some cycles and avoid looping through
  // an entire screen's worth of empty pixels. Need to do this twice because
  // resizing the canvas will kill the font settings below
  const setFont = () => {
    context.font = `900 ${fontSize}px Rubik`;
    context.textAlign = 'left';
    context.textBaseline = 'top';
  };

  setFont();
  canvas.width = Math.ceil(context.measureText(text).width) * crop.width;
  canvas.height = Math.ceil(fontSize) * crop.height;
  setFont();
  context.fillText(text, crop.x * fontSize, crop.y * fontSize);

  // debugging
  // canvas.style.cssText = 'position:absolute;z-index:1;left:20px;bottom:20px;outline:#F00 1px dotted;';
  // document.body.appendChild(canvas);

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function getTextPositions({width, height, data:pixels}) {

  const positions = [];

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const index = (x + y * width) * 4;
      const alpha = pixels[index + 3];
      alpha && positions.push([x, y]);
    }
  }

  return positions;
}

const bitmap = getTextBitmap('Cheers');
// get an array of x, y positions from our bitmap where alpha > 0
const positions = getTextPositions(bitmap)
  .filter(pos => {
    // filter our ~30k positions down by 60%
    return random() < 0.5;
  })
  .map(pos => {
    // positions are screen space from top left, so we're shifting everything to center
    // the origin which gives us better control with scaling and rotating the containing mesh.
    // We're also flipping the y value vertically for cartesian coordinates and
    // adding a z value to the end so our position attribute will be a vec3
    pos[0] -= bitmap.width / 2;
    pos[1] -= bitmap.height / 2;
    pos[1] *= -1;
    pos.push(0);
    return pos;
  });

console.log(`${bitmap.data.length} positions`);
console.log(`${positions.length} particles`);

const program = new Program(gl, {
  uniforms,
  transparent: true,
  depthTest: false,
  vertex: glsl`
    precision highp float;
    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;
    // uniform vec2 resolution;
    // uniform vec2 mouse;
    // uniform float time;
    attribute vec3 position;
    attribute vec3 color;
    attribute float size;
    varying vec3 vColor;

    void main() {
      vColor = color;
      vec3 pos = position;
      gl_PointSize = size;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragment: glsl`
    precision highp float;
    // uniform vec2 resolution;
    // uniform vec2 mouse;
    // uniform float time;
    varying vec3 vColor;

    void main() {
      vec2 uv = gl_PointCoord.xy;
      float alpha = smoothstep(0.5, 0.4, length(uv - 0.5)) * 0.9;
      gl_FragColor = vec4(vColor, alpha);
    }
  `
});

const geometry = new Geometry(gl, {
  position: {
    size: 3,
    // one thing that I like about Three.js and regl is not needing to remember
    // Float32Array all the time. Thinking we could add a handy check in Geometry for
    // `Array.isArray(attr)` or `attr instanceof Float32Array === false`
    data: new Float32Array(
      // flattened array of positions gets sent in as [x, y, z, x, y, z ...]
      flatten(positions)
    )
  },
  color: {
    size: 3,
    data: new Float32Array(
      // create a flat array from our color palette as [r, g, b, r, g, b ...]
      flatten(fill(positions.length, () => random(colors)))
    )
  },
  size: {
    data: new Float32Array(
      // random size values used with gl_PointSize
      fill(positions.length, i => random(2,8))
    )
  }
});

// create our particles mesh with mode as gl.POINTS
// https://github.com/oframe/ogl/blob/master/examples/particles.html#L58
// push back and add to the scene
const particles = new Mesh(gl, {
  program,
  geometry,
  mode: gl.POINTS
});

particles.position.z = -500;
particles.setParent(scene);



function resize(event) {

  const width = window.innerWidth;
  const height = window.innerHeight;
  // need to account for dpr / retina or our resolution uniform will be inaccurate
  uniforms.resolution.value.set(width * renderer.dpr, height * renderer.dpr);
  camera.perspective({aspect: width / height});
  renderer.setSize(width, height);
}

function mousemove(event) {

  const x = (event.touches) ? event.touches[0].clientX : event.clientX;
  const y = (event.touches) ? event.touches[0].clientY : event.clientY;
  const w = window.innerWidth;
  const h = window.innerHeight;
  // set our mouse uniforms so values go -0.5 <---> 0.5
  uniforms.mouse.value.set(
    (x - w / 2) / w,
    (y - h / 2) / h * -1
  );
}

function draw(t) {
  const time = t * 0.001;
  uniforms.time.value = time;
  renderer.render({scene, camera});
  requestAnimationFrame(draw);
}

function init() {

  document.body.style.cssText = 'margin:0;padding:0;overflow:hidden;background:radial-gradient(#FFF,#D9DFDC);';
  document.body.appendChild(gl.canvas);
  document.body.addEventListener('mousemove', mousemove);
  document.body.addEventListener('touchmove', mousemove);
  window.addEventListener('resize', resize);

  resize();
  requestAnimationFrame(draw);
}

if (process.env.NODE_ENV !== 'production') {

  const dat = require('dat.gui');
  const gui = new dat.GUI();

  gui.addFolder('Camera');
  gui.add(camera.position, 'z', 0, 1000);
  gui.addFolder('Mesh');
  gui.add(particles.position, 'x', -500, 500);
  gui.add(particles.position, 'y', -500, 500);
  gui.add(particles.position, 'z', -camera.far, camera.near);
  gui.close();
}

init();