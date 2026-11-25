// gl.js — Raw WebGL mini-engine for Junction Kitchen 3D.
// No libraries: one shader program, unit meshes (box / cylinder / sphere)
// instanced by model matrix + per-draw colour. Written fresh for this entry.

// ---------- matrix helpers (column-major, WebGL style) ----------
export function matIdentity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
export function matMultiply(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}
export function matTranslate(x, y, z) {
  const m = matIdentity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}
export function matScale(x, y, z) {
  const m = matIdentity();
  m[0] = x; m[5] = y; m[10] = z;
  return m;
}
export function matRotateY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}
export function matRotateX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}
export function matRotateZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
export function matPerspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
export function matLookAt(eye, target, up) {
  const zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let zl = Math.hypot(zx, zy, zz); const z = [zx / zl, zy / zl, zz / zl];
  const xx = up[1] * z[2] - up[2] * z[1], xy = up[2] * z[0] - up[0] * z[2], xz = up[0] * z[1] - up[1] * z[0];
  const xl = Math.hypot(xx, xy, xz); const x = [xx / xl, xy / xl, xz / xl];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ];
}
// Compose: translate * rotY * rotX * rotZ * scale
export function compose(x, y, z, ry, rx, rz, sx, sy, sz) {
  let m = matTranslate(x, y, z);
  if (ry) m = matMultiply(m, matRotateY(ry));
  if (rx) m = matMultiply(m, matRotateX(rx));
  if (rz) m = matMultiply(m, matRotateZ(rz));
  if (sx !== 1 || sy !== 1 || sz !== 1) m = matMultiply(m, matScale(sx, sy, sz));
  return m;
}
// Project a world point to canvas pixels. Returns [px, py, behind?]
export function projectPoint(vp, p, w, h) {
  const x = p[0], y = p[1], z = p[2];
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.0001) return [0, 0, true];
  return [(cx / cw * 0.5 + 0.5) * w, (0.5 - cy / cw * 0.5) * h, false];
}

// ---------- shader program ----------
const VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uVP;
varying vec3 vN;
void main() {
  vN = mat3(uModel) * aNormal;
  gl_Position = uVP * uModel * vec4(aPos, 1.0);
}`;
const FS = `
precision mediump float;
uniform vec3 uColor;
uniform vec3 uLight;
varying vec3 vN;
void main() {
  vec3 n = normalize(vN);
  float d = max(dot(n, normalize(uLight)), 0.0);
  float rim = pow(1.0 - abs(n.z), 2.0) * 0.08;
  vec3 c = uColor * (0.52 + 0.48 * d) + rim;
  gl_FragColor = vec4(c, 1.0);
}`;

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(s));
  }
  return s;
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    this.canvas = canvas;
    const prog = gl.createProgram();
    gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    this.aPos = gl.getAttribLocation(prog, 'aPos');
    this.aNormal = gl.getAttribLocation(prog, 'aNormal');
    this.uModel = gl.getUniformLocation(prog, 'uModel');
    this.uVP = gl.getUniformLocation(prog, 'uVP');
    this.uColor = gl.getUniformLocation(prog, 'uColor');
    this.uLight = gl.getUniformLocation(prog, 'uLight');
    this.meshes = {
      box: this.makeMesh(boxGeometry()),
      cyl: this.makeMesh(cylinderGeometry(20)),
      sph: this.makeMesh(sphereGeometry(12, 8)),
      cone: this.makeMesh(coneGeometry(12)),
    };
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.09, 0.08, 0.12, 1);
  }

  makeMesh(geo) {
    const gl = this.gl;
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.positions), gl.STATIC_DRAW);
    const nb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.normals), gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geo.indices), gl.STATIC_DRAW);
    return { vb, nb, ib, count: geo.indices.length };
  }

  begin(vp, light) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uVP, false, new Float32Array(vp));
    gl.uniform3fv(this.uLight, new Float32Array(light || [0.4, 0.9, 0.35]));
  }

  draw(meshName, model, color) {
    const gl = this.gl;
    const m = this.meshes[meshName];
    gl.uniformMatrix4fv(this.uModel, false, new Float32Array(model));
    gl.uniform3fv(this.uColor, new Float32Array(color));
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nb);
    gl.enableVertexAttribArray(this.aNormal);
    gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
  }

  // Convenience: draw a box centred at (x,y,z) with size (w,h,d), optional Y rotation.
  box(x, y, z, w, h, d, color, ry) {
    this.draw('box', compose(x, y, z, ry || 0, 0, 0, w, h, d), color);
  }
  cyl(x, y, z, r, h, color, ry) {
    this.draw('cyl', compose(x, y, z, ry || 0, 0, 0, r, h, r), color);
  }
  sph(x, y, z, r, color) {
    this.draw('sph', compose(x, y, z, 0, 0, 0, r, r, r), color);
  }
  cone(x, y, z, r, h, color) {
    this.draw('cone', compose(x, y, z, 0, 0, 0, r, h, r), color);
  }
}

// ---------- geometry builders (unit size, centred at origin) ----------
function boxGeometry() {
  // 24 verts (4 per face), outward normals.
  const faces = [
    { n: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
    { n: [0, 1, 0], v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
    { n: [0, -1, 0], v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
    { n: [1, 0, 0], v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
    { n: [-1, 0, 0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
  ];
  const positions = [], normals = [], indices = [];
  faces.forEach((f, fi) => {
    f.v.forEach((p) => { positions.push(p[0], p[1], p[2]); normals.push(f.n[0], f.n[1], f.n[2]); });
    const b = fi * 4;
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return { positions, normals, indices };
}

function cylinderGeometry(seg) {
  const positions = [], normals = [], indices = [];
  // side
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a) * 0.5, z = Math.sin(a) * 0.5;
    positions.push(x, -0.5, z, x, 0.5, z);
    normals.push(Math.cos(a), 0, Math.sin(a), Math.cos(a), 0, Math.sin(a));
  }
  for (let i = 0; i < seg; i++) {
    const b = i * 2;
    indices.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
  }
  // caps (fan around centre)
  const topBase = positions.length / 3;
  positions.push(0, 0.5, 0); normals.push(0, 1, 0);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    positions.push(Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5); normals.push(0, 1, 0);
  }
  for (let i = 0; i < seg; i++) indices.push(topBase, topBase + 1 + i, topBase + 2 + i);
  const botBase = positions.length / 3;
  positions.push(0, -0.5, 0); normals.push(0, -1, 0);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    positions.push(Math.cos(a) * 0.5, -0.5, Math.sin(a) * 0.5); normals.push(0, -1, 0);
  }
  for (let i = 0; i < seg; i++) indices.push(botBase, botBase + 2 + i, botBase + 1 + i);
  return { positions, normals, indices };
}

function coneGeometry(seg) {
  const positions = [], normals = [], indices = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a) * 0.5, z = Math.sin(a) * 0.5;
    positions.push(x, -0.5, z, 0, 0.5, 0);
    const ny = 0.5; // slanted normal approx
    normals.push(Math.cos(a), ny, Math.sin(a), Math.cos(a), ny, Math.sin(a));
  }
  for (let i = 0; i < seg; i++) {
    const b = i * 2;
    indices.push(b, b + 2, b + 1);
  }
  const botBase = positions.length / 3;
  positions.push(0, -0.5, 0); normals.push(0, -1, 0);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    positions.push(Math.cos(a) * 0.5, -0.5, Math.sin(a) * 0.5); normals.push(0, -1, 0);
  }
  for (let i = 0; i < seg; i++) indices.push(botBase, botBase + 2 + i, botBase + 1 + i);
  return { positions, normals, indices };
}

function sphereGeometry(wSeg, hSeg) {
  const positions = [], normals = [], indices = [];
  for (let y = 0; y <= hSeg; y++) {
    const v = y / hSeg;
    const phi = v * Math.PI;
    for (let x = 0; x <= wSeg; x++) {
      const u = x / wSeg;
      const theta = u * Math.PI * 2;
      const px = Math.sin(phi) * Math.cos(theta) * 0.5;
      const py = Math.cos(phi) * 0.5;
      const pz = Math.sin(phi) * Math.sin(theta) * 0.5;
      positions.push(px, py, pz);
      normals.push(px * 2, py * 2, pz * 2);
    }
  }
  for (let y = 0; y < hSeg; y++) {
    for (let x = 0; x < wSeg; x++) {
      const a = y * (wSeg + 1) + x;
      const b = a + wSeg + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, normals, indices };
}

// ---------- colour helpers ----------
export function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
export function shade(c, f) {
  return [Math.min(1, c[0] * f), Math.min(1, c[1] * f), Math.min(1, c[2] * f)];
}
export function lerpColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
