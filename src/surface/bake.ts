import { LOOK, MATERIAL_NAMES, type Look } from "./look.ts";
import type { At, Feature, Field, Scene, ScenePart } from "./relief.ts";
import { inset, tabInset } from "./dither.ts";

/**
 * Bakes a scene to per-cell shading data: parts become one height field, which is lit, shadowed and occluded at
 * `samples` per cell side and then averaged to cells. Painting (dithering) lives in paint.ts.
 *
 * The maths is the prototype's. The speed comes from things that don't change a result:
 * - Samples sit on whole indices, so a ray step or an occlusion tap always lands the same fraction between two
 *   samples. Its offset and bilinear weights are worked out once, not per sample, and a tap that lands on a sample
 *   reads one height instead of four.
 * - The field is padded by replicating its edge, which is what clamping the index does, so lookups need no checks.
 * - A coarse grid of the tallest heights says how far a shadow ray can matter: past that, nothing in its path
 *   can darken it, so the walk stops. (The prototype's own early break, once the ray clears the top, is kept.)
 * - Occlusion is worked a row at a time, one tap per tight loop, and only across the part's samples.
 * - The height field and blur buffers are reused between bakes.
 */

/** The coarse grid's blocks are BLOCK × BLOCK samples. */
const SHIFT = 3;
const BLOCK = 1 << SHIFT;

/** The shadow ray's furthest reach, in CSS px. */
const REACH_PX = 12;

const RING = 8;
const RING_STEPS = [0.3, 0.6, 1];

/** Scratch that is only live inside one bake; a bake is synchronous, so the next one can reuse it. */
let heightBuf = new Float32Array(0);
let blurBuf = new Float32Array(0);

function scratch(buf: Float32Array<ArrayBuffer>, n: number) {
  return buf.length >= n ? buf.fill(0, 0, n) : new Float32Array(n);
}

/** Offsets and bilinear weights for reading `n` taps at fractional sample offsets from a whole index. */
function taps(xs: ArrayLike<number>, ys: ArrayLike<number>, PW: number) {
  const n = xs.length;
  const off = new Int32Array(n);
  const w = new Float64Array(n * 4);
  // What a tap has to read: 0 one sample, 1 two side by side, 2 two one above the other, 3 all four.
  const kind = new Uint8Array(n);
  // A fraction this close to a whole index is a whole index (cos 90° is 6e-17, not 0).
  const SNAP = 1e-9;
  let single = true;
  for (let t = 0; t < n; t++) {
    let fx = Math.floor(xs[t]!);
    let fy = Math.floor(ys[t]!);
    let u = xs[t]! - fx;
    let v = ys[t]! - fy;
    if (u < SNAP) u = 0;
    else if (u > 1 - SNAP) {
      u = 0;
      fx++;
    }
    if (v < SNAP) v = 0;
    else if (v > 1 - SNAP) {
      v = 0;
      fy++;
    }
    off[t] = fy * PW + fx;
    w[t * 4] = (1 - u) * (1 - v);
    w[t * 4 + 1] = u * (1 - v);
    w[t * 4 + 2] = (1 - u) * v;
    w[t * 4 + 3] = u * v;
    kind[t] = u === 0 && v === 0 ? 0 : v === 0 ? 1 : u === 0 ? 2 : 3;
    if (kind[t] !== 0) single = false;
  }
  return { off, w, kind, single };
}

type Taps = ReturnType<typeof taps>;

/** One tap's height: the bilinear of the samples around `o`, reading only the ones its weights use. */
function tapAt(Z: Float32Array, o: number, PW: number, w: Float64Array, b: number, kind: number) {
  if (kind === 0) return Z[o]!;
  if (kind === 1) return Z[o]! * w[b]! + Z[o + 1]! * w[b + 1]!;
  if (kind === 2) return Z[o]! * w[b]! + Z[o + PW]! * w[b + 2]!;
  return Z[o]! * w[b]! + Z[o + 1]! * w[b + 1]! + Z[o + PW]! * w[b + 2]! + Z[o + PW + 1]! * w[b + 3]!;
}

/** Fraction of light reaching a point, walking `steps` steps toward the light. */
function lightAt(Z: Float32Array, kp: number, z: number, steps: number, PW: number, ray: Taps, rises: Float64Array, inv: Float64Array) {
  const { off, w, kind } = ray;
  let lightIn = 1;
  for (let s = 1; s <= steps; s++) {
    const ground = tapAt(Z, kp + off[s]!, PW, w, s * 4, kind[s]!);
    lightIn = Math.min(lightIn, 0.5 + (z + rises[s]! - ground) * inv[s]!);
    if (lightIn <= 0) return 0;
  }
  return lightIn;
}

/** `lightAt` for a light straight up or down a row or column, where every step lands on a sample. */
function lightAtAligned(Z: Float32Array, kp: number, z: number, steps: number, off: Int32Array, rises: Float64Array, inv: Float64Array) {
  let lightIn = 1;
  for (let s = 1; s <= steps; s++) {
    lightIn = Math.min(lightIn, 0.5 + (z + rises[s]! - Z[kp + off[s]!]!) * inv[s]!);
    if (lightIn <= 0) return 0;
  }
  return lightIn;
}

/**
 * For samples `a..b` of one row (`row` is the index of the row's sample 0), the sum over the ring's directions of how
 * far the horizon rises, squashed to 0..1 each. Worked a tap at a time along the row, so each loop is tight and reads
 * only the neighbours its tap has weight on.
 */
function hiddenRow(
  Z: Float32Array,
  row: number,
  a: number,
  b: number,
  PW: number,
  ring: Taps,
  invDist: Float64Array,
  horizon: Float64Array,
  stride: number,
  out: Float64Array,
) {
  const { off, w, kind } = ring;
  for (let d = 0; d < RING; d++) {
    const h = d * stride;
    horizon.fill(0, h + a, h + b + 1);
    for (let t = d * 3; t < d * 3 + 3; t++) {
      const o = row + off[t]!;
      const inv = invDist[t]!;
      const q = t * 4;
      const w0 = w[q]!;
      const w1 = w[q + 1]!;
      const w2 = w[q + 2]!;
      const w3 = w[q + 3]!;
      const k = kind[t]!;
      if (k === 0) {
        for (let i = a; i <= b; i++) horizon[h + i] = Math.max(horizon[h + i]!, (Z[o + i]! - Z[row + i]!) * inv);
      } else if (k === 1) {
        for (let i = a; i <= b; i++) horizon[h + i] = Math.max(horizon[h + i]!, (Z[o + i]! * w0 + Z[o + i + 1]! * w1 - Z[row + i]!) * inv);
      } else if (k === 2) {
        for (let i = a; i <= b; i++) horizon[h + i] = Math.max(horizon[h + i]!, (Z[o + i]! * w0 + Z[o + i + PW]! * w2 - Z[row + i]!) * inv);
      } else {
        for (let i = a; i <= b; i++)
          horizon[h + i] = Math.max(horizon[h + i]!, (Z[o + i]! * w0 + Z[o + i + 1]! * w1 + Z[o + i + PW]! * w2 + Z[o + i + PW + 1]! * w3 - Z[row + i]!) * inv);
      }
    }
  }
  for (let i = a; i <= b; i++) {
    let hidden = 0;
    for (let d = 0; d < RING; d++) {
      const v = horizon[d * stride + i]!;
      if (v > 0) hidden += v / Math.sqrt(1 + v * v);
    }
    out[i] = hidden;
  }
}

/** Tallest sample in each block of the interior. */
function blockMax(Z: Float32Array, PW: number, pad: number, W: number, H: number, gw: number, gh: number) {
  const out = new Float32Array(gw * gh).fill(-Infinity);
  for (let j = 0; j < H; j++) {
    const row = (j + pad) * PW + pad;
    const g = (j >> SHIFT) * gw;
    for (let i = 0; i < W; i++) {
      const b = g + (i >> SHIFT);
      if (Z[row + i]! > out[b]!) out[b] = Z[row + i]!;
    }
  }
  return out;
}

/**
 * For each block, the tallest sample a shadow ray started in it can read. The ray's steps are taken in groups; each
 * group is bounded by the box its taps can fall in (any start in the block, a bilinear read one past), which is a
 * superset of what it really touches.
 */
function rayMax(heights: Float32Array, gw: number, gh: number, dirX: number, dirY: number, reach: number) {
  const out = new Float32Array(gw * gh).fill(-Infinity);
  const group = BLOCK >> 1;
  for (let by = 0; by < gh; by++)
    for (let bx = 0; bx < gw; bx++) {
      let m = -Infinity;
      for (let s0 = 1; s0 <= reach; s0 += group) {
        const s1 = Math.min(s0 + group - 1, reach);
        const x0 = bx * BLOCK + Math.min(dirX * s0, dirX * s1);
        const x1 = bx * BLOCK + BLOCK - 1 + Math.max(dirX * s0, dirX * s1);
        const y0 = by * BLOCK + Math.min(dirY * s0, dirY * s1);
        const y1 = by * BLOCK + BLOCK - 1 + Math.max(dirY * s0, dirY * s1);
        const ax = Math.max(0, Math.floor(Math.floor(x0) / BLOCK));
        const bxe = Math.min(gw - 1, Math.floor((Math.floor(x1) + 1) / BLOCK));
        const ay = Math.max(0, Math.floor(Math.floor(y0) / BLOCK));
        const bye = Math.min(gh - 1, Math.floor((Math.floor(y1) + 1) / BLOCK));
        for (let y = ay; y <= bye; y++) for (let x = ax; x <= bxe; x++) m = Math.max(m, heights[y * gw + x]!);
      }
      out[by * gw + bx] = m;
    }
  return out;
}

/** Box blur of the interior, reading the padded field so edges clamp for free. Needs `pad >= r + 2`. */
function boxBlur(Z: Float32Array, PW: number, pad: number, W: number, H: number, r: number) {
  const n = 2 * r + 1;
  const rowsNeeded = H + 2 * r + 2;
  const tmp = scratch(blurBuf, rowsNeeded * W);
  blurBuf = tmp;
  const first = pad - r - 1; // padded row held in tmp row 0
  for (let y = 0; y < rowsNeeded; y++) {
    const row = (first + y) * PW + pad;
    let sum = 0;
    for (let a = -r; a <= r; a++) sum += Z[row + a]!;
    for (let i = 0; i < W; i++) {
      tmp[y * W + i] = sum / n;
      sum += Z[row + i + r + 1]! - Z[row + i - r]!;
    }
  }
  const out = new Float32Array(W * H);
  const col = new Float64Array(W);
  for (let b = -r; b <= r; b++) for (let i = 0; i < W; i++) col[i]! += tmp[(pad + b - first) * W + i]!;
  for (let j = 0; j < H; j++) {
    const lead = (pad + j + r + 1 - first) * W;
    const trail = (pad + j - r - first) * W;
    for (let i = 0; i < W; i++) {
      out[j * W + i] = col[i]! / n;
      col[i]! += tmp[lead + i]! - tmp[trail + i]!;
    }
  }
  return out;
}

/** Adds a part's relief to the padded height field and marks the samples it covers. */
function rasterise(Z: Float32Array, mat: Int8Array, PW: number, pad: number, W: number, H: number, px: number, part: ScenePart, m: number, at: At) {
  const features: readonly Feature[] = part.relief;
  const nf = features.length;
  const half = Math.min(part.w, part.h) / 2;
  const r = Math.min(part.r, half);
  const hw = part.w / 2;
  const hh = part.h / 2;
  const tab = part.tab;
  at.half = half;
  at.tab = part.tab;
  at.w = part.w;
  at.h = part.h;
  // A sample is on the part when its centre is; find the columns and rows that holds for with the same test.
  const j0 = Math.max(0, Math.floor(part.y / px - 0.5) - 1);
  const j1 = Math.min(H - 1, Math.ceil((part.y + part.h) / px) + 1);
  let i0 = Math.max(0, Math.floor(part.x / px - 0.5) - 1);
  let i1 = Math.min(W - 1, Math.ceil((part.x + part.w) / px) + 1);
  while (i0 <= i1 && ((i0 + 0.5) * px - part.x < 0 || (i0 + 0.5) * px - part.x > part.w)) i0++;
  while (i1 >= i0 && ((i1 + 0.5) * px - part.x < 0 || (i1 + 0.5) * px - part.x > part.w)) i1--;
  if (i1 < i0) return;

  // What depends only on the column.
  const n = i1 - i0 + 1;
  const xs = new Float64Array(n);
  const qxs = new Float64Array(n);
  const qxOut2 = new Float64Array(n);
  const qCol = new Float64Array(n);
  for (let c = 0; c < n; c++) {
    const x = (i0 + c + 0.5) * px - part.x;
    const qx = Math.abs(x - hw) - (hw - r);
    xs[c] = x;
    qxs[c] = qx;
    qxOut2[c] = Math.max(qx, 0) ** 2;
    qCol[c] = ((x - hw) / hw) ** 2;
  }

  for (let j = j0; j <= j1; j++) {
    const y = (j + 0.5) * px - part.y;
    if (y < 0 || y > part.h) continue;
    const qy = Math.abs(y - hh) - (hh - r);
    const qyOut2 = Math.max(qy, 0) ** 2;
    const qRow = ((y - hh) / hh) ** 2;
    const zRow = (j + pad) * PW + pad;
    const mRow = j * W;
    at.y = y;
    for (let c = 0; c < n; c++) {
      const qx = qxs[c]!;
      const d = tab ? Math.max(inset(xs[c]!, y - tab.h, part.w, part.h - tab.h, r), tabInset(xs[c]!, y, tab, tab.h + r)) : r - Math.sqrt(qxOut2[c]! + qyOut2) - Math.min(Math.max(qx, qy), 0);
      if (d <= 0) continue;
      at.d = d;
      at.q = qCol[c]! + qRow;
      at.x = xs[c]!;
      let z = 0;
      for (let f = 0; f < nf; f++) z += features[f]!(at);
      Z[zRow + i0 + c]! += z;
      mat[mRow + i0 + c] = m;
    }
  }
}

export function bakeField(scene: Scene, cellCss: number, look: Look = LOOK): Field {
  const S = look.samples;
  const cols = Math.ceil(scene.width / cellCss);
  const rows = Math.ceil(scene.height / cellCss);
  const W = cols * S;
  const H = rows * S;
  const px = cellCss / S; // CSS px per sample

  const maxReach = Math.ceil(REACH_PX / px);
  const occReach = Math.ceil(look.occlusion.radius / px);
  const blurR = Math.max(1, Math.round(look.edge.radius / px));
  // Room for every lookup (a bilinear reads one past) so none needs a bounds check.
  const pad = Math.max(maxReach, occReach, blurR) + 2;
  const PW = W + 2 * pad;
  const PH = H + 2 * pad;

  // ---- height field and material, parts back to front
  const Z = scratch(heightBuf, PW * PH);
  heightBuf = Z;
  const mat = new Int8Array(W * H).fill(-1);
  const at: At = { d: 0, q: 0, half: 0, x: 0, y: 0, w: 0, h: 0 };

  for (const part of scene.parts) {
    const m = MATERIAL_NAMES.indexOf(part.material ?? "bone");
    if (m < 0) throw new Error(`bakeField: unknown material "${String(part.material)}"`);
    rasterise(Z, mat, PW, pad, W, H, px, part, m, at);
  }

  // Replicate the edge into the padding: same as clamping the index.
  for (let j = 0; j < H; j++) {
    const row = (j + pad) * PW;
    Z.fill(Z[row + pad]!, row, row + pad);
    Z.fill(Z[row + pad + W - 1]!, row + pad + W, row + PW);
  }
  for (let j = 0; j < pad; j++) {
    Z.copyWithin(j * PW, pad * PW, (pad + 1) * PW);
    Z.copyWithin((pad + H + j) * PW, (pad + H - 1) * PW, (pad + H) * PW);
  }

  // ---- the light, pointing from the surface toward it
  const ang = (look.light.angle * Math.PI) / 180;
  const elev = (look.light.height * Math.PI) / 180;
  const Lx = Math.sin(ang) * Math.cos(elev);
  const Ly = -Math.cos(ang) * Math.cos(elev);
  const Lz = Math.sin(elev);
  const flatLen = Math.hypot(Lx, Ly) || 1;
  const dirX = Lx / flatLen;
  const dirY = Ly / flatLen;
  const rise = Lz / flatLen / look.shadow.reach; // px of height gained per px travelled toward the light
  const { soft, strength } = look.shadow;
  const stepRise = px * rise;

  const blurred = boxBlur(Z, PW, pad, W, H, blurR);

  let top = -Infinity;
  for (let j = 0; j < H; j++) {
    const row = (j + pad) * PW + pad;
    for (let i = 0; i < W; i++) top = Math.max(top, Z[row + i]!);
  }
  const ceiling = top + 1; // a ray above this clears everything

  // Per-step shadow taps: where the ray reads, how high it is, and how soft the edge is at that step.
  const rayX = new Float64Array(maxReach + 1);
  const rayY = new Float64Array(maxReach + 1);
  const rises = new Float64Array(maxReach + 1);
  const soften = new Float64Array(maxReach + 1);
  for (let s = 0; s <= maxReach; s++) {
    rayX[s] = dirX * s;
    rayY[s] = dirY * s;
    rises[s] = s * stepRise;
    soften[s] = 1 / (soft * s * px + 0.35);
  }
  const ray = taps(rayX, rayY, PW);

  // Shadow steps past s px*(rise - soft/2) >= 0.175 + (tallest in the ray's path - z) can't darken anything.
  const slack = rise - 0.5 * soft;
  const gw = Math.ceil(W / BLOCK);
  const gh = Math.ceil(H / BLOCK);
  const heights = blockMax(Z, PW, pad, W, H, gw, gh);
  const pathMax = rayMax(heights, gw, gh, dirX, dirY, maxReach);

  // Occlusion rings: 8 directions, 3 distances.
  const ringX = new Float64Array(RING * 3);
  const ringY = new Float64Array(RING * 3);
  const ringInv = new Float64Array(RING * 3);
  for (let d = 0; d < RING; d++) {
    const cx = Math.cos((d * 45 * Math.PI) / 180);
    const cy = Math.sin((d * 45 * Math.PI) / 180);
    for (let t = 0; t < 3; t++) {
      const dist = RING_STEPS[t]! * look.occlusion.radius;
      ringX[d * 3 + t] = (cx * dist) / px;
      ringY[d * 3 + t] = (cy * dist) / px;
      ringInv[d * 3 + t] = 1 / dist;
    }
  }
  const ring = taps(ringX, ringY, PW);
  const horizon = new Float64Array(RING * W);
  const hidden = new Float64Array(W);

  const { gain, fill } = look.light;
  const { ridge, crease } = look.edge;
  const occStrength = look.occlusion.strength;
  const mats = MATERIAL_NAMES.map((name) => look.materials[name]);
  const NM = MATERIAL_NAMES.length;
  const invStepRise = stepRise > 0 ? 1 / stepRise : 0;
  const invSlack = slack > 0 ? 1 / (slack * px) : 0;

  // Per-cell sums, filled as samples go by in scan order (a cell's samples arrive row by row, as in the prototype).
  const cells = cols * rows;
  const sum = new Float64Array(cells);
  const shadeSum = new Float64Array(cells);
  const count = new Uint16Array(cells);
  const votes = new Uint16Array(cells * NM);
  const firstSeen = new Uint16Array(cells * NM); // sample number a material first voted at, to break ties

  for (let j = 0; j < H; j++) {
    const kRow = (j + pad) * PW + pad;
    const gRow = (j >> SHIFT) * gw;
    const cRow = ((j / S) | 0) * cols;
    const vSub = (j % S) * S;
    let cx = 0;
    let uSub = 0;
    // Occlusion is only needed on the part's samples, which for one row lie between the first and last.
    let first = 0;
    let last = W - 1;
    while (first < W && mat[j * W + first]! < 0) first++;
    while (last >= first && mat[j * W + last]! < 0) last--;
    if (first <= last) hiddenRow(Z, kRow, first, last, PW, ring, ringInv, horizon, W, hidden);
    for (let i = 0; i < W; i++) {
      const c = cRow + cx;
      const seq = vSub + uSub;
      if (++uSub === S) {
        uSub = 0;
        cx++;
      }
      const kp = kRow + i;
      const k = j * W + i;
      const z = Z[kp]!;
      const g = gRow + (i >> SHIFT);

      // Cast shadow: walk toward the light and see whether anything stands in the way.
      let steps = maxReach;
      if (stepRise > 0) {
        const clear = Math.floor((ceiling - z) * invStepRise); // the prototype stops once the ray is above `ceiling`
        if (clear < steps) steps = clear;
      }
      if (slack > 0) {
        const matters = Math.floor((0.175 + pathMax[g]! - z) * invSlack) + 1;
        if (matters < steps) steps = matters;
      }
      const lightIn = steps <= 0 ? 1 : ray.single ? lightAtAligned(Z, kp, z, steps, ray.off, rises, soften) : lightAt(Z, kp, z, steps, PW, ray, rises, soften);

      const m = mat[k]!;
      if (m < 0) {
        shadeSum[c]! += (1 - lightIn) * strength;
        continue;
      }
      const material = mats[m]!;
      const hx = (Z[kp + 1]! - Z[kp - 1]!) / (2 * px);
      const hy = (Z[kp + PW]! - Z[kp - PW]!) / (2 * px);
      const len = Math.sqrt(hx * hx + hy * hy + 1);
      const key = Math.max(0, (-hx * Lx - hy * Ly + Lz) / len) / Lz;
      const lit = key * (1 - fill) + (1 / len) * fill;

      // Occlusion: how much of the sky the neighbours hide.
      const open = 1 - occStrength * (hidden[i]! / RING);
      const bump = z - blurred[k]!; // above its surroundings: a convex edge; below: a crease
      let t = material.flat * (1 - (1 - lit) * gain);
      t *= 1 - (1 - lightIn) * strength;
      t *= open;
      t += bump > 0 ? bump * ridge * 0.12 : bump * crease * 0.12;
      sum[c]! += Math.max(material.floor * material.flat, Math.min(1, t));
      count[c]!++;
      const vi = c * NM + m;
      if (votes[vi]!++ === 0) firstSeen[vi] = seq;
    }
  }

  // ---- cells
  const tone = new Float32Array(cells);
  const cover = new Float32Array(cells);
  const cast = new Float32Array(cells);
  const owner = new Int8Array(cells).fill(-1);
  const area = S * S;
  for (let c = 0; c < cells; c++) {
    const n = count[c]!;
    cover[c] = n / area;
    cast[c] = shadeSum[c]! / area;
    tone[c] = n ? sum[c]! / n : 0;
    let best = -1;
    let bestVotes = 0;
    for (let m = 0; m < NM; m++) {
      const v = votes[c * NM + m]!;
      if (v > bestVotes || (v > 0 && v === bestVotes && firstSeen[c * NM + m]! < firstSeen[c * NM + best]!)) {
        best = m;
        bestVotes = v;
      }
    }
    owner[c] = best;
  }

  return { cols, rows, cell: cellCss, tone, owner, cover, cast };
}
