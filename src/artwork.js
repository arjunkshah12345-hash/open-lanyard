import * as THREE from 'three';

const FONT = '"DM Sans", sans-serif';
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const tint = (hex, light) => `rgb(${rgb(hex).map((c) => Math.round(c * light)).join(',')})`;

function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return [element, element.getContext('2d')];
}

function text(ctx, value, x, y, size, color = '#edf0e9', weight = 500) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function fitText(ctx, value, x, y, size, maxWidth, color, weight = 500) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (ctx.measureText(value).width > maxWidth && size > 20) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${FONT}`;
  }
  text(ctx, value, x, y, size, color, weight);
}

function symbol(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x-size*0.43,y-size*0.5);
  ctx.scale(size/140,size/140);
  ctx.fillStyle=color;
  // Vector reconstruction of SuperCompress's stacked chevron mark.
  const polygons=[
    [[26,6],[46,6],[60,20],[74,6],[94,6],[60,40]],
    [[0,0],[0,20],[60,81],[120,20],[120,0],[60,61]],
    [[0,40],[0,78],[60,139],[120,78],[120,40],[60,101]],
    [[0,96],[0,140],[42,140]],[[120,96],[120,140],[78,140]],
  ];
  for (const points of polygons) {
    ctx.beginPath();
    points.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));
    ctx.closePath();ctx.fill();
  }
  ctx.globalAlpha=.45;ctx.fillStyle='#e4efff';
  ctx.beginPath();
  [[0,40],[0,59],[60,120],[120,59],[120,40],[60,101]].forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));
  ctx.closePath();ctx.fill();
  ctx.restore();
}

// Original mathematical artwork: a twisted ribbed ring, projected onto the print.
function drawSculpture(ctx, accent) {
  const lines = [];
  const project = (u, v) => {
    const radius = 270 + 28 * Math.cos(u * 3);
    const tube = 101 + 14 * Math.sin(u * 2);
    let x = (radius + tube * Math.cos(v)) * Math.cos(u);
    let y = (radius + tube * Math.cos(v)) * Math.sin(u);
    let z = tube * Math.sin(v + u * 0.4);
    const ry = y * 0.74 - z * 0.67;
    z = y * 0.67 + z * 0.74;
    y = ry;
    return { x: x * 0.93 - y * 0.37 + 516, y: x * 0.37 + y * 0.93 + 518, z };
  };
  for (let i = 0; i < 144; i++) {
    const u = (i / 144) * Math.PI * 2;
    const points = Array.from({ length: 65 }, (_, j) => project(u, (j / 64) * Math.PI * 2));
    lines.push({ points, depth: points.reduce((n, p) => n + p.z, 0) / points.length, u });
  }
  lines.sort((a, b) => a.depth - b.depth);
  for (const { points, depth, u } of lines) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    const light = 0.29 + (depth + 250) / 750 + 0.2 * Math.sin(u * 2);
    ctx.strokeStyle = tint(accent, Math.min(1.08, light));
    ctx.lineWidth = depth > 0 ? 2.3 : 1.4;
    ctx.stroke();
  }
}

function front(config) {
  const [element, ctx] = canvas(1000, 1420);
  ctx.fillStyle = '#101725';
  ctx.fillRect(0, 0, 1000, 1420);
  const glow = ctx.createRadialGradient(600, 400, 10, 500, 500, 660);
  glow.addColorStop(0, tint(config.accent, 0.21));
  glow.addColorStop(1, '#101725');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1000, 950);
  drawSculpture(ctx, config.accent);
  const fade = ctx.createLinearGradient(0, 730, 0, 1020);
  fade.addColorStop(0, '#10172500');
  fade.addColorStop(1, '#101725');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 730, 1000, 300);

  symbol(ctx, 91, 124, 64, config.accent);
  ctx.font='400 46px "Platypi", serif';ctx.fillStyle='#f0f3fa';
  ctx.fillText(config.brand,147,139,680);
  text(ctx, '01', 876, 139, 22, '#98a6bf');
  ctx.save();
  ctx.translate(925, 750);
  ctx.rotate(-Math.PI / 2);
  text(ctx, 'CONTEXT, COMPRESSED.', 0, 0, 17, '#a7b8d4');
  ctx.restore();

  const name = config.name.trim() || 'Your name';
  const words = name.split(/\s+/);
  const split = words.length > 1;
  const first = split ? words.slice(0, -1).join(' ') : name;
  const last = split ? words.at(-1) : '';
  text(ctx, 'ALL ACCESS', 78, 911, 19, config.accent, 650);
  fitText(ctx, first, 71, 1028, 103, 850, '#f0f2e9', 500);
  if (last) fitText(ctx, last, 71, 1137, 103, 850, '#f0f2e9', 500);
  fitText(ctx, config.role, 78, 1203, 28, 840, '#a6b2c8', 400);
  ctx.strokeStyle = '#8692b442';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(78, 1267); ctx.lineTo(922, 1267); ctx.stroke();
  text(ctx, (config.website||'SUPERCOMPRESS.DEV').toUpperCase(), 78, 1325, 20, '#a5b5d0', 500);
  text(ctx, `N° ${config.serial}`, 775, 1325, 22, config.accent, 500);
  return element;
}

function back(config) {
  const [element, ctx] = canvas(1000, 1420);
  ctx.fillStyle = '#101725'; ctx.fillRect(0, 0, 1000, 1420);
  symbol(ctx, 151, 172, 128, config.accent);
  text(ctx, `${config.brand} / BUILDER PASS`, 80, 302, 24, '#99abc8');
  const lines = config.backMessage.split('\n');
  lines.forEach((line, i) => fitText(ctx, line, 72, 678 + i * 85, 71, 850, '#edf0e6'));
  ctx.fillStyle = config.accent; ctx.fillRect(80, 944, 80, 7);
  text(ctx, config.website||'supercompress.dev', 80, 1020, 29, '#a5b7d3', 400);
  text(ctx, 'Built for what comes next.', 80, 1065, 26, '#a5b7d3', 400);
  // Deliberately decorative serial bars, not a nonfunctional QR code.
  for (let i = 0; i < 61; i++) {
    const width = i % 4 === 0 ? 5 : 2;
    ctx.fillStyle = '#a4b5d3'; ctx.fillRect(80 + i * 6, 1180, width, 68);
  }
  text(ctx, config.serial.padStart(8, '0'), 80, 1290, 21, '#a4b5d3');
  text(ctx, 'YOURS TO MAKE.', 703, 1290, 18, config.accent);
  return element;
}

function strap(config) {
  const [element, ctx] = canvas(256, 2048);
  ctx.fillStyle = '#141b2a'; ctx.fillRect(0, 0, 256, 2048);
  for (let y = 0; y < 2048; y += 5) {
    ctx.strokeStyle = y % 10 === 0 ? '#48557080' : '#05091290';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y + 2); ctx.stroke();
  }
  for (let x = 0; x < 256; x += 4) {
    ctx.strokeStyle = '#9ca7bc18';
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 2, 2048); ctx.stroke();
  }
  ctx.strokeStyle = '#97bfff65'; ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  [15, 241].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 2048); ctx.stroke(); });
  ctx.setLineDash([]);
  for (let y = 185; y < 2048; y += 640) {
    ctx.save(); ctx.translate(128, y); ctx.rotate(Math.PI / 2);
    fitText(ctx, config.strap.toUpperCase(), 0, 16, 50, 435, '#dae7ff', 600);
    symbol(ctx, -70, 0, 50, config.accent);
    ctx.restore();
  }
  return element;
}

export function makeTextures(config, renderer) {
  const textures = [front(config), back(config), strap(config)].map((image) => {
    const texture = new THREE.CanvasTexture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  });
  return { front: textures[0], back: textures[1], strap: textures[2], dispose: () => textures.forEach((t) => t.dispose()) };
}
