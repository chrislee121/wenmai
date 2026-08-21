import { copyFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { KnowledgeGraph } from './graph.js'

const require = createRequire(import.meta.url)

export const GRAPH_ASSETS_DIR = 'graph-assets'

const GRAPH_ASSETS: Array<[pkg: string, dest: string]> = [
  ['cytoscape/dist/cytoscape.min.js', 'cytoscape.min.js'],
  ['layout-base/layout-base.js', 'layout-base.js'],
  ['cose-base/cose-base.js', 'cose-base.js'],
  ['cytoscape-fcose/cytoscape-fcose.js', 'cytoscape-fcose.js'],
]

export async function copyGraphAssets(root: string): Promise<void> {
  const dir = path.join(root, GRAPH_ASSETS_DIR)
  await mkdir(dir, { recursive: true })
  for (const [pkg, dest] of GRAPH_ASSETS) {
    await copyFile(require.resolve(pkg), path.join(dir, dest))
  }
}

function escapeScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export function renderGraphHtml(graph: KnowledgeGraph): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>通鉴关联图</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; overflow: hidden; background: #1e1e1e; color: #dcdcdc; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    canvas#g { display: block; width: 100%; height: 100%; cursor: grab; }
    canvas.panning { cursor: grabbing; }
    #cy { position: absolute; inset: 0; display: none; }
    body.view-cluster canvas#g { display: none; }
    body.view-cluster #cy { display: block; }
    body.view-force canvas#g { display: block; }
    body.view-force #cy { display: none; }
    .bar, .dock, .panel, .zoom { z-index: 5; }
    .bar { position: fixed; top: 12px; left: 12px; right: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; pointer-events: none; }
    .bar > * { pointer-events: auto; }
    button, select, #q { background: #2b2b2b; color: #eee; border: 1px solid #3d3d3d; border-radius: 8px; padding: 6px 10px; }
    #q { min-width: 180px; }
    select { min-width: auto; cursor: pointer; }
    button { cursor: pointer; }
    button:hover, select:hover { background: #353535; }
    .dock { position: fixed; left: 12px; bottom: 12px; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; max-width: min(520px, calc(100vw - 320px)); pointer-events: none; }
    .dock > * { pointer-events: auto; }
    .filters, .legend, .panel, .zoom { background: #252525cc; border: 1px solid #3d3d3d; border-radius: 10px; backdrop-filter: blur(8px); }
    .filters { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 7px; }
    .filters label { display: inline-flex; align-items: center; gap: 3px; margin: 0; padding: 2px 6px; font-size: 12px; line-height: 1.2; background: #2b2b2b; color: #eee; border: 1px solid #3d3d3d; border-radius: 6px; user-select: none; cursor: pointer; white-space: nowrap; }
    .filters input[type=checkbox] { margin: 0; width: 12px; height: 12px; accent-color: #4ecdc4; }
    .legend { padding: 8px 10px; }
    .legend span { display: inline-flex; align-items: center; gap: 6px; margin: 0 8px 0 0; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .panel { position: fixed; right: 12px; bottom: 12px; max-width: 280px; padding: 10px 12px; overflow-wrap: anywhere; word-break: break-word; }
    .panel h2 { margin: 0 0 6px; font-size: 14px; }
    .muted { color: #9a9a9a; }
    .zoom { position: fixed; left: 12px; top: 60px; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 8px 6px; }
    .zoom button { width: 32px; height: 32px; padding: 0; font-size: 20px; line-height: 1; border-radius: 8px; }
    .zoom-track {
      width: 6px;
      height: 120px;
      background: #3d3d3d;
      border-radius: 99px;
      position: relative;
      cursor: pointer;
    }
    .zoom-thumb {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 14px;
      height: 14px;
      margin: -7px 0 0 -7px;
      background: #4ecdc4;
      border-radius: 50%;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="cy"></div>
  <canvas id="g"></canvas>
  <div class="bar">
    <select id="viewMode" title="展示方案" aria-label="展示方案">
      <option value="force">力导向</option>
      <option value="cluster">目录簇</option>
    </select>
    <input id="q" placeholder="搜索标题或 slug" />
    <button id="fit" type="button">适应画布</button>
  </div>
  <div class="zoom" title="缩放">
    <button id="zoomIn" type="button" title="放大">+</button>
    <div id="zoomTrack" class="zoom-track" role="slider" aria-label="缩放" aria-valuemin="0" aria-valuemax="100">
      <div id="zoomThumb" class="zoom-thumb"></div>
    </div>
    <button id="zoomOut" type="button" title="缩小">−</button>
  </div>
  <div class="dock">
    <div class="filters" title="节点筛选">
      <label><input type="checkbox" id="tags" checked /> 标签</label>
      <label><input type="checkbox" id="articles" checked /> 文章</label>
      <label><input type="checkbox" id="folders" checked /> 目录</label>
      <label><input type="checkbox" id="sources" checked /> 原文</label>
      <label><input type="checkbox" id="missing" checked /> 未解析</label>
    </div>
    <div class="legend">
      <span><i class="dot" style="background:#7f6df2"></i>概念</span>
      <span><i class="dot" style="background:#5db3d4"></i>实体</span>
      <span><i class="dot" style="background:#e0a458"></i>对比</span>
      <span><i class="dot" style="background:#86c591"></i>查询</span>
      <span><i class="dot" style="background:#4ecdc4"></i>工作区文章</span>
      <span><i class="dot" style="background:#d4a017"></i>目录</span>
      <span><i class="dot" style="background:#c47b9a"></i>标签</span>
      <span><i class="dot" style="background:#8a8a8a"></i>通鉴原文</span>
      <span><i class="dot" style="background:#c45c5c"></i>未解析</span>
    </div>
  </div>
  <aside class="panel" id="info">
    <h2>通鉴关联图</h2>
    <div class="muted" id="stats"></div>
    <div id="detail">滚轮缩放，拖空白处平移。放大后会显示文件名。左上角可切换展示方案。</div>
  </aside>
  <script>
    const DATA = ${escapeScript(graph)};

    const colors = { concept:'#7f6df2', entity:'#5db3d4', comparison:'#e0a458', query:'#86c591', summary:'#d0d0d0', tag:'#c47b9a', source:'#8a8a8a', missing:'#c45c5c', page:'#7f6df2', article:'#4ecdc4', folder:'#d4a017' };
    const K_MIN = 0.04, K_MAX = 8, ZOOM_SPAN = 6;
    const track = document.getElementById('zoomTrack');
    const thumb = document.getElementById('zoomThumb');
    const show = { tag: true, source: true, missing: true, article: true, folder: true };
    let query = '';
    let sliderHeld = false;
    let view = 'force';
    try {
      var saved = localStorage.getItem('tongjian-graph-view');
      if (saved === 'cluster' || saved === 'force') view = saved;
    } catch (e) {}
    if (location.hash.indexOf('cluster') >= 0) view = 'cluster';
    if (location.hash.indexOf('force') >= 0) view = 'force';

    function visible(n) {
      if (n.kind === 'tag' && !show.tag) return false;
      if (n.kind === 'source' && !show.source) return false;
      if (n.kind === 'missing' && !show.missing) return false;
      if (n.kind === 'article' && !show.article) return false;
      if (n.kind === 'folder' && !show.folder) return false;
      return true;
    }
    function nodeColor(n) {
      if (n.kind === 'page') return colors[n.type] || colors.page;
      return colors[n.kind] || '#888';
    }

    const ForceView = (function () {
      const canvas = document.getElementById('g');
      const ctx = canvas.getContext('2d');
      let nodes = [], edges = [], drag = null, pan = null, hover = null, selected = null;
      let simulating = true, ticks = 0, userCam = false, liveUntil = 220;
      const cam = { x: 0, y: 0, k: 1 };
      let homeK = 1;
      let looping = false, active = false, bound = false;

      function resize() {
        canvas.width = innerWidth * devicePixelRatio;
        canvas.height = innerHeight * devicePixelRatio;
        canvas.style.width = innerWidth + 'px';
        canvas.style.height = innerHeight + 'px';
        ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      }
      function mass(n) {
        if (n.kind === 'folder') return 4.5 + Math.min(14, n.degree * 0.4)
        if (n.kind === 'page') return 2.2
        if (n.kind === 'tag') return 1.3
        return 0.42
      }
      function radiusOf(n) {
        if (n.kind === 'folder') return 1.7 + Math.min(2.3, Math.sqrt(Math.max(1, n.degree)) * 0.28)
        if (n.kind === 'page') return 2.2 + Math.min(3, n.degree * 0.22)
        if (n.kind === 'tag') return 1.8
        return 0.9
      }
      function toScreen(n) {
        return {
          x: (n.x - cam.x) * cam.k + innerWidth / 2,
          y: (n.y - cam.y) * cam.k + innerHeight / 2,
          r: radiusOf(n) * cam.k
        };
      }
      function toWorld(mx, my) {
        return {
          x: cam.x + (mx - innerWidth / 2) / cam.k,
          y: cam.y + (my - innerHeight / 2) / cam.k
        };
      }
      function hash01(id) {
        var h = 2166136261, s = String(id);
        for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
        return ((h >>> 0) % 10000) / 10000;
      }
      function leafRingRadius(leafCount) {
        const n = Math.max(1, leafCount);
        return Math.max(9, n * 3.4 / (Math.PI * 2));
      }
      function placeClusters() {
        const childToParent = new Map();
        const childrenOf = new Map();
        for (const e of edges) {
          if (e.kind !== 'folder') continue;
          const child = nodes[e.a], parent = nodes[e.b];
          childToParent.set(child, parent);
          if (!childrenOf.has(parent)) childrenOf.set(parent, []);
          childrenOf.get(parent).push(child);
        }
        const roots = nodes.filter((n) => n.kind === 'folder' && !childToParent.has(n));
        const placed = new Set();
        roots.forEach((n, i) => {
          const golden = i * 2.399963;
          const R = 160 + Math.sqrt(i + 1) * (78 + n.degree * 5);
          n.x = Math.cos(golden) * R;
          n.y = Math.sin(golden) * R;
          placed.add(n);
        });
        const queue = roots.slice();
        while (queue.length) {
          const parent = queue.shift();
          const kids = childrenOf.get(parent) || [];
          const leaves = kids.filter((n) => n.kind !== 'folder');
          const subfolders = kids.filter((n) => n.kind === 'folder');
          const ring = leafRingRadius(leaves.length);
          leaves.forEach((n, i) => {
            const jitter = 0.82 + hash01(n.id) * 0.36;
            const a = (i / Math.max(1, leaves.length)) * Math.PI * 2 + (hash01(n.id + ':a') - 0.5) * 0.35;
            const dist = ring * jitter;
            n.x = parent.x + Math.cos(a) * dist;
            n.y = parent.y + Math.sin(a) * dist;
            placed.add(n);
          });
          subfolders.forEach((n, i) => {
            const a = ((i + 0.5) / Math.max(1, subfolders.length)) * Math.PI * 2;
            const dist = Math.max(130, ring + 110);
            n.x = parent.x + Math.cos(a) * dist;
            n.y = parent.y + Math.sin(a) * dist;
            placed.add(n);
            queue.push(n);
          });
        }
        for (const n of nodes) {
          if (placed.has(n)) continue;
          const a = Math.random() * Math.PI * 2;
          const R = 120 + Math.random() * 280;
          n.x = Math.cos(a) * R;
          n.y = Math.sin(a) * R;
        }
      }
      function rebuild() {
        const src = DATA.nodes.map((n) => ({
          ...n,
          x: 0, y: 0, vx: 0, vy: 0, pinned: false
        }));
        const keep = new Set(src.filter(visible).map(n => n.id));
        nodes = src.filter(n => keep.has(n.id));
        const index = Object.fromEntries(nodes.map((n, i) => [n.id, i]));
        edges = DATA.edges.filter(e => keep.has(e.source) && keep.has(e.target)).map(e => ({
          ...e, a: index[e.source], b: index[e.target]
        }));
        placeClusters();
        const leafCount = new Map();
        for (const e of edges) {
          if (e.kind !== 'folder') continue;
          const a = nodes[e.a], b = nodes[e.b];
          const parent = a.kind === 'folder' && b.kind !== 'folder' ? a : (b.kind === 'folder' && a.kind !== 'folder' ? b : null);
          if (parent) leafCount.set(parent, (leafCount.get(parent) || 0) + 1);
        }
        for (const e of edges) {
          const a = nodes[e.a], b = nodes[e.b];
          if (e.kind === 'folder' && a.kind === 'folder' && b.kind === 'folder') {
            e.rest = 150;
            e.stiff = 0.016;
          } else if (e.kind === 'folder') {
            const parent = a.kind === 'folder' ? a : b;
            const child = a.kind === 'folder' ? b : a;
            const base = leafRingRadius(leafCount.get(parent) || 1);
            e.rest = base * (0.82 + hash01(child.id) * 0.36);
            e.stiff = 0.048;
          } else if (e.kind === 'tag') {
            e.rest = 28;
            e.stiff = 0.035;
          } else {
            e.rest = 36;
            e.stiff = 0.004;
          }
        }
        document.getElementById('stats').textContent = nodes.length + ' 个节点 · ' + edges.length + ' 条边';
        simulating = true;
        ticks = 0;
        liveUntil = 300;
        userCam = false;
        fit(true);
      }
      function hit(mx, my) {
        const ranked = nodes.slice().sort((a, b) => radiusOf(b) - radiusOf(a));
        for (const n of ranked) {
          const s = toScreen(n);
          const dx = s.x - mx, dy = s.y - my;
          if (dx * dx + dy * dy <= Math.max(6, s.r) * Math.max(6, s.r)) return n;
        }
      }
      function matches(n) {
        if (!query) return true;
        const q = query.toLowerCase();
        return n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q);
      }
      function wake(extra) {
        simulating = true;
        liveUntil = Math.max(liveUntil, ticks + (extra ?? 180));
      }
      function zoomRange() {
        let lo = homeK / ZOOM_SPAN;
        let hi = homeK * ZOOM_SPAN;
        if (lo < K_MIN) {
          lo = K_MIN;
          hi = (homeK * homeK) / lo;
        }
        if (hi > K_MAX) {
          hi = K_MAX;
          lo = (homeK * homeK) / hi;
        }
        if (lo >= hi) {
          lo = K_MIN;
          hi = K_MAX;
        }
        return { lo, hi };
      }
      function sliderFromK(k) {
        const { lo, hi } = zoomRange();
        return 100 * Math.log(Math.max(lo, Math.min(hi, k)) / lo) / Math.log(hi / lo);
      }
      function kFromSlider(t) {
        const { lo, hi } = zoomRange();
        return lo * Math.pow(hi / lo, Number(t) / 100);
      }
      function syncSlider() {
        const t = Math.max(0, Math.min(100, sliderFromK(cam.k)));
        thumb.style.top = (100 - t) + '%';
        track.setAttribute('aria-valuenow', String(Math.round(t)));
      }
      function bounds() {
        const pts = nodes.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
        if (!pts.length) return null;
        const xs = pts.map((n) => n.x).sort((a, b) => a - b);
        const ys = pts.map((n) => n.y).sort((a, b) => a - b);
        const lo = Math.floor(pts.length * 0.03);
        const hi = Math.max(lo, Math.ceil(pts.length * 0.97) - 1);
        return { minX: xs[lo], minY: ys[lo], maxX: xs[hi], maxY: ys[hi] };
      }
      function fit(keepSimulating) {
        if (!nodes.length || innerWidth < 40 || innerHeight < 40) return;
        if (!keepSimulating) simulating = false;
        const box = bounds();
        if (!box) return;
        const padX = 56;
        const padY = 72;
        const minSpan = Math.max(160, Math.sqrt(nodes.length) * 24);
        const bw = Math.max(minSpan, box.maxX - box.minX);
        const bh = Math.max(minSpan, box.maxY - box.minY);
        cam.k = Math.max(K_MIN, Math.min((innerWidth - padX * 2) / bw, (innerHeight - padY * 2) / bh, K_MAX));
        cam.x = (box.minX + box.maxX) / 2;
        cam.y = (box.minY + box.maxY) / 2;
        homeK = cam.k;
        syncSlider();
      }
      function zoomAt(mx, my, factor) {
        zoomTo(cam.k * factor, mx, my);
      }
      function zoomTo(nextK, mx, my) {
        userCam = true;
        const before = toWorld(mx, my);
        cam.k = Math.max(K_MIN, Math.min(K_MAX, nextK));
        const after = toWorld(mx, my);
        cam.x += before.x - after.x;
        cam.y += before.y - after.y;
        syncSlider();
      }
      function tick() {
        if (!active || (!simulating && !drag)) return;
        const nCount = Math.max(1, nodes.length);
        const repulse = Math.min(10, 55 / Math.sqrt(nCount));
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let d2 = dx * dx + dy * dy || 0.01;
            const mi = mass(a), mj = mass(b);
            let f = (repulse * repulse) * (mi * mj) / d2;
            if (a.kind === 'folder' && b.kind === 'folder') f *= 4.6;
            if (a.kind === 'article' && b.kind === 'article') f *= 0.7;
            let d = Math.sqrt(d2);
            dx /= d; dy /= d;
            a.vx -= dx * f / mi; a.vy -= dy * f / mi;
            b.vx += dx * f / mj; b.vy += dy * f / mj;
          }
        }
        for (const e of edges) {
          const a = nodes[e.a], b = nodes[e.b];
          const rest = e.rest ?? 48;
          const stiff = e.stiff ?? 0.02;
          let dx = b.x - a.x, dy = b.y - a.y;
          let d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          let f = (d - rest) * stiff;
          dx /= d; dy /= d;
          const mi = mass(a), mj = mass(b);
          a.vx += dx * f / mi; a.vy += dy * f / mi;
          b.vx -= dx * f / mj; b.vy -= dy * f / mj;
        }
        for (const n of nodes) {
          if (n === drag || n.pinned) continue;
          if (!drag && n.kind === 'folder') {
            n.vx += -n.x * 0.00035;
            n.vy += -n.y * 0.00035;
          }
          n.vx *= 0.86; n.vy *= 0.86;
          const vmax = n.kind === 'folder' ? 10 : 22;
          const sp = Math.hypot(n.vx, n.vy);
          if (sp > vmax) { n.vx *= vmax / sp; n.vy *= vmax / sp; }
          n.x += n.vx; n.y += n.vy;
        }
        for (const e of edges) {
          if (e.kind !== 'folder') continue;
          const a = nodes[e.a], b = nodes[e.b];
          let parent, child;
          if (a.kind === 'folder' && b.kind !== 'folder') { parent = a; child = b; }
          else if (b.kind === 'folder' && a.kind !== 'folder') { parent = b; child = a; }
          else continue;
          if (child === drag || child.pinned) continue;
          let dx = child.x - parent.x, dy = child.y - parent.y;
          let d = Math.hypot(dx, dy) || 0.01;
          const rest = e.rest || 16;
          const nd = d + (rest - d) * 0.1;
          child.x = parent.x + dx / d * nd;
          child.y = parent.y + dy / d * nd;
        }
        ticks += 1;
        if (!userCam && !drag && ticks >= 8) fit(true);
        if (!drag && ticks > liveUntil) {
          simulating = false;
          if (!userCam) fit(true);
        }
      }
      function inView(s) {
        return s.x > -40 && s.y > -40 && s.x < innerWidth + 40 && s.y < innerHeight + 40;
      }
      function draw() {
        if (!active) return;
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        ctx.lineWidth = Math.max(0.6, 1);
        for (const e of edges) {
          const a = toScreen(nodes[e.a]), b = toScreen(nodes[e.b]);
          if (!inView(a) && !inView(b)) continue;
          const hot = (hover && (nodes[e.a] === hover || nodes[e.b] === hover)) || (selected && (nodes[e.a] === selected || nodes[e.b] === selected));
          ctx.strokeStyle = hot ? '#cfcfcf' : '#4a4a4a';
          ctx.globalAlpha = hot ? 0.9 : 0.4;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const hubZoom = Math.min(homeK * 1.2, K_MAX * 0.55);
        const fileZoom = Math.min(homeK * 1.5, K_MAX * 0.72);
        const showHubLabels = cam.k >= hubZoom;
        const showFileLabels = cam.k >= fileZoom;
        const ordered = nodes.slice().sort((a, b) => radiusOf(a) - radiusOf(b));
        for (const n of ordered) {
          const s = toScreen(n);
          if (!inView(s)) continue;
          const dim = query && !matches(n);
          ctx.beginPath();
          ctx.fillStyle = colors[n.type] || colors[n.kind] || '#888';
          ctx.globalAlpha = dim ? 0.18 : 1;
          ctx.arc(s.x, s.y, Math.max(0.8, s.r), 0, Math.PI * 2);
          ctx.fill();
          const autoName = !dim && (n.kind === 'article' ? showFileLabels : showHubLabels);
          const named = n === hover || n === selected || (query && matches(n)) || autoName;
          if (named) {
            ctx.font = (autoName && n !== hover && n !== selected ? '11px' : '12px') + ' sans-serif';
            ctx.fillStyle = '#f2f2f2';
            ctx.fillText(n.label, s.x + Math.max(0.8, s.r) + 4, s.y + 4);
          }
        }
        ctx.globalAlpha = 1;
      }
      function loop() { tick(); draw(); requestAnimationFrame(loop); }
      function showDetail(n) {
        const el = document.getElementById('detail');
        if (!n) { el.textContent = '力导向：滚轮缩放，拖空白处平移。放大后会显示文件名。'; return; }
        const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
        el.innerHTML = '<strong>' + esc(n.label) + '</strong><br><span class="muted">' + esc(n.kind) + (n.type ? ' · ' + esc(n.type) : '') + (n.path ? '<br>' + esc(n.path) : '') + '<br>连接 ' + n.degree + '</span>';
      }
      function bind() {
        if (bound) return;
        bound = true;
        canvas.addEventListener('mousemove', (ev) => {
          if (!active) return;
          if (pan) {
            userCam = true;
            cam.x -= (ev.clientX - pan.x) / cam.k;
            cam.y -= (ev.clientY - pan.y) / cam.k;
            pan = { x: ev.clientX, y: ev.clientY };
            return;
          }
          if (drag) {
            const w = toWorld(ev.clientX, ev.clientY);
            drag.x = w.x; drag.y = w.y; drag.vx = 0; drag.vy = 0;
            return;
          }
          hover = hit(ev.clientX, ev.clientY);
          canvas.style.cursor = hover ? 'pointer' : 'grab';
        });
        canvas.addEventListener('mousedown', (ev) => {
          if (!active || ev.button !== 0) return;
          const target = hit(ev.clientX, ev.clientY);
          if (target) {
            drag = target;
            selected = target;
            for (const n of nodes) n.pinned = n === drag;
            wake(240);
            showDetail(drag);
            canvas.style.cursor = 'pointer';
            return;
          }
          pan = { x: ev.clientX, y: ev.clientY };
          canvas.classList.add('panning');
        });
        window.addEventListener('mouseup', () => {
          if (!active) return;
          if (drag) {
            drag.pinned = true;
            wake(200);
          }
          drag = null;
          pan = null;
          canvas.classList.remove('panning');
        });
        canvas.addEventListener('wheel', (ev) => {
          if (!active) return;
          ev.preventDefault();
          zoomAt(ev.clientX, ev.clientY, ev.deltaY < 0 ? 1.12 : 1 / 1.12);
        }, { passive: false });
        addEventListener('resize', () => { if (active) { resize(); if (!userCam) fit(true); } });
      }
      return {
        start: function () {
          active = true;
          bind();
          resize();
          rebuild();
          showDetail(null);
          if (!looping) { looping = true; loop(); }
        },
        stop: function () {
          active = false;
          simulating = false;
          drag = null;
          pan = null;
        },
        rebuild: function () { if (active) rebuild(); },
        fit: function () { userCam = true; fit(false); },
        zoomIn: function () { zoomAt(innerWidth / 2, innerHeight / 2, 1.25); },
        zoomOut: function () { zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.25); },
        zoomFromPointer: function (ev) {
          if (ticks < 10) return;
          const rect = track.getBoundingClientRect();
          const t = (1 - (ev.clientY - rect.top) / Math.max(1, rect.height)) * 100;
          zoomTo(kFromSlider(t), innerWidth / 2, innerHeight / 2);
        },
        setQuery: function () {}
      };
    })();

    const ClusterView = (function () {
      let cy = null, homeK = 1, selected = null, loaded = false, loading = null, boundChrome = false;

      function loadScript(src) {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = function () { resolve(src); };
          s.onerror = function () { reject(src); };
          document.head.appendChild(s);
        });
      }
      async function tryLoad(list) {
        for (var i = 0; i < list.length; i++) {
          try { await loadScript(list[i]); } catch (e) {}
        }
      }
      function wouldCycle(child, parent, parents) {
        var cur = parent, seen = {};
        while (cur) {
          if (cur === child || seen[cur]) return true;
          seen[cur] = true;
          cur = parents[cur];
        }
        return false;
      }
      function toElements() {
        var vis = {};
        DATA.nodes.forEach(function (n) { if (visible(n)) vis[n.id] = n; });
        var parents = {};
        DATA.edges.forEach(function (e) {
          if (e.kind !== 'folder') return;
          if (!vis[e.source] || !vis[e.target]) return;
          if (wouldCycle(e.source, e.target, parents)) return;
          parents[e.source] = e.target;
        });
        var elements = [];
        DATA.nodes.forEach(function (n) {
          if (!vis[n.id]) return;
          var data = { id: n.id, label: n.label, kind: n.kind, type: n.type || '', path: n.path || '', degree: n.degree, color: nodeColor(n) };
          if (parents[n.id] && n.kind !== 'folder') data.parent = parents[n.id];
          elements.push({ group: 'nodes', data: data });
        });
        DATA.edges.forEach(function (e, i) {
          if (e.kind === 'folder') return;
          if (!vis[e.source] || !vis[e.target]) return;
          elements.push({ group: 'edges', data: { id: 'e' + i, source: e.source, target: e.target, kind: e.kind } });
        });
        return elements;
      }
      function stylesheet() {
        return [
          { selector: 'node', style: {
            'background-color': 'data(color)',
            'label': 'data(label)',
            'color': '#ececec',
            'font-size': 11,
            'font-weight': 500,
            'text-outline-width': 3,
            'text-outline-color': '#1a1a1a',
            'text-wrap': 'ellipsis',
            'text-max-width': 120,
            'min-zoomed-font-size': 8,
            'overlay-padding': 4,
            'overlay-opacity': 0
          }},
          { selector: 'node[kind="article"]', style: {
            'width': 9, 'height': 9, 'shape': 'ellipse',
            'font-size': 10, 'min-zoomed-font-size': 6, 'text-max-width': 90
          }},
          { selector: 'node[kind="page"]', style: {
            'width': 16, 'height': 16, 'shape': 'ellipse', 'font-size': 12, 'min-zoomed-font-size': 7
          }},
          { selector: 'node[kind="tag"]', style: { 'width': 12, 'height': 12, 'shape': 'round-diamond' }},
          { selector: 'node[kind="source"]', style: { 'width': 10, 'height': 10, 'shape': 'round-rectangle' }},
          { selector: 'node[kind="missing"]', style: { 'width': 8, 'height': 8, 'opacity': 0.7 }},
          { selector: 'node[kind="folder"]', style: {
            'shape': 'round-rectangle',
            'background-opacity': 0.08,
            'background-color': '#d4a017',
            'border-width': 1.5,
            'border-color': '#d4a017',
            'border-opacity': 0.85,
            'padding': 36,
            'text-valign': 'top',
            'text-halign': 'center',
            'text-margin-y': -6,
            'font-size': 13,
            'font-weight': 650,
            'color': '#f0d78c',
            'min-zoomed-font-size': 5,
            'text-max-width': 180
          }},
          { selector: 'node[kind="folder"]:childless', style: {
            'shape': 'ellipse', 'width': 14, 'height': 14, 'padding': 2,
            'background-opacity': 1, 'text-valign': 'center', 'text-margin-y': 0
          }},
          { selector: 'edge', style: {
            'curve-style': 'bezier',
            'width': 1.1,
            'line-color': '#5a5a5a',
            'opacity': 0.28,
            'target-arrow-shape': 'none',
            'source-arrow-shape': 'none'
          }},
          { selector: 'edge[kind="wikilink"], edge[kind="mdlink"]', style: { 'line-color': '#6a8f8c', 'opacity': 0.32 }},
          { selector: 'edge[kind="tag"]', style: { 'line-color': '#c47b9a', 'opacity': 0.18 }},
          { selector: 'edge[kind="source"]', style: { 'line-color': '#888', 'opacity': 0.16 }},
          { selector: '.dim', style: { 'opacity': 0.12 }},
          { selector: '.hit', style: { 'overlay-color': '#4ecdc4', 'overlay-opacity': 0.18, 'z-index': 999 }},
          { selector: ':selected', style: { 'overlay-color': '#fff', 'overlay-opacity': 0.16, 'border-width': 2, 'border-color': '#fff' }},
          { selector: 'node.hovered', style: { 'overlay-color': '#4ecdc4', 'overlay-opacity': 0.12 }},
          { selector: 'node.full-label, node.hovered, node:selected, node.hit', style: {
            'text-wrap': 'wrap',
            'text-max-width': 420,
            'text-overflow-wrap': 'anywhere',
            'z-index': 1000
          }}
        ];
      }
      function layoutOptions(name) {
        if (name === 'fcose') {
          return {
            name: 'fcose', quality: 'proof', randomize: true, animate: true,
            animationDuration: 800, animationEasing: 'ease-out', fit: false, padding: 48,
            nodeDimensionsIncludeLabels: true, packComponents: false, tile: true,
            tilingPaddingVertical: 36, tilingPaddingHorizontal: 36,
            gravity: 0.25, gravityRange: 3.8, gravityCompound: 1.0, gravityRangeCompound: 1.5,
            nestingFactor: 0.1, numIter: 2500,
            nodeRepulsion: function () { return 7000; },
            idealEdgeLength: function () { return 52; },
            edgeElasticity: function () { return 0.35; }
          };
        }
        return {
          name: 'cose', animate: true, animationDuration: 700, randomize: true, fit: false, padding: 48,
          nodeOverlap: 16, idealEdgeLength: 64, nodeRepulsion: 450000, gravity: 80, numIter: 1200,
          componentSpacing: 64, coolingFactor: 0.99, minTemp: 1.0
        };
      }
      function zoomRange() {
        var logHome = Math.log(homeK);
        var half = ZOOM_SPAN / 2;
        return { min: Math.max(K_MIN, Math.exp(logHome - half)), max: Math.min(K_MAX, Math.exp(logHome + half)) };
      }
      function kToSlider(k) {
        var r = zoomRange();
        var t = (Math.log(k) - Math.log(r.min)) / (Math.log(r.max) - Math.log(r.min));
        return Math.max(0, Math.min(1, t));
      }
      function sliderToK(t) {
        var r = zoomRange();
        return Math.exp(Math.log(r.min) + t * (Math.log(r.max) - Math.log(r.min)));
      }
      function setThumb(t) {
        thumb.style.top = ((1 - t) * 100) + '%';
      }
      function syncSliderFromCy() {
        if (!cy) return;
        if (!sliderHeld) setThumb(kToSlider(cy.zoom()));
        updateLabelZoom();
      }
      function updateLabelZoom() {
        if (!cy) return;
        var on = cy.zoom() >= Math.min(homeK * 1.5, K_MAX * 0.4);
        cy.batch(function () {
          if (on) cy.nodes().addClass('full-label');
          else cy.nodes().removeClass('full-label');
        });
      }
      function applyZoom(k) {
        if (!cy) return;
        cy.zoom({ level: Math.max(K_MIN, Math.min(K_MAX, k)), renderedPosition: { x: innerWidth / 2, y: innerHeight / 2 } });
        updateLabelZoom();
      }
      function fitView() {
        if (!cy) return;
        cy.fit(cy.elements(), 72);
        homeK = cy.zoom();
        setThumb(0.5);
        updateLabelZoom();
        if (!selected) showDetail(null);
      }
      function showDetail(n) {
        var el = document.getElementById('detail');
        if (!n) {
          el.textContent = '目录簇：文章铺在所属目录框里。拖目录会带着里面的文章走。';
          return;
        }
        var d = n.data();
        var esc = function (s) { return String(s).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; }); };
        el.innerHTML = '<strong>' + esc(d.label) + '</strong><div class="muted">' + esc(d.kind) + (d.path ? '<br>' + esc(d.path) : '') + '<br>连接 ' + d.degree + '</div>';
      }
      function applyQuery() {
        if (!cy) return;
        var q = query.trim().toLowerCase();
        cy.batch(function () {
          cy.elements().removeClass('dim hit');
          if (!q) return;
          cy.nodes().forEach(function (n) {
            var s = (n.data('label') + ' ' + n.id()).toLowerCase();
            if (s.indexOf(q) >= 0) n.addClass('hit');
            else n.addClass('dim');
          });
          cy.edges().addClass('dim');
        });
      }
      function updateStats() {
        var vis = DATA.nodes.filter(visible);
        var ecount = DATA.edges.filter(function (e) {
          if (e.kind === 'folder') return false;
          return vis.some(function (n) { return n.id === e.source; }) && vis.some(function (n) { return n.id === e.target; });
        }).length;
        document.getElementById('stats').textContent = vis.length + ' 个节点 · ' + ecount + ' 条关联';
      }
      function runLayout() {
        var names = ['fcose', 'cose'];
        var i = 0;
        function next() {
          if (!cy || i >= names.length) { fitView(); return; }
          var name = names[i++];
          try {
            var layout = cy.layout(layoutOptions(name));
            layout.one('layoutstop', function () { fitView(); });
            layout.run();
          } catch (err) {
            next();
          }
        }
        next();
      }
      function build() {
        var elements = toElements();
        if (cy) { cy.destroy(); cy = null; }
        cy = cytoscape({
          container: document.getElementById('cy'),
          elements: elements,
          style: stylesheet(),
          minZoom: K_MIN,
          maxZoom: K_MAX,
          wheelSensitivity: 0.25,
          boxSelectionEnabled: false,
          autoungrabify: false,
          pixelRatio: 'auto',
          layout: { name: 'preset' }
        });
        cy.on('zoom', syncSliderFromCy);
        cy.on('tap', 'node', function (e) {
          selected = e.target;
          cy.nodes().unselect();
          selected.select();
          showDetail(selected);
        });
        cy.on('tap', function (e) {
          if (e.target === cy) {
            selected = null;
            cy.nodes().unselect();
            showDetail(null);
          }
        });
        updateLabelZoom();
        cy.on('mouseover', 'node', function (e) { e.target.addClass('hovered'); });
        cy.on('mouseout', 'node', function (e) { e.target.removeClass('hovered'); });
        updateStats();
        applyQuery();
        runLayout();
      }
      async function ensureLib() {
        if (window.cytoscape) { loaded = true; return true; }
        if (loading) return loading;
        loading = (async function () {
          await tryLoad(['./graph-assets/cytoscape.min.js', './graph-assets/layout-base.js', './graph-assets/cose-base.js', './graph-assets/cytoscape-fcose.js']);
          if (!window.cytoscape) {
            await tryLoad([
              'https://cdn.jsdelivr.net/npm/cytoscape@3.34.1/dist/cytoscape.min.js',
              'https://cdn.jsdelivr.net/npm/layout-base@2.0.1/layout-base.js',
              'https://cdn.jsdelivr.net/npm/cose-base@2.2.0/cose-base.js',
              'https://cdn.jsdelivr.net/npm/cytoscape-fcose@2.2.0/cytoscape-fcose.js'
            ]);
          }
          loaded = !!window.cytoscape;
          return loaded;
        })();
        return loading;
      }
      return {
        start: async function () {
          var ok = await ensureLib();
          if (!ok) {
            document.getElementById('detail').textContent = '目录簇引擎加载失败。可切回「力导向」，或检查 graph-assets 后刷新。';
            return;
          }
          build();
        },
        stop: function () {
          if (cy) { cy.destroy(); cy = null; }
          selected = null;
        },
        rebuild: function () { if (cy) build(); },
        fit: function () { fitView(); },
        zoomIn: function () { if (cy) applyZoom(cy.zoom() * 1.25); },
        zoomOut: function () { if (cy) applyZoom(cy.zoom() / 1.25); },
        zoomFromPointer: function (ev) {
          var rect = track.getBoundingClientRect();
          var y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rect.top;
          var t = Math.max(0, Math.min(1, 1 - y / rect.height));
          setThumb(t);
          applyZoom(sliderToK(t));
        },
        setQuery: function () { applyQuery(); }
      };
    })();

    function currentView() {
      return view === 'cluster' ? ClusterView : ForceView;
    }
    function applyView(next) {
      view = next === 'cluster' ? 'cluster' : 'force';
      try { localStorage.setItem('tongjian-graph-view', view); } catch (e) {}
      document.body.classList.toggle('view-cluster', view === 'cluster');
      document.body.classList.toggle('view-force', view === 'force');
      document.getElementById('viewMode').value = view;
      if (view === 'cluster') {
        ForceView.stop();
        ClusterView.start();
      } else {
        ClusterView.stop();
        ForceView.start();
      }
    }

    document.getElementById('viewMode').addEventListener('change', function (ev) {
      applyView(ev.target.value);
    });
    document.getElementById('q').addEventListener('input', function (ev) {
      query = ev.target.value.trim();
      currentView().setQuery();
    });
    document.getElementById('fit').addEventListener('click', function (ev) {
      ev.preventDefault();
      currentView().fit();
    });
    document.getElementById('zoomIn').addEventListener('click', function () { currentView().zoomIn(); });
    document.getElementById('zoomOut').addEventListener('click', function () { currentView().zoomOut(); });
    track.addEventListener('pointerdown', function (ev) {
      sliderHeld = true;
      track.setPointerCapture(ev.pointerId);
      currentView().zoomFromPointer(ev);
    });
    track.addEventListener('pointermove', function (ev) {
      if (sliderHeld) currentView().zoomFromPointer(ev);
    });
    track.addEventListener('pointerup', function () { sliderHeld = false; });
    track.addEventListener('pointercancel', function () { sliderHeld = false; });
    ['tags','sources','missing','articles','folders'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function (ev) {
        var map = { tags:'tag', sources:'source', missing:'missing', articles:'article', folders:'folder' };
        show[map[id]] = ev.target.checked;
        currentView().rebuild();
      });
    });
    applyView(view);
  </script>
</body>
</html>
`
}
