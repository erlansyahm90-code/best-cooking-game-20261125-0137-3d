// render3d.js — The 3D scene of Junction Kitchen: floor, wall, departure
// board, five stations, chef, passengers on the left platform, flames,
// steam and the locked-slot markers. Draws from a plain state object
// (see main.js for its shape). HUD text/bars are drawn on the 2D canvas
// in main.js, projected from these same world positions.

import { Renderer, matPerspective, matLookAt, matMultiply, compose, projectPoint, hex, shade, lerpColor } from './gl.js';
import { STATIONS, PASSENGER_SPOTS, SERVING_COUNTER, PREP_TABLE, burnerSlots, plateSlots } from './stations.js';
import { INGREDIENTS, chopPiecesVisible } from './recipes.js';
import { PASSENGERS } from './orders.js';

// Which upgrade tier shows on each station's front edge (gold pips).
const STATION_UPGRADE = { pantry: 'pantry', chopping: 'knife', stove: 'stove', plating: 'plating', serving: 'window', warming: 'warming' };

export const CAMERA = {
  eye: [0, 10.2, 9.6],
  target: [0, 0.4, -1.2],
  up: [0, 1, 0],
  fovy: 0.9, // ~52 degrees
};

export function makeViewProjection(w, h) {
  const proj = matPerspective(CAMERA.fovy, w / h, 0.1, 100);
  const view = matLookAt(CAMERA.eye, CAMERA.target, CAMERA.up);
  return matMultiply(proj, view);
}

export function projectToScreen(vp, x, y, z, w, h) {
  return projectPoint(vp, [x, y, z], w, h);
}

export class Scene3D {
  constructor(canvas) {
    this.r = new Renderer(canvas);
    this.canvas = canvas;
  }

  render(state, time) {
    const r = this.r;
    const w = this.canvas.width, h = this.canvas.height;
    const vp = makeViewProjection(w, h);
    this.vp = vp;
    r.begin(vp, [0.45, 0.85, 0.4]);
    this.drawFloorAndWall(r, time);
    this.drawDepartureBoard(r, state, time);
    this.drawWallDecor(r, state, time);
    this.drawStations(r, state, time);
    this.drawServingCounter(r, state, time);
    this.drawPrepTable(r, state, time);
    this.drawPlatformFurniture(r, state, time);
    this.drawPassengers(r, state, time);
    this.drawChef(r, state, time);
    this.drawWaiters(r, state, time);
    if (state.sousChef) this.drawSousChef(r, state, time);
    if (state.serveAnim) this.drawServeAnim(r, state);
    this.drawParticles(r, state);
  }

  // The plate flies from the serving window to the passenger.
  drawServeAnim(r, state) {
    this.drawFlyingPlate(r, state.serveAnim);
  }

  // A plate in flight (chef serve or waiter delivery): same 0.9s arc.
  // BIG, with a gold rim and a long motion trail, so the serve reads
  // clearly even at 768x480 — a small white disc on the cream floor
  // did not, and the cover's serve moment must be impossible to miss.
  drawFlyingPlate(r, a) {
    const t = Math.min(1, a.t / a.dur);
    const x = a.from.x + (a.to.x - a.from.x) * t;
    const z = a.from.z + (a.to.z - a.from.z) * t;
    const y = 1.2 + Math.sin(t * Math.PI) * 1.4;
    // Motion trail: shrinking gold dots behind the plate.
    for (let k = 1; k <= 5; k++) {
      const bt = Math.max(0, t - k * 0.07);
      const bx = a.from.x + (a.to.x - a.from.x) * bt;
      const bz = a.from.z + (a.to.z - a.from.z) * bt;
      const by = 1.2 + Math.sin(bt * Math.PI) * 1.4;
      r.sph(bx, by, bz, 0.12 - k * 0.018, hex('#ffd700'));
    }
    r.cyl(x, y - 0.02, z, 0.72, 0.06, hex('#c9a227'));
    r.cyl(x, y, z, 0.68, 0.08, hex('#f2f2f2'));
    const c = a.dish.color || [0.9, 0.7, 0.3];
    r.sph(x, y + 0.14, z, 0.3, shade(c, 1.1));
    r.sph(x + 0.2, y + 0.12, z + 0.12, 0.2, shade(c, 0.9));
  }

  // ---------- room ----------
  drawFloorAndWall(r, time) {
    // Platform tiles: alternating terracotta / cream checker, with a
    // dark border around the edge and a few accent tiles for variety.
    for (let ix = -6; ix <= 6; ix++) {
      for (let iz = -4; iz <= 5; iz++) {
        const even = (ix + iz) % 2 === 0;
        const edge = ix === -6 || ix === 6 || iz === -4 || iz === 5;
        const accent = !edge && ((ix * 7 + iz * 3) % 11 === 0);
        r.box(ix + 0.0, -0.06, iz + 0.0, 1, 0.12, 1,
          edge ? hex('#5a3a22') : accent ? hex('#c98a4a') : even ? hex('#b5773f') : hex('#d9b078'));
      }
    }
    // Runner carpet down the walkway in front of the stations (dark red
    // with gold borders) — the kitchen's main artery.
    r.box(0, 0.02, -1.0, 12.4, 0.04, 0.9, hex('#7a1f1f'));
    r.box(0, 0.03, -1.42, 12.4, 0.04, 0.08, hex('#c9a227'));
    r.box(0, 0.03, -0.58, 12.4, 0.04, 0.08, hex('#c9a227'));
    // Side platform strip (passenger side, left).
    for (let iz = -2; iz <= 4; iz++) {
      r.box(-6.9, -0.04, iz, 0.9, 0.08, 1, hex('#8a6a4f'));
    }
    // Back wall: deep station red with brass trim.
    r.box(0, 2.2, -4.6, 15, 4.6, 0.3, hex('#5a1f16'));
    r.box(0, 0.15, -4.42, 15, 0.3, 0.1, hex('#c9a227'));
    // Wall lamps (warm glow orbs).
    for (const lx of [-5, -1.5, 2, 5]) {
      r.sph(lx, 4.3, -4.35, 0.22, hex('#ffd97a'));
      r.box(lx, 4.05, -4.4, 0.3, 0.18, 0.12, hex('#3a3a3a'));
    }
    // Pillars flanking the back wall (gold base + capital).
    for (const px of [-6.9, 6.9]) {
      r.box(px, 2.2, -4.35, 0.6, 4.4, 0.6, hex('#4a1a12'));
      r.box(px, 0.2, -4.35, 0.8, 0.4, 0.8, hex('#c9a227'));
      r.box(px, 4.3, -4.35, 0.8, 0.3, 0.8, hex('#c9a227'));
    }
    // Lower floor props (round 2 fix): the bottom half of the kitchen
    // was bare checkerboard. A round rug (flat, walkable) in the open
    // floor + crates, sacks and a potted plant along the platform
    // edges — all outside the walkable clamp, so nobody walks through
    // them, and the floor never reads empty again.
    r.cyl(2.8, 0.02, 2.6, 1.3, 0.03, hex('#7a1f1f'));
    r.cyl(2.8, 0.03, 2.6, 1.0, 0.03, hex('#9a2f2f'));
    r.cyl(2.8, 0.04, 2.6, 0.55, 0.03, hex('#c9a227'));
    r.box(6.4, 0.35, 2.6, 0.7, 0.7, 0.7, hex('#8a6a3a'));
    r.box(6.4, 0.95, 2.6, 0.55, 0.5, 0.55, hex('#6a4a28'));
    r.box(6.4, 0.35, 1.7, 0.6, 0.6, 0.6, hex('#7a5a32'));
    r.sph(-6.4, 0.28, 3.3, 0.3, hex('#b59a6a'));
    r.sph(-6.35, 0.26, 2.85, 0.26, hex('#a88a55'));
    r.cyl(6.4, 0.3, 0.2, 0.3, 0.5, hex('#8a4a20'));
    r.sph(6.4, 0.75, 0.2, 0.34, hex('#2a7a3a'));
    r.sph(6.4, 0.95, 0.2, 0.24, hex('#359a45'));
    r.box(-6.4, 0.4, -2.8, 0.5, 0.8, 0.5, hex('#6a4a2a'));
    r.cyl(-6.4, 0.85, -2.8, 0.28, 0.18, hex('#8a6a3a'));
    r.sph(-6.4, 0.98, -2.8, 0.16, hex('#e74c3c'));
    // Right wall hint + serving hatch frame.
    r.box(6.9, 1.8, -0.5, 0.3, 3.8, 6.5, hex('#4a1a12'));
  }

  // ---------- departure board (order board in 3D) ----------
  drawDepartureBoard(r, state, time) {
    // Big dark board above the stations.
    r.box(0, 3.3, -4.42, 8.4, 1.7, 0.15, hex('#101014'));
    r.box(0, 3.3, -4.33, 8.6, 0.12, 0.1, hex('#c9a227'));
    r.box(0, 2.42, -4.33, 8.6, 0.12, 0.1, hex('#c9a227'));
    // Header: gold strip + fake "DEPARTURES" text rows (thin lit bars).
    r.box(0, 4.0, -4.33, 8.6, 0.08, 0.06, hex('#c9a227'));
    for (let i = 0; i < 5; i++) {
      r.box(-3.4 + i * 1.15, 3.98, -4.3, 0.7, 0.1, 0.04, hex('#ffd700'));
    }
    // Train lines: one glowing strip per waiting order. Rows sit in
    // the LOWER half of the board (y 3.55 down) so the 2D row text
    // never collides with the order tickets at the top of the screen.
    const orders = state.orders.filter((o) => o.state === 'waiting');
    orders.slice(0, 4).forEach((o, i) => {
      const y = 3.55 - i * 0.32;
      const frac = o.patience / o.patienceMax;
      const col = frac > 0.5 ? [0.25, 0.85, 0.35] : frac > 0.25 ? [1.0, 0.65, 0.1] : [0.95, 0.2, 0.2];
      r.box(-3.6, y, -4.3, 1.1, 0.2, 0.06, o.express ? hex('#ffd700') : col);
      r.box(-1.2, y, -4.3, 2.6 * Math.max(0.08, frac), 0.16, 0.06, col);
      r.box(2.6, y, -4.3, 1.5, 0.2, 0.06, hex('#3a3f4a'));
    });
    // Dim "next trains" rows below the live orders (the board is a
    // real departure board, not just the orders).
    for (let i = orders.length; i < 4; i++) {
      const y = 3.55 - i * 0.32;
      r.box(-3.6, y, -4.3, 1.1, 0.14, 0.05, hex('#2a2f3a'));
      r.box(-1.2, y, -4.3, 2.2, 0.1, 0.05, hex('#232830'));
      r.box(2.6, y, -4.3, 1.5, 0.14, 0.05, hex('#2a2f3a'));
    }
    // Clock on the board (a round face, bigger + gold rim).
    r.cyl(3.9, 3.3, -4.3, 0.52, 0.1, hex('#c9a227'));
    r.cyl(3.9, 3.3, -4.24, 0.42, 0.1, hex('#f5ead0'));
    const ang = (time % 60) / 60 * Math.PI * 2;
    r.box(3.9 + Math.sin(ang) * 0.18, 3.3 + Math.cos(ang) * 0.18, -4.18, 0.05, 0.3, 0.05, hex('#222222'));
    r.box(3.9 - Math.sin(ang) * 0.1, 3.3 - Math.cos(ang) * 0.1, -4.18, 0.05, 0.2, 0.05, hex('#222222'));
  }

  // ---------- wall decor ----------
  // Big station clock, menu board, posters and a window on the right
  // wall, pendant lamps over the kitchen — every wall has something.
  drawWallDecor(r, state, time) {
    // Big station clock on the wall left of the departure board.
    r.cyl(-5.9, 3.35, -4.38, 0.78, 0.12, hex('#c9a227'));
    r.cyl(-5.9, 3.35, -4.32, 0.64, 0.1, hex('#f5ead0'));
    const ang = (time % 60) / 60 * Math.PI * 2;
    r.box(-5.9 + Math.sin(ang) * 0.26, 3.35 + Math.cos(ang) * 0.26, -4.26, 0.06, 0.44, 0.05, hex('#222222'));
    r.box(-5.9 - Math.sin(ang) * 0.15, 3.35 - Math.cos(ang) * 0.15, -4.26, 0.06, 0.3, 0.05, hex('#222222'));
    // Menu board on the wall right of the departure board.
    r.box(5.9, 3.3, -4.4, 1.9, 1.5, 0.1, hex('#241a10'));
    r.box(5.9, 3.3, -4.33, 2.0, 0.1, 0.06, hex('#c9a227'));
    r.box(5.9, 2.62, -4.33, 2.0, 0.1, 0.06, hex('#c9a227'));
    for (let i = 0; i < 3; i++) {
      r.box(5.9, 3.75 - i * 0.3, -4.32, 1.5, 0.09, 0.04, hex('#ffd97a'));
      r.box(5.9, 3.62 - i * 0.3, -4.32, 1.1, 0.06, 0.04, hex('#8a7a5a'));
    }
    // Posters + a window on the right wall (facing the kitchen).
    r.box(6.72, 2.4, 0.6, 0.08, 1.1, 0.9, hex('#2f6db3'));
    r.box(6.72, 2.4, 0.6, 0.06, 0.9, 0.7, hex('#ffd700'));
    r.box(6.72, 2.5, 2.1, 0.08, 1.2, 0.9, hex('#101014'));
    r.box(6.72, 2.5, 2.1, 0.06, 1.0, 0.7, hex('#c0392b'));
    r.box(6.72, 2.6, -2.2, 0.08, 1.3, 1.1, hex('#3a3f4a'));
    r.box(6.72, 2.6, -2.2, 0.06, 1.1, 0.9, hex('#9fd0ff'));
    r.box(6.7, 2.6, -2.2, 0.04, 0.08, 0.9, hex('#3a3f4a'));
    // Pendant lamps hanging over the kitchen (cord + shade + glow).
    for (const lx of [-3.5, 3.5]) {
      r.box(lx, 4.6, -0.5, 0.05, 1.0, 0.05, hex('#222222'));
      r.cone(lx, 4.05, -0.5, 0.42, 0.4, hex('#2f6db3'));
      r.sph(lx, 3.9, -0.5, 0.2, hex('#ffd97a'));
    }
  }

  // ---------- stations ----------
  drawStations(r, state, time) {
    for (const s of STATIONS) {
      if (s.needsUpgrade && !state.upgrades.warming) {
        // Locked warming station: dark rack + padlock prop.
        r.box(s.x, 0.55, s.z, s.w, 1.1, s.d, hex('#2a2a2e'));
        r.box(s.x, 1.15, s.z, 0.5, 0.5, 0.5, hex('#c9a227'));
        r.box(s.x, 1.05, s.z, 0.28, 0.3, 0.1, hex('#111111'));
        continue;
      }
      // A real piece of kitchen furniture: legs, body with a kick plate,
      // a lower shelf, brass trim on the top front edge, then the top slab.
      // (A plain box read as "kotak polos" in the screenshots — never again.)
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        r.box(s.x + lx * (s.w / 2 - 0.1), 0.175, s.z + lz * (s.d / 2 - 0.1), 0.14, 0.35, 0.14, hex('#3a2a1a'));
      }
      r.box(s.x, 0.675, s.z, s.w, 0.65, s.d, s.color);
      r.box(s.x, 0.12, s.z + s.d / 2 + 0.01, s.w - 0.2, 0.18, 0.04, hex('#241a10'));
      r.box(s.x, 0.42, s.z, s.w - 0.3, 0.07, s.d - 0.3, shade(s.color, 0.75));
      r.box(s.x, 0.98, s.z + s.d / 2 + 0.02, s.w, 0.07, 0.05, hex('#c9a227'));
      r.box(s.x, 1.02, s.z, s.w + 0.12, 0.08, s.d + 0.12, s.topColor);
      // Tier pips on the front edge: gold = bought tier, dark = not yet.
      const upId = STATION_UPGRADE[s.id];
      const tier = upId ? (state.upgrades[upId] || 0) : 0;
      for (let i = 0; i < 3; i++) {
        r.sph(s.x - 0.3 + i * 0.3, 0.88, s.z + s.d / 2 + 0.05, 0.07, i < tier ? hex('#ffd700') : hex('#2a2a2e'));
      }
      if (s.id === 'pantry') this.drawPantry(r, state, time);
      if (s.id === 'chopping') this.drawChopping(r, state, time);
      if (s.id === 'stove') this.drawStove(r, state, time);
      if (s.id === 'plating') this.drawPlating(r, state, time);
      if (s.id === 'serving') this.drawServing(r, state, time);
      if (s.id === 'warming') this.drawWarming(r, state, time);
    }
  }

  drawPantry(r, state, time) {
    // A tall shelving unit: back board + one shelf per pantry tier
    // (tier 0 = 1 shelf, tier 1 = 2, tier 2+ = 3) with crates and jars.
    // Burlap sacks at the base + a basket on the counter.
    r.sph(-6.1, 0.28, -2.6, 0.3, hex('#b59a6a'));
    r.sph(-5.6, 0.26, -2.55, 0.26, hex('#a88a55'));
    r.cyl(-4.7, 1.2, -3.0, 0.24, 0.22, hex('#8a6a3a'));
    r.sph(-4.7, 1.32, -3.0, 0.16, hex('#e74c3c'));
    r.box(-5.3, 2.0, -3.78, 2.2, 2.4, 0.1, hex('#4a3220'));
    const tier = state.upgrades.pantry || 0;
    const shelfRows = tier >= 2 ? 3 : tier >= 1 ? 2 : 1;
    const items = state.pantryItems || [];
    for (let row = 0; row < shelfRows; row++) {
      const y = 1.55 + row * 0.5;
      r.box(-5.3, y, -3.35, 2.0, 0.1, 0.8, hex('#8a6a4f'));
      items.forEach((ing, i) => {
        if (i >= 4) return;
        const x = -6.05 + (i % 4) * 0.5;
        const c = INGREDIENTS[ing] ? INGREDIENTS[ing].color : [0.8, 0.8, 0.8];
        if (row === 0) {
          r.box(x, y + 0.22, -3.35, 0.4, 0.34, 0.4, c);
          if (state.pantryHighlight === ing) {
            r.box(x, y + 0.44, -3.35, 0.46, 0.06, 0.46, hex('#ffd700'));
          }
        } else if (row === 1 && i % 2 === 0) {
          r.cyl(x, y + 0.2, -3.35, 0.16, 0.32, shade(c, 1.1));
        } else if (row === 2 && i % 3 === 0) {
          r.sph(x, y + 0.2, -3.35, 0.15, shade(c, 1.2));
        }
      });
    }
  }

  drawChopping(r, state, time) {
    const s = stationById('chopping');
    // Board + knife block + oil bottle + small bowl.
    r.box(s.x, 1.1, s.z, 1.1, 0.06, 0.7, hex('#e8d5a8'));
    r.box(s.x + 0.85, 1.25, s.z - 0.3, 0.18, 0.4, 0.3, hex('#4a3a28'));
    r.box(s.x + 0.82, 1.5, s.z - 0.3, 0.05, 0.3, 0.16, hex('#c0c8d0'));
    r.cyl(s.x - 0.85, 1.25, s.z + 0.3, 0.11, 0.34, hex('#2a6a2a'));
    r.cyl(s.x - 0.85, 1.45, s.z + 0.3, 0.05, 0.12, hex('#c9a227'));
    r.cyl(s.x + 0.5, 1.18, s.z + 0.32, 0.2, 0.14, hex('#e8e8e8'));
    const ch = state.chopping;
    if (ch && ch.ing) {
      const c = INGREDIENTS[ch.ing].color;
      // The piece being chopped (shrinks as progress grows) + the cut
      // pieces landing ONE BY ONE: chopPiecesVisible(progress) is 0, 1,
      // 2 then 3 as the 3 knife strokes land — a row of big pieces
      // across the front of the board, impossible to miss.
      const p = ch.progress;
      r.box(s.x - 0.2, 1.2, s.z, 0.34 * (1 - p * 0.4), 0.16, 0.34, c);
      const cut = chopPiecesVisible(p);
      for (let k = 0; k < cut; k++) {
        r.box(s.x - 0.45 + k * 0.34, 1.2, s.z + 0.38, 0.26, 0.16, 0.26, shade(c, 1.2));
      }
      // Knife bobbing, bigger blade so the chop reads mid-swing.
      const bob = Math.sin(time * 14) * 0.08;
      r.box(s.x + 0.85, 1.5 + bob, s.z + 0.1, 0.1, 0.62, 0.26, hex('#c0c8d0'));
    }
    // Chopped pieces waiting on the board (bigger, in a row).
    (state.boardPieces || []).forEach((ing, i) => {
      const c = INGREDIENTS[ing].color;
      r.box(s.x - 0.5 + i * 0.34, 1.18, s.z + 0.32, 0.24, 0.14, 0.24, shade(c, 1.2));
    });
  }

  drawStove(r, state, time) {
    const s = stationById('stove');
    // Oven door + handle + knobs on the front face, so the stove reads
    // as an appliance, not a black box.
    r.box(s.x, 0.62, s.z + s.d / 2 + 0.02, s.w - 0.5, 0.5, 0.05, hex('#0c0c0e'));
    r.box(s.x, 0.85, s.z + s.d / 2 + 0.06, s.w - 0.7, 0.05, 0.05, hex('#c9a227'));
    for (let i = 0; i < 3; i++) {
      r.box(s.x - 0.6 + i * 0.6, 0.95, s.z + s.d / 2 + 0.04, 0.12, 0.12, 0.06, hex('#e8e8e8'));
    }
    // Tier 3: gold corner caps on the top slab (the 3rd burner shows below).
    if ((state.upgrades.stove || 0) >= 3) {
      r.box(s.x - s.w / 2, 1.08, s.z + s.d / 2, 0.14, 0.1, 0.14, hex('#ffd700'));
      r.box(s.x + s.w / 2, 1.08, s.z + s.d / 2, 0.14, 0.1, 0.14, hex('#ffd700'));
    }
    const slots = burnerSlots(state.burners.length);
    state.burners.forEach((b, i) => {
      const slot = slots[i];
      if (!slot) return;
      // Burner ring.
      r.cyl(slot.x, 1.08, slot.z, 0.42, 0.06, hex('#0c0c0e'));
      if (b.state === 'cooking') {
        // Fire that READS: a glowing ring under the pot, three flame
        // cones flared toward the camera (wider than the pot, so the
        // fire is never hidden behind it), plus flickering embers at
        // the pot's base.
        const flame = ((state.stats.stove && state.stats.stove.flame) || 1) * (0.85 + Math.sin(time * 9 + i * 2) * 0.15);
        r.cyl(slot.x, 1.09, slot.z, 0.52, 0.05, hex('#ff5a00'));
        r.cone(slot.x, 1.12, slot.z + 0.26, 0.62 * flame, 1.05 * flame, hex('#ff5a00'));
        r.cone(slot.x, 1.12, slot.z + 0.26, 0.44 * flame, 0.85 * flame, hex('#ff7a1a'));
        r.cone(slot.x, 1.18, slot.z + 0.26, 0.24 * flame, 0.55 * flame, hex('#ffd23e'));
        for (let e = 0; e < 3; e++) {
          const ea = (e / 3) * Math.PI * 2 + time * 2;
          r.sph(slot.x + Math.cos(ea) * 0.42, 1.12, slot.z + Math.sin(ea) * 0.42, 0.07, hex('#ff8c1a'));
        }
        // Pot + contents: stage by stage — raw (dark) -> half (true
        // colour) -> cooked (golden-brown). The food sits IN the pot
        // as three visible lumps, so the stage change reads at a glance.
        r.cyl(slot.x, 1.32, slot.z, 0.36, 0.42, hex('#3c3f45'));
        const c = INGREDIENTS[b.ing] ? INGREDIENTS[b.ing].color : [0.8, 0.8, 0.8];
        const p = b.progress;
        const stage = p < 0.35 ? shade(c, 0.75) : p < 0.65 ? c : lerpColor(c, [0.78, 0.52, 0.22], Math.min(1, (p - 0.65) / 0.35));
        r.cyl(slot.x, 1.52, slot.z, 0.3, 0.1, stage);
        for (let l = 0; l < 3; l++) {
          const la = (l / 3) * Math.PI * 2 + 0.5;
          r.sph(slot.x + Math.cos(la) * 0.14, 1.6, slot.z + Math.sin(la) * 0.14, 0.13, shade(stage, 1.1));
        }
      } else if (b.state === 'burnt') {
        r.cyl(slot.x, 1.32, slot.z, 0.36, 0.42, hex('#1a1a1a'));
        r.cyl(slot.x, 1.52, slot.z, 0.3, 0.06, hex('#0a0a0a'));
      }
    });
    // Locked 3rd burner slot (until stove tier 3).
    if (state.burners.length < 3) {
      const s = stationById('stove');
      r.box(s.x + 1.05, 1.12, s.z, 0.4, 0.12, 0.4, hex('#2a2a2e'));
      r.box(s.x + 1.05, 1.32, s.z, 0.22, 0.22, 0.08, hex('#c9a227'));
    }
    // Side table between stove and plating counter: spare pan + kettle,
    // so the stove area is never a bare black box.
    const s2 = stationById('stove');
    r.box(1.58, 0.45, -3.5, 0.1, 0.9, 0.1, hex('#3a2a1a'));
    r.box(1.58, 0.45, -2.9, 0.1, 0.9, 0.1, hex('#3a2a1a'));
    r.box(1.58, 0.92, -3.2, 0.5, 0.07, 0.9, hex('#8a6a4f'));
    r.cyl(1.58, 1.0, -3.4, 0.2, 0.06, hex('#3c3f45'));
    r.cyl(1.58, 1.08, -2.95, 0.14, 0.24, hex('#c0c8d0'));
    r.sph(1.58, 1.22, -2.95, 0.08, hex('#8a8f98'));
  }

  drawPlating(r, state, time) {
    const s = stationById('plating');
    // Stack of clean plates at the corner: taller with the plating tier.
    // Sauce bottle + garnish bowl at the other end.
    const stack = 2 + (state.upgrades.plating || 0);
    for (let i = 0; i < stack; i++) {
      r.cyl(s.x - s.w / 2 + 0.25, 1.12 + i * 0.06, s.z - 0.35, 0.3, 0.05, hex('#f2f2f2'));
    }
    r.cyl(s.x + s.w / 2 - 0.25, 1.22, s.z - 0.35, 0.09, 0.3, hex('#c0392b'));
    r.cyl(s.x + s.w / 2 - 0.25, 1.4, s.z - 0.35, 0.04, 0.1, hex('#222222'));
    r.cyl(s.x + s.w / 2 - 0.25, 1.16, s.z + 0.35, 0.18, 0.12, hex('#e8e8e8'));
    r.sph(s.x + s.w / 2 - 0.25, 1.24, s.z + 0.35, 0.1, hex('#27ae60'));
    const slots = plateSlots(state.plateSlots);
    state.plates.forEach((p, i) => {
      const slot = slots[i];
      if (!slot) return;
      // Plate + assembled components as coloured food piles.
      r.cyl(slot.x, 1.1, slot.z, 0.42, 0.07, hex('#f2f2f2'));
      p.components.forEach((comp, j) => {
        if (!comp.done) return;
        const c = INGREDIENTS[comp.ing].color;
        const a = (j / Math.max(1, p.components.length)) * Math.PI * 2;
        r.sph(slot.x + Math.cos(a) * 0.16, 1.2, slot.z + Math.sin(a) * 0.16, 0.13, shade(c, 1.1));
      });
      if (p.complete) {
        r.box(slot.x, 1.45, slot.z, 0.5, 0.06, 0.5, hex('#ffd700'));
      }
    });
    // Empty plate slots show as faint outlines.
    for (let i = state.plates.length; i < slots.length; i++) {
      r.cyl(slots[i].x, 1.09, slots[i].z, 0.42, 0.05, hex('#c8c8cc'));
    }
    // A component lands one by one: while a plate action runs, the piece
    // descends from above the counter onto its slot.
    const act = state.action;
    if (act && act.type === 'plate' && act.plate && act.item) {
      const idx = state.plates.indexOf(act.plate);
      const slot = slots[idx];
      if (slot) {
        const p = Math.min(1, act.t / act.duration);
        const c = INGREDIENTS[act.item.ing].color;
        r.box(slot.x, 2.4 - p * 1.2, slot.z, 0.3, 0.26, 0.3, c);
      }
    }
  }

  drawServing(r, state, time) {
    const s = stationById('serving');
    // Window frame + bell. Tier 2+ serving window gets a gold frame so
    // the upgrade reads at a glance.
    const wt = state.upgrades.window || 0;
    if (wt >= 2) {
      r.box(s.x, 1.7, s.z - 0.93, 1.5, 1.1, 0.06, hex('#c9a227'));
    }
    r.box(s.x, 1.7, s.z - 0.9, 1.3, 0.9, 0.15, hex('#1c3a5a'));
    r.box(s.x, 1.55, s.z + 0.55, 0.3, 0.3, 0.3, hex('#ffd700'));
    // Ready dishes lined up on the counter (front row = judge sees them).
    state.readyPlates.forEach((dish, i) => {
      const x = s.x - 0.35 + (i % 2) * 0.7;
      const z = s.z - 0.5 + Math.floor(i / 2) * 0.7;
      r.cyl(x, 1.1, z, 0.42, 0.07, hex('#f2f2f2'));
      const c = dish.color || [0.9, 0.7, 0.3];
      r.sph(x, 1.2, z, 0.2, shade(c, 1.1));
      r.sph(x + 0.12, 1.18, z + 0.08, 0.12, shade(c, 0.9));
    });
    // Tea pot (calming tea action) + cups + a tray stack on the counter.
    r.cyl(s.x - 0.35, 1.25, s.z + 0.75, 0.16, 0.3, hex('#7a4a8a'));
    r.sph(s.x - 0.35, 1.45, s.z + 0.75, 0.12, hex('#9a6aaa'));
    r.cyl(s.x + 0.35, 1.18, s.z + 0.7, 0.1, 0.18, hex('#f2f2f2'));
    r.cyl(s.x + 0.35, 1.18, s.z + 0.35, 0.1, 0.18, hex('#2f6db3'));
    r.cyl(s.x - 0.35, 1.12, s.z - 0.45, 0.3, 0.06, hex('#c9a227'));
    r.cyl(s.x - 0.35, 1.18, s.z - 0.45, 0.3, 0.06, hex('#c9a227'));
  }

  drawWarming(r, state, time) {
    const s = stationById('warming');
    // Rack + heat lamp glow + a basket of bread on the side.
    r.box(s.x, 1.35, s.z, 1.0, 0.08, 1.2, hex('#8a4a20'));
    r.box(s.x, 1.9, s.z, 0.9, 0.08, 0.5, hex('#c9a227'));
    r.sph(s.x, 1.8, s.z, 0.14, hex('#ffb347'));
    r.cyl(s.x, 1.2, s.z + 0.62, 0.24, 0.2, hex('#8a6a3a'));
    r.sph(s.x, 1.32, s.z + 0.62, 0.15, hex('#d9a05a'));
    (state.warmingItems || []).forEach((item, i) => {
      const c = INGREDIENTS[item.ing].color;
      r.sph(s.x - 0.25 + i * 0.5, 1.5, s.z, 0.18, shade(c, 1.1));
    });
  }

  // ---------- serving counter (left platform) ----------
  // A long wooden counter between the passengers and the kitchen:
  // customers stand behind it with their ticket, Cooking Dash style.
  // Solid (see stations.js OBSTACLES) — the chef walks around it.
  drawServingCounter(r, state, time) {
    const c = SERVING_COUNTER;
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      r.box(c.x + lx * (c.w / 2 - 0.08), 0.175, c.z + lz * (c.d / 2 - 0.08), 0.12, 0.35, 0.12, hex('#3a2a1a'));
    }
    r.box(c.x, 0.675, c.z, c.w, 0.65, c.d, hex('#6a4a2a'));
    r.box(c.x, 0.12, c.z, c.w - 0.2, 0.18, c.d - 0.2, hex('#241a10'));
    r.box(c.x, 1.02, c.z, c.w + 0.12, 0.08, c.d + 0.12, hex('#a07a44'));
    // Brass rail along the kitchen-side edge.
    r.box(c.x + c.w / 2 + 0.03, 1.08, c.z, 0.05, 0.05, c.d, hex('#c9a227'));
    // Cups, a teapot and a plate stack on the counter.
    r.cyl(c.x, 1.2, c.z - 1.2, 0.12, 0.22, hex('#f2f2f2'));
    r.cyl(c.x, 1.2, c.z + 0.4, 0.12, 0.22, hex('#7a4a8a'));
    r.cyl(c.x, 1.14, c.z + 1.4, 0.3, 0.08, hex('#f2f2f2'));
    r.sph(c.x, 1.35, c.z + 1.4, 0.12, hex('#c0392b'));
    // Chalkboard menu at the north end, facing the kitchen.
    r.box(c.x + 0.35, 1.55, c.z - c.d / 2 + 0.3, 0.06, 0.8, 0.9, hex('#101014'));
    r.box(c.x + 0.39, 1.75, c.z - c.d / 2 + 0.3, 0.02, 0.08, 0.6, hex('#ffd700'));
  }

  // ---------- centre prep table ----------
  // A work table in the middle of the floor with bowls and ingredients,
  // so the kitchen no longer reads as an empty checkerboard.
  drawPrepTable(r, state, time) {
    const t = PREP_TABLE;
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      r.box(t.x + lx * (t.w / 2 - 0.1), 0.175, t.z + lz * (t.d / 2 - 0.1), 0.12, 0.35, 0.12, hex('#3a2a1a'));
    }
    r.box(t.x, 0.675, t.z, t.w, 0.65, t.d, hex('#7a5230'));
    r.box(t.x, 1.02, t.z, t.w + 0.12, 0.08, t.d + 0.12, hex('#c89a5e'));
    // Bowl of tomato, a cutting board with lettuce, a plate stack.
    r.cyl(t.x - 0.8, 1.2, t.z, 0.28, 0.2, hex('#e8e8e8'));
    r.sph(t.x - 0.8, 1.3, t.z, 0.16, hex('#e74c3c'));
    r.box(t.x + 0.1, 1.12, t.z + 0.1, 0.7, 0.06, 0.45, hex('#e8d5a8'));
    r.box(t.x + 0.1, 1.2, t.z + 0.1, 0.2, 0.14, 0.2, INGREDIENTS.lettuce.color);
    r.cyl(t.x + 0.9, 1.18, t.z - 0.2, 0.26, 0.14, hex('#f2f2f2'));
    r.cyl(t.x + 0.9, 1.26, t.z - 0.2, 0.26, 0.14, hex('#f2f2f2'));
    r.sph(t.x + 0.9, 1.34, t.z - 0.2, 0.13, hex('#f39c12'));
  }

  // ---------- waiting bench + suitcases (left platform) ----------
  // Passengers wait on the platform: a wooden bench behind the serving
  // counter, suitcases beside it. Solid (see stations.js OBSTACLES).
  drawPlatformFurniture(r, state, time) {
    // Bench: seat + backrest + legs, red cushion.
    r.box(-6.35, 0.55, 0.5, 0.55, 0.12, 2.2, hex('#6a4a2a'));
    r.box(-6.35, 0.78, 0.5, 0.55, 0.1, 2.2, hex('#7a1f1f'));
    r.box(-6.6, 1.1, 0.5, 0.1, 0.9, 2.2, hex('#6a4a2a'));
    r.box(-6.35, 0.25, -0.4, 0.12, 0.5, 0.12, hex('#3a2a1a'));
    r.box(-6.35, 0.25, 1.4, 0.12, 0.5, 0.12, hex('#3a2a1a'));
    // Suitcases: one blue by the bench's north end, one red south.
    r.box(-6.35, 0.3, -1.35, 0.5, 0.55, 0.35, hex('#2f6db3'));
    r.box(-6.35, 0.62, -1.35, 0.3, 0.08, 0.06, hex('#222222'));
    r.box(-6.35, 0.3, 2.35, 0.45, 0.5, 0.32, hex('#c0392b'));
    r.box(-6.35, 0.58, 2.35, 0.28, 0.07, 0.06, hex('#222222'));
    // A spare suitcase south of the bench, on the platform.
    r.box(-6.35, 0.26, 3.1, 0.42, 0.46, 0.3, hex('#7a4a8a'));
  }

  // ---------- passengers (left platform) ----------
  drawPassengers(r, state, time) {
    const waiting = state.orders.filter((o) => o.state === 'waiting');
    waiting.forEach((o) => {
      const spot = PASSENGER_SPOTS[o.spot];
      if (!spot) return;
      const p = PASSENGERS[o.passenger] || PASSENGERS.santai;
      const joy = state.passengerJoy && state.passengerJoy.spot === o.spot;
      const bob = joy ? Math.abs(Math.sin(time * 10)) * 0.18 : Math.sin(time * 2 + o.spot) * 0.03;
      // Body capsule + head, passenger colour. They face the kitchen (+x).
      r.cyl(spot.x, 0.55 + bob, spot.z, 0.34, 0.9, p.color);
      r.sph(spot.x, 1.25 + bob, spot.z, 0.28, hex('#f0c08a'));
      // Eyes on the kitchen-facing side of the face.
      r.sph(spot.x + 0.22, 1.28 + bob, spot.z - 0.09, 0.04, hex('#1a1a1a'));
      r.sph(spot.x + 0.22, 1.28 + bob, spot.z + 0.09, 0.04, hex('#1a1a1a'));
      // Hair cap + a hat that says who they are: VIP top hat, Buru-buru
      // a cap, Santai a headband. Passengers are people, not pawns.
      r.sph(spot.x, 1.42 + bob, spot.z, 0.26, o.passenger === 'vip' ? hex('#2a2a2a') : hex('#5a3a1a'));
      if (o.passenger === 'vip') {
        r.cyl(spot.x, 1.62 + bob, spot.z, 0.2, 0.3, hex('#1a1a1a'));
        r.cyl(spot.x, 1.48 + bob, spot.z, 0.32, 0.05, hex('#1a1a1a'));
        r.cyl(spot.x, 1.56 + bob, spot.z, 0.21, 0.05, hex('#c9a227'));
      } else if (o.passenger === 'buru') {
        r.cyl(spot.x, 1.58 + bob, spot.z, 0.24, 0.1, hex('#e67e22'));
        r.box(spot.x + 0.3, 1.56 + bob, spot.z, 0.22, 0.04, 0.3, hex('#e67e22'));
      } else {
        r.cyl(spot.x, 1.44 + bob, spot.z, 0.27, 0.07, hex('#2f6db3'));
      }
      // Ticket card above the head (white, tilted toward camera).
      r.box(spot.x + 0.55, 1.9 + bob, spot.z, 0.85, 0.6, 0.06, hex('#fdfdf2'));
      r.box(spot.x + 0.55, 1.9 + bob, spot.z + 0.04, 0.6, 0.12, 0.02, o.recipeColor || [0.9, 0.7, 0.3]);
      if (o.express) {
        r.box(spot.x + 0.55, 2.25 + bob, spot.z, 0.5, 0.16, 0.06, hex('#ffd700'));
      }
    });
  }

  // ---------- chef ----------
  drawChef(r, state, time) {
    const c = state.chef;
    const bobY = c.moving ? Math.abs(Math.sin(c.bob)) * 0.07 : 0;
    const x = c.x, z = c.z;
    // Body (white coat) + apron + head + tall chef hat. Scaled up a touch
    // so the chef reads clearly at 768x480.
    r.cyl(x, 0.8 + bobY, z, 0.4, 1.05, hex('#f5f5f0'));
    const fx = Math.sin(c.facing), fz = Math.cos(c.facing);
    // Perpendicular to facing, for the eyes / arms / pocket.
    const px = Math.cos(c.facing), pz = -Math.sin(c.facing);
    // Apron (blue) + pocket + two buttons + red neckerchief.
    r.box(x + fx * 0.38, 0.75 + bobY, z + fz * 0.38, 0.46, 0.6, 0.08, hex('#2f6db3'));
    r.box(x + fx * 0.42, 0.55 + bobY, z + fz * 0.42, 0.2, 0.16, 0.04, hex('#2a5a94'));
    r.sph(x + px * 0.1 + fx * 0.41, 0.95 + bobY, z + pz * 0.1 + fz * 0.41, 0.035, hex('#f2f2f2'));
    r.sph(x - px * 0.1 + fx * 0.41, 0.95 + bobY, z - pz * 0.1 + fz * 0.41, 0.035, hex('#f2f2f2'));
    r.cyl(x, 1.36 + bobY, z, 0.3, 0.1, hex('#c0392b'));
    // Head + eyes + tall chef hat with a blue band.
    r.sph(x, 1.62 + bobY, z, 0.32, hex('#f0c08a'));
    r.sph(x + fx * 0.26 + px * 0.11, 1.66 + bobY, z + fz * 0.26 + pz * 0.11, 0.045, hex('#1a1a1a'));
    r.sph(x + fx * 0.26 - px * 0.11, 1.66 + bobY, z + fz * 0.26 - pz * 0.11, 0.045, hex('#1a1a1a'));
    r.cyl(x, 1.92 + bobY, z, 0.34, 0.24, hex('#ffffff'));
    r.cyl(x, 1.82 + bobY, z, 0.35, 0.08, hex('#2f6db3'));
    r.box(x, 2.1 + bobY, z, 0.48, 0.2, 0.48, hex('#ffffff'));
    // Boots when the shoes upgrade is bought (tier 1 brown, tier 2+ red,
    // tier 3 with gold trim) — the upgrade reads on the chef himself.
    const shoeTier = state.upgrades.shoes || 0;
    if (shoeTier > 0) {
      const bootCol = shoeTier >= 2 ? hex('#c0392b') : hex('#5a3a1a');
      r.box(x - 0.16, 0.12 + bobY, z + fz * 0.12, 0.22, 0.22, 0.34, bootCol);
      r.box(x + 0.16, 0.12 + bobY, z + fz * 0.12, 0.22, 0.22, 0.34, bootCol);
      if (shoeTier >= 3) {
        r.box(x - 0.16, 0.26 + bobY, z + fz * 0.12, 0.24, 0.05, 0.36, hex('#c9a227'));
        r.box(x + 0.16, 0.26 + bobY, z + fz * 0.12, 0.24, 0.05, 0.36, hex('#c9a227'));
      }
    }
    // Two arms reaching toward the facing direction.
    r.box(x + fx * 0.36 + px * 0.2, 1.08 + bobY, z + fz * 0.36 + pz * 0.2, 0.16, 0.16, 0.44, hex('#e8e8e0'));
    r.box(x + fx * 0.36 - px * 0.2, 1.08 + bobY, z + fz * 0.36 - pz * 0.2, 0.16, 0.16, 0.44, hex('#e8e8e0'));
    // Carried items float above the hands.
    c.hands.forEach((item, i) => {
      if (!item) return;
      const col = INGREDIENTS[item.ing] ? INGREDIENTS[item.ing].color : [0.8, 0.8, 0.8];
      const off = i === 0 ? -0.24 : 0.24;
      const px2 = x + fx * 0.5 + Math.cos(c.facing) * off;
      const pz2 = z + fz * 0.5 - Math.sin(c.facing) * off;
      const done = item.chopped || item.cooked;
      r.box(px2, 1.35 + bobY, pz2, 0.32, done ? 0.22 : 0.32, 0.32, done ? shade(col, 1.25) : col);
    });
  }

  drawSousChef(r, state, time) {
    // Helper in a teal coat, chopping at the board's side.
    const x = -1.6, z = -2.2;
    const bobY = Math.abs(Math.sin(time * 6)) * 0.04;
    r.cyl(x, 0.75 + bobY, z, 0.32, 0.9, hex('#2a9d8f'));
    r.sph(x, 1.45 + bobY, z, 0.26, hex('#e8b88a'));
    r.cyl(x, 1.7 + bobY, z, 0.26, 0.18, hex('#ffffff'));
  }

  // ---------- waiters (Pelayan upgrade) ----------
  // Maroon coat + cream apron + flat cap: distinct from the chef (white
  // coat, blue apron) and the sous-chef (teal). Carries a gold tray
  // while delivering; the delivery plate flies separately (0.9s arc).
  drawWaiters(r, state, time) {
    for (const w of state.waiters || []) {
      const bobY = w.moving ? Math.abs(Math.sin(w.bob)) * 0.06 : 0;
      const fx = Math.sin(w.facing), fz = Math.cos(w.facing);
      const px = Math.cos(w.facing), pz = -Math.sin(w.facing);
      r.cyl(w.x, 0.75 + bobY, w.z, 0.36, 0.95, hex('#7b2d26'));
      r.box(w.x + fx * 0.34, 0.7 + bobY, w.z + fz * 0.34, 0.42, 0.55, 0.08, hex('#f5ead0'));
      // Bow tie + eyes, so the waiter reads as a person mid-route.
      r.box(w.x + fx * 0.38, 1.28 + bobY, w.z + fz * 0.38, 0.16, 0.07, 0.05, hex('#1a1a1a'));
      r.sph(w.x, 1.5 + bobY, w.z, 0.28, hex('#e8b88a'));
      r.sph(w.x + fx * 0.22 + px * 0.1, 1.54 + bobY, w.z + fz * 0.22 + pz * 0.1, 0.04, hex('#1a1a1a'));
      r.sph(w.x + fx * 0.22 - px * 0.1, 1.54 + bobY, w.z + fz * 0.22 - pz * 0.1, 0.04, hex('#1a1a1a'));
      r.cyl(w.x, 1.72 + bobY, w.z, 0.3, 0.08, hex('#2a2a2a'));
      if (w.carrying) {
        r.cyl(w.x + fx * 0.5, 1.15 + bobY, w.z + fz * 0.5, 0.4, 0.05, hex('#c9a227'));
        const c = w.carrying.color || [0.9, 0.7, 0.3];
        r.sph(w.x + fx * 0.5, 1.24 + bobY, w.z + fz * 0.5, 0.16, shade(c, 1.1));
      }
      if (w.anim) this.drawFlyingPlate(r, w.anim);
    }
  }

  drawParticles(r, state) {
    (state.particles || []).forEach((p) => {
      r.sph(p.x, p.y, p.z, p.r, [0.92, 0.92, 0.95]);
    });
  }
}

export function stationById(id) {
  return STATIONS.find((s) => s.id === id) || null;
}
