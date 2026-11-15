// One PNG that lets you judge generated 3D kits against the target at a glance, in a few seconds:
//   node scripts/render-gen.ts <course.json> [more.json ...] [--out out/gen/render/<name>.png]
// A file is a GenCourse (its `kit` is drawn) or a bare Kit. The first column is the reference: the photo and the hand-made
// PEN_SHELL; fixtures/courses/pen.gold.json is added as a column when it exists. Each kit gets front and back shaded views,
// the dithered look the app draws (the real KitViewer), a close-up of the top and bottom third, the 2D profile of every part
// (r against y, in the part's colour) and a 3D cut-away through the middle. A kit that does not parse says why in its column.
// The page is served by Vite on port 5194 and drawn in Playwright; the page's own code is written to out/gen/render/page/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { Page } from "playwright-core";
import { createServer } from "vite";
import { Kit, kitProblems } from "../shared/kit.ts";
import { launchChromium, root } from "./browser.ts";

type Entry = {
  label: string;
  kit: Kit | null;
  /** Part count, known even when the kit does not parse. */
  parts: number | null;
  /** Everything wrong with the file, shown in red in its column. */
  problems: string[];
  reference?: boolean;
};

const PORT = 5194;
const outDir = join(root, "out", "gen", "render");
const pageDir = join(outDir, "page");
const PHOTO = "fixtures/photos/pen.jpg";
const GOLD = join(root, "fixtures", "courses", "pen.gold.json");

const args = process.argv.slice(2);
let outPath: string | undefined;
const files: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === "--out") outPath = resolve(args[++i] ?? "");
  else if (a.startsWith("--out=")) outPath = resolve(a.slice("--out=".length));
  else files.push(resolve(a));
}
if (files.length === 0) {
  console.error("usage: node scripts/render-gen.ts <course.json> [more.json ...] [--out out/gen/render/<name>.png]");
  process.exit(2);
}
outPath ??= join(outDir, `${basename(files[0]!).replace(/\.json$/, "")}${files.length > 1 ? `+${files.length - 1}` : ""}.png`);

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n").slice(0, 4).join(" ");

function fromRaw(label: string, raw: unknown, reference = false): Entry {
  const kitRaw = raw !== null && typeof raw === "object" && "kit" in raw ? (raw as { kit: unknown }).kit : raw;
  const parsed = Kit.safeParse(kitRaw);
  if (!parsed.success) {
    const count = (kitRaw as { parts?: unknown } | null)?.parts;
    const problems = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "kit"}: ${i.message}`);
    if (parsed.error.issues.length > 6) problems.push(`and ${parsed.error.issues.length - 6} more`);
    return { label, kit: null, parts: Array.isArray(count) ? count.length : null, problems, reference };
  }
  return { label, kit: parsed.data, parts: parsed.data.parts.length, problems: kitProblems(parsed.data), reference };
}

function fromFile(path: string, reference = false): Entry {
  const label = basename(path);
  try {
    return fromRaw(label, JSON.parse(readFileSync(path, "utf8")), reference);
  } catch (e) {
    return { label, kit: null, parts: null, problems: [`cannot read ${path}: ${message(e)}`], reference };
  }
}

const entries: Entry[] = [];
try {
  const { PEN_SHELL } = await import("../prototypes/lesson/lessons/pen-kit.ts");
  entries.push(fromRaw("PEN_SHELL (hand-made gold)", PEN_SHELL, true));
} catch (e) {
  entries.push({ label: "PEN_SHELL (hand-made gold)", kit: null, parts: null, problems: [`cannot load PEN_SHELL: ${message(e)}`], reference: true });
}
if (existsSync(GOLD) && !files.includes(GOLD)) entries.push(fromFile(GOLD));
for (const f of files) entries.push(fromFile(f));

// The page's code. Plain JS, no template literals, so it can sit in one string.
const ENTRY = String.raw`
import * as THREE from "three";
import { Component, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { KitViewer } from "/src/kit3d/KitViewer.tsx";
import { buildGeometry } from "/src/kit3d/geometry.ts";
import { measureParts } from "/shared/bounds.ts";

const DATA = window.__DATA;
const D = Math.PI / 180;
const COL = 560;
const BIG = 480;
const SMALL = 276;
const TALL_W = 184;
const HALF_W = 276;
const PX = 2;
const BG = "#efece4";

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const row = (parent) => parent.appendChild(el("div", "row"));
function cell(parent, w, hgt, tag) {
  const c = parent.appendChild(el("div", "cell"));
  c.style.width = w + "px";
  c.style.height = hgt + "px";
  c.appendChild(el("span", "tag", tag));
  return c;
}
const fail = (c, e) => c.appendChild(el("div", "fail", String(e && e.message ? e.message : e)));
const guard = (c, fn) => {
  try {
    fn();
  } catch (e) {
    fail(c, e);
  }
};

class Boundary extends Component {
  constructor(p) {
    super(p);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) return h("div", { className: "fail", "data-failed": "" }, String(this.state.error.message || this.state.error));
    return this.props.children;
  }
}

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(PX);
renderer.localClippingEnabled = true;
renderer.setClearColor(BG);

const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

function material(part, cut) {
  const finish = part.finish;
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(part.color),
    roughness: finish === "glossy" ? 0.3 : finish === "metal" ? 0.4 : finish === "rubber" ? 0.95 : 0.8,
    metalness: finish === "metal" ? 0.45 : 0,
    transparent: finish === "clear",
    opacity: finish === "clear" ? 0.4 : 1,
    side: cut ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (cut) m.clippingPlanes = [cutPlane];
  return m;
}

function buildScene(kit, bounds, cut, problems) {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.position.set(-bounds.centerX, 0, -bounds.centerZ);
  scene.add(group);
  for (const part of kit.parts) {
    try {
      const mesh = new THREE.Mesh(buildGeometry(part.shape), material(part, cut));
      mesh.position.set(part.position.x, part.position.y, part.position.z);
      mesh.rotation.set(part.rotation.x * D, part.rotation.y * D, part.rotation.z * D);
      group.add(mesh);
    } catch (e) {
      problems.add("part " + part.id + " did not build: " + (e && e.message ? e.message : e));
    }
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8a80, 1.6));
  return scene;
}

/** Draws the scene through an orthographic camera that shows y from targetY - halfH to targetY + halfH, into a 2D canvas the size of the cell. */
function shoot(scene, c, w, hgt, az, elev, targetY, halfH, halfW) {
  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 1, 4000);
  const a = az * D;
  const e = elev * D;
  cam.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(1500).add(new THREE.Vector3(0, targetY, 0));
  cam.lookAt(0, targetY, 0);
  cam.updateMatrixWorld();
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.copy(cam.localToWorld(new THREE.Vector3(-500, 700, 400)));
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.copy(cam.localToWorld(new THREE.Vector3(600, -200, 300)));
  scene.add(key, fill);
  renderer.setSize(w, hgt, false);
  renderer.render(scene, cam);
  scene.remove(key, fill);
  const out = el("canvas");
  out.width = w * PX;
  out.height = hgt * PX;
  out.style.width = w + "px";
  out.style.height = hgt + "px";
  out.getContext("2d").drawImage(renderer.domElement, 0, 0, out.width, out.height);
  c.appendChild(out);
}

function fitWhole(bounds, w, hgt, elev) {
  const H = bounds.maxY - bounds.minY;
  const R = Math.hypot(bounds.halfX, bounds.halfZ);
  const e = elev * D;
  const need = Math.max((H / 2) * Math.cos(e) + R * Math.sin(e), (R * hgt) / w) * 1.1;
  return { targetY: (bounds.minY + bounds.maxY) / 2, halfH: need, halfW: (need * w) / hgt };
}

function fitThird(bounds, w, hgt, top) {
  const H = bounds.maxY - bounds.minY;
  const R = Math.hypot(bounds.halfX, bounds.halfZ);
  const third = H / 3;
  const halfH = Math.max((third / 2) * 1.12, (R * 1.15 * hgt) / w);
  return { targetY: top ? bounds.maxY - third / 2 : bounds.minY + third / 2, halfH, halfW: (halfH * w) / hgt };
}

function niceStep(span) {
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200]) if (span / s <= 12) return s;
  return 500;
}

/** r against y for every part, in its colour: a lathe as its profile on both sides of the axis, anything else as the box it fills. */
function profile(c, kit, bounds, w, hgt) {
  const out = el("canvas");
  out.width = w * PX;
  out.height = hgt * PX;
  out.style.width = w + "px";
  out.style.height = hgt + "px";
  c.appendChild(out);
  const g = out.getContext("2d");
  g.scale(PX, PX);
  g.fillStyle = "#23262b";
  g.fillRect(0, 0, w, hgt);
  const H = bounds.maxY - bounds.minY;
  const R = Math.max(bounds.halfX, bounds.halfZ);
  const m = 28;
  const k = Math.min((w - 2 * m) / (2 * R), (hgt - 2 * m) / H);
  const X = (x) => w / 2 + x * k;
  const Y = (y) => hgt - m - (y - bounds.minY) * k;
  g.strokeStyle = "#4a4f57";
  g.fillStyle = "#8a909a";
  g.font = "9px ui-monospace, monospace";
  g.lineWidth = 1;
  const step = niceStep(H);
  for (let y = Math.ceil(bounds.minY / step) * step; y <= bounds.maxY + 1e-6; y += step) {
    g.beginPath();
    g.moveTo(X(-R) - 6, Y(y));
    g.lineTo(X(R) + 6, Y(y));
    g.stroke();
    g.fillText(String(Math.round(y * 10) / 10), 2, Y(y) - 2);
  }
  g.setLineDash([4, 3]);
  g.beginPath();
  g.moveTo(X(0), Y(bounds.minY) + 8);
  g.lineTo(X(0), Y(bounds.maxY) - 8);
  g.stroke();
  g.setLineDash([]);
  const path = (pts) => {
    g.beginPath();
    pts.forEach((p, i) => (i === 0 ? g.moveTo(X(p[0]), Y(p[1])) : g.lineTo(X(p[0]), Y(p[1]))));
  };
  const euler = (part) => new THREE.Euler(part.rotation.x * D, part.rotation.y * D, part.rotation.z * D);
  for (const part of kit.parts) {
    const shape = part.shape;
    let sides;
    let dashed = false;
    if (shape.kind === "lathe") {
      const ys = shape.profile.map((p) => p.y);
      const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
      const place = (sign) =>
        shape.profile.map((p) => {
          const v = new THREE.Vector3(sign * p.r, p.y - mid, 0).applyEuler(euler(part));
          return [v.x + part.position.x - bounds.centerX, v.y + part.position.y];
        });
      sides = [place(1), place(-1)];
    } else {
      dashed = true;
      const geo = buildGeometry(shape);
      geo.computeBoundingBox();
      const b = geo.boundingBox;
      const pts = [];
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new THREE.Vector3(x, y, z).applyEuler(euler(part)));
      const xs = pts.map((p) => p.x + part.position.x - bounds.centerX);
      const yv = pts.map((p) => p.y + part.position.y);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...yv);
      const y1 = Math.max(...yv);
      sides = [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
    }
    g.strokeStyle = part.color;
    g.fillStyle = part.color + "40";
    g.lineWidth = 1.5;
    g.setLineDash(dashed ? [3, 2] : []);
    for (const s of sides) {
      path(s);
      if (!dashed) g.fill();
      g.stroke();
    }
  }
  g.setLineDash([]);
  g.fillStyle = "#8a909a";
  g.fillText("axis r = 0, y in mm", 6, hgt - 6);
}

function fmt(n) {
  return Math.round(n * 10) / 10;
}

const board = document.getElementById("board");
const viewers = [];
for (const entry of DATA.entries) {
  const col = board.appendChild(el("section", "col"));
  col.style.width = COL + "px";
  const head = col.appendChild(el("header"));
  head.appendChild(el("strong", "", entry.label));
  head.appendChild(el("span", "", entry.parts === null ? "no part count" : entry.parts + " parts"));
  const kit = entry.kit;
  let bounds = null;
  const problems = new Set(entry.problems);
  if (kit) {
    try {
      bounds = measureParts(kit.parts);
      if (![bounds.minY, bounds.maxY, bounds.halfX, bounds.halfZ, bounds.centerX, bounds.centerZ].every(Number.isFinite) || bounds.maxY <= bounds.minY) {
        problems.add("kit has no usable size");
        bounds = null;
      } else head.appendChild(el("span", "dim", fmt(bounds.halfX * 2) + " x " + fmt(bounds.maxY - bounds.minY) + " x " + fmt(bounds.halfZ * 2) + " mm"));
    } catch (e) {
      problems.add("cannot measure the kit: " + (e && e.message ? e.message : e));
    }
  }

  const top = row(col);
  const c0 = cell(top, COL, 260, entry.reference ? "photo" : "parts");
  if (entry.reference) {
    const img = el("img");
    img.src = "/" + DATA.photo;
    img.className = "photo";
    c0.appendChild(img);
  } else if (kit) {
    const list = c0.appendChild(el("pre", "parts"));
    list.textContent = kit.name + "\n" + kit.parts.map((p) => p.id + "  " + p.shape.kind + "  " + p.color + (p.parentId ? "  <" + p.parentId : "")).join("\n");
  }
  const issues = c0.appendChild(el("div", "problems"));

  if (kit && bounds) {
    const front = row(col);
    const cf = cell(front, TALL_W, BIG, "front");
    const cb = cell(front, TALL_W, BIG, "back");
    const cd = cell(front, TALL_W, BIG, "dithered");
    const whole = fitWhole(bounds, TALL_W, BIG, 15);
    guard(cf, () => shoot(buildScene(kit, bounds, false, problems), cf, TALL_W, BIG, 30, 15, whole.targetY, whole.halfH, whole.halfW));
    guard(cb, () => shoot(buildScene(kit, bounds, false, problems), cb, TALL_W, BIG, 210, 15, whole.targetY, whole.halfH, whole.halfW));
    const mount = cd.appendChild(el("div", "mount"));
    viewers.push(mount);
    createRoot(mount).render(h(Boundary, null, h(KitViewer, { parts: kit.parts, elevation: 15, azimuth: 30, height: BIG })));

    const close = row(col);
    const ct = cell(close, HALF_W, SMALL, "top third");
    const cu = cell(close, HALF_W, SMALL, "bottom third");
    for (const [c, isTop] of [[ct, true], [cu, false]]) {
      const f = fitThird(bounds, HALF_W, SMALL, isTop);
      guard(c, () => shoot(buildScene(kit, bounds, false, problems), c, HALF_W, SMALL, 30, 10, f.targetY, f.halfH, f.halfW));
    }

    const inside = row(col);
    const cp = cell(inside, HALF_W, BIG, "profile");
    const cc = cell(inside, HALF_W, BIG, "cut-away");
    guard(cp, () => profile(cp, kit, bounds, HALF_W, BIG));
    const cutFit = fitWhole(bounds, HALF_W, BIG, 6);
    guard(cc, () => shoot(buildScene(kit, bounds, true, problems), cc, HALF_W, BIG, 0, 6, cutFit.targetY, cutFit.halfH, cutFit.halfW));
  } else {
    const msg = row(col).appendChild(el("div", "cell empty"));
    msg.textContent = "nothing to draw";
  }
  for (const p of problems) issues.appendChild(el("div", "", p));
}
window.__RENDER_STATE = { viewers: viewers.length };
document.body.dataset.done = "1";
`;

const HTML = `<!doctype html>
<meta charset="utf-8">
<title>render-gen</title>
<style>
  body { margin: 0; padding: 16px; background: #d8d4ca; font: 12px/1.35 ui-sans-serif, system-ui, sans-serif; color: #1b1c1f; }
  #board { display: flex; gap: 16px; align-items: flex-start; width: max-content; }
  .col { background: #efece4; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px #0003; }
  header { display: flex; gap: 12px; align-items: baseline; padding: 8px 10px; background: #1b1c1f; color: #f4f1ea; }
  header strong { font-size: 13px; }
  header .dim { margin-left: auto; font: 11px ui-monospace, monospace; color: #b9b4a8; }
  .row { display: flex; gap: 0; }
  .cell { position: relative; overflow: hidden; background: #efece4; outline: 1px solid #c8c3b6; outline-offset: -1px; flex-shrink: 0; }
  .cell canvas { display: block; }
  .tag { position: absolute; left: 6px; top: 4px; z-index: 2; font: 600 10px ui-monospace, monospace; color: #6b675c; background: #efece4cc; padding: 0 3px; border-radius: 3px; }
  .photo { width: 100%; height: 100%; object-fit: contain; display: block; }
  .parts { margin: 0; padding: 22px 8px 8px; font: 10px/1.35 ui-monospace, monospace; white-space: pre; overflow: hidden; height: 100%; box-sizing: border-box; color: #3b3a36; }
  .problems { position: absolute; left: 0; right: 0; bottom: 0; z-index: 3; color: #b3261e; font: 600 11px/1.3 ui-monospace, monospace; background: #fbe9e7ee; }
  .problems div { padding: 2px 8px; }
  .fail { padding: 28px 10px 10px; color: #b3261e; font: 600 11px/1.3 ui-monospace, monospace; }
  .empty { width: 100%; height: 120px; padding: 48px 0 0; text-align: center; color: #b3261e; }
  .mount { width: 100%; height: 100%; }
</style>
<div id="board"></div>
<script type="module" src="./entry.js"></script>
`;

mkdirSync(pageDir, { recursive: true });
writeFileSync(join(pageDir, "entry.js"), ENTRY);
writeFileSync(join(pageDir, "index.html"), HTML);
mkdirSync(join(outPath, ".."), { recursive: true });

const started = Date.now();
const server = await createServer({
  root,
  logLevel: "error",
  cacheDir: join(outDir, ".vite"),
  optimizeDeps: { entries: [join(pageDir, "index.html")] },
  server: { port: PORT, host: "127.0.0.1", hmr: false, watch: null },
});
let exitCode = 0;
let browser: Awaited<ReturnType<typeof launchChromium>> | undefined;
try {
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("Vite did not report a URL");
  browser = await launchChromium(true);
  const page: Page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  page.on("console", (m) => {
    if (m.type() === "error") console.error(`[page] ${m.text()}`);
  });
  page.on("pageerror", (e) => console.error(`[page] ${e.message}`));
  await page.addInitScript(`window.__DATA = ${JSON.stringify({ entries, photo: PHOTO }).replace(/</g, "\\u003c")};`);
  await page.goto(`${url}out/gen/render/page/index.html`, { waitUntil: "load" });
  await page.waitForFunction("document.body.dataset.done === '1'", undefined, { timeout: 120_000 });
  // The dithered viewers draw a frame of their own; a viewer that threw has said so in its cell instead.
  await page
    .waitForFunction(
      "(() => { const all = document.querySelectorAll('[data-kit-viewer]').length; const ok = document.querySelectorAll('[data-kit-viewer][data-ready]').length; const bad = document.querySelectorAll('[data-failed]').length; return ok + bad >= " +
        "window.__RENDER_STATE.viewers && all + bad >= window.__RENDER_STATE.viewers; })()",
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => console.error("a dithered view never finished drawing; the sheet shows it as it is"));
  await page.waitForFunction("[...document.images].every((i) => i.complete)", undefined, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(150);
  await page.screenshot({ path: outPath, fullPage: true });
  console.log(outPath);
  console.log(`${entries.length} columns, ${((Date.now() - started) / 1000).toFixed(1)} s`);
} catch (e) {
  console.error(e);
  exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
process.exit(exitCode);
