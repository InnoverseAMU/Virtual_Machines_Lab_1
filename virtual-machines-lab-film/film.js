import { clamp, lerp, seg, ss, eo, eio, ei, back } from '/core/lib.js';
import { DUR, SUBTITLES, EVENTS } from './timeline.js';

const W = 1920;
const H = 1080;
const ACCENT = '#00F2FE';
const ACCENT_GLOW = 'rgba(0, 242, 254, 0.35)';
const RED = '#FF4D54';
const RED_BG = 'rgba(38, 10, 14, 0.92)';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const ASSETS = {
  unwired:    './captures/07-self-mode.png',
  orbit1:     './captures/03b-bench-orbit1.png',
  wired:      './captures/03-observe-mode.png',
  orbit2:     './captures/03c-bench-orbit2.png',
  live230:    './captures/16b-meters-live-230v.png',
  loaded:     './captures/17b-bench-loaded-lamps.png',
  diagram:    './captures/fig-3-1-1.png',
  learnStep:  './captures/05b-learn-wiring-step.png',
  selfFault:  './captures/07b-self-fault.png',
  obsChart:   './captures/09b-observations-chart.png',
  diagPanel:  './captures/08-circuit-diagram.png',
  pickerDark: './captures/01-experiment-picker.png',
  pickerLight:'./captures/11-light-theme.png',
  benchLight: './captures/11b-bench-light.png',
  phone:      './captures/10-phone-layout.png',
};

const imgs = {};
let activeTexts = [];

function loadImage(key, src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { imgs[key] = img; resolve(); };
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

async function init() {
  await Promise.all([
    document.fonts.ready,
    ...Object.entries(ASSETS).map(([k, v]) => loadImage(k, v)),
  ]);
  window.DUR = DUR;
  window.EV = EVENTS;
  window.render = render;
  window.TEXTS = (t) => {
    render(t);
    return activeTexts;
  };
  window.READY = true;
}

// --- Stage & Grid (Dark Tech Keynote) ---
function drawStage(gridAlpha = 1.0) {
  ctx.fillStyle = '#0A0B0F';
  ctx.fillRect(0, 0, W, H);

  // Upper-centre radial lift
  const g1 = ctx.createRadialGradient(W * 0.5, H * 0.16, 40, W * 0.5, H * 0.18, 980);
  g1.addColorStop(0, '#161B28');
  g1.addColorStop(1, 'rgba(10, 11, 15, 0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);

  // Cool off-centre glow
  const g2 = ctx.createRadialGradient(W * 0.78, H * 0.22, 20, W * 0.78, H * 0.22, 720);
  g2.addColorStop(0, 'rgba(0, 242, 254, 0.065)');
  g2.addColorStop(1, 'rgba(0, 242, 254, 0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);

  // Hairline 48px grid
  if (gridAlpha > 0.01) {
    ctx.save();
    ctx.lineWidth = 1;
    for (let x = 0, i = 0; x <= W; x += 48, i++) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${(i % 4 === 0 ? 0.055 : 0.028) * gridAlpha})`;
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
    }
    for (let y = 0, i = 0; y <= H; y += 48, i++) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${(i % 4 === 0 ? 0.055 : 0.028) * gridAlpha})`;
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawVignette(strength = 0.52) {
  const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.35, W * 0.5, H * 0.5, W * 0.72);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, `rgba(4, 5, 8, ${strength})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

// Draw an image with pan/zoom around a normalised anchor (ax, ay)
function drawCamImage(img, scale = 1.0, ax = 0.5, ay = 0.5, dx = 0, dy = 0, alpha = 1.0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const dw = W * scale;
  const dh = H * scale;
  const x = W * 0.5 - dw * ax + dx;
  const y = H * 0.5 - dh * ay + dy;
  ctx.drawImage(img, x, y, dw, dh);
  ctx.restore();
}

// Rounded rectangle path helper
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Soft light sweep band across frame (glint <= 18%)
function drawLightSweep(progress, angle = -0.25) {
  if (progress <= 0 || progress >= 1) return;
  ctx.save();
  const cx = lerp(-400, W + 400, progress);
  ctx.translate(cx, H * 0.5);
  ctx.rotate(angle);
  const grad = ctx.createLinearGradient(-260, 0, 260, 0);
  grad.addColorStop(0, 'rgba(0, 242, 254, 0)');
  grad.addColorStop(0.5, 'rgba(210, 248, 255, 0.16)');
  grad.addColorStop(1, 'rgba(0, 242, 254, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(-260, -H, 520, H * 2);
  ctx.restore();
}

// Draw a raised dark UI card frame around a capture
function drawFramedCapture(img, x, y, w, h, radius = 16, borderCol = 'rgba(255,255,255,0.12)', shadow = true) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
  }
  roundRect(x, y, w, h, radius);
  ctx.fillStyle = '#12151C';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  roundRect(x, y, w, h, radius);
  ctx.clip();
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();

  ctx.save();
  roundRect(x, y, w, h, radius);
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

// Draw a floating keynote label badge
function drawBadge(id, text, x, y, color = ACCENT, bg = 'rgba(12, 14, 19, 0.86)', border = 'rgba(255,255,255,0.14)', fontSize = 24, align = 'left', recordText = true) {
  ctx.save();
  ctx.font = `600 ${fontSize}px "Inter", sans-serif`;
  const m = ctx.measureText(text);
  const padX = 20;
  const padY = 12;
  const bw = m.width + padX * 2 + 22;
  const bh = fontSize + padY * 2;
  const bx = align === 'center' ? x - bw / 2 : (align === 'right' ? x - bw : x);
  const by = y;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 20;
  roundRect(bx, by, bw, bh, 12);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.shadowBlur = 0;

  roundRect(bx, by, bw, bh, 12);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(bx + 18, by + bh / 2, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#E8EAF0';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + 34, by + bh / 2 + 1);
  ctx.restore();

  if (recordText) {
    activeTexts.push({ id, text, x0: bx, y0: by, x1: bx + bw, y1: by + bh });
  }
}

// --- ACT I: 0.0 - 8.0 s — The 3D Bench Hero ---
function renderAct1(t) {
  drawStage(0.4);

  // Subtle continuous camera push + slight orbit across real bench captures
  if (t < 1.6) {
    // Unwired bench (07-self-mode) transitioning cleanly to wired orbit1 via crisp horizontal reveal
    const k = eo(seg(t, 0.0, 1.6));
    const scale = lerp(1.06, 1.12, k);
    drawCamImage(imgs.unwired, scale, 0.43, 0.48);
    // Wipe in wired bench from left to right between 0.7s and 1.5s
    const wipe = eio(seg(t, 0.7, 1.5));
    if (wipe > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W * wipe, H);
      ctx.clip();
      drawCamImage(imgs.orbit1, scale, 0.43, 0.48);
      ctx.restore();
      // Glowing cyan scan edge
      if (wipe < 0.99) {
        ctx.fillStyle = ACCENT;
        ctx.fillRect(W * wipe - 2, 0, 3, H);
      }
    }
  } else if (t < 3.6) {
    // Orbiting over the wired 3D bench
    const k = ss(seg(t, 1.6, 3.6));
    const scale = lerp(1.12, 1.16, k);
    if (k < 0.5) {
      drawCamImage(imgs.orbit1, scale, lerp(0.43, 0.42, k * 2), 0.48);
    } else {
      drawCamImage(imgs.wired, scale, lerp(0.42, 0.44, (k - 0.5) * 2), 0.48);
    }
  } else if (t < 5.5) {
    // Zoom toward transformer & meters
    const k = eo(seg(t, 3.6, 5.5));
    const scale = lerp(1.14, 1.24, k);
    drawCamImage(imgs.orbit2, scale, 0.42, 0.47);
  } else {
    // 5.5 - 8.0s: Switch ON! Live 230V -> 4 lamps glowing & meter needles deflected!
    const k = eo(seg(t, 5.5, 8.0));
    const scale = lerp(1.18, 1.08, k);
    const img = t < 6.1 ? imgs.live230 : imgs.loaded;
    drawCamImage(img, scale, 0.44, 0.46);
    drawLightSweep(seg(t, 6.2, 7.6));
  }

  // Small caption: "Virtual Machines Lab" (top-left pill, lifted cleanly)
  const capIn = eo(seg(t, 0.15, 0.45));
  const capOut = 1 - ei(seg(t, 7.6, 7.95));
  if (capIn * capOut > 0.01) {
    ctx.save();
    ctx.globalAlpha = capIn * capOut;
    drawBadge('hero_title', 'Virtual Machines Lab', 56, 48 + (1 - capIn) * 14, ACCENT, 'rgba(10, 12, 18, 0.88)', 'rgba(0, 242, 254, 0.45)', 24, 'left', true);
    ctx.restore();
  }
}

// --- ACT II: 8.0 - 16.0 s — The Problem ---
function renderAct2(t) {
  drawStage(1.0);
  const enter = eo(seg(t, 8.0, 8.45));

  // Left panel: Fig. 3.1.1 circuit diagram on crisp white card inside dark frame
  const lx = lerp(-860, 64, enter);
  const ly = 110;
  const lw = 860;
  const lh = 760;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 36;
  roundRect(lx, ly, lw, lh, 18);
  ctx.fillStyle = '#12151C';
  ctx.fill();
  ctx.shadowBlur = 0;
  roundRect(lx, ly, lw, lh, 18);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Header bar
  ctx.fillStyle = '#8A90A0';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.fillText('LAB MANUAL · FIG. 3.1.1', lx + 28, ly + 40);

  // White diagram card inside
  const pad = 26;
  const cx = lx + pad;
  const cy = ly + 66;
  const cw = lw - pad * 2;
  const ch = lh - 94;
  roundRect(cx, cy, cw, ch, 12);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  const dImg = imgs.diagram;
  const ratio = Math.min((cw - 40) / dImg.width, (ch - 40) / dImg.height);
  const dw = dImg.width * ratio;
  const dh = dImg.height * ratio;
  ctx.drawImage(dImg, cx + (cw - dw) / 2, cy + (ch - dh) / 2, dw, dh);
  ctx.restore();

  // Right panel: plain unwired bench (Self mode)
  const rx = lerp(W + 40, 964, enter);
  const ry = 110;
  const rw = 892;
  const rh = 502;
  drawFramedCapture(imgs.unwired, rx, ry, rw, rh, 18, 'rgba(255, 255, 255, 0.12)');

  // Three short red callout cards popping in sequentially below right panel
  const cards = [
    { id: 'prob_1', t0: 9.0,  text: '230 V',                                      sub: 'Live mains hazard' },
    { id: 'prob_2', t0: 10.5, text: 'Learn from a diagram only',                  sub: 'Little hands-on wiring time' },
    { id: 'prob_3', t0: 12.0, text: 'One wrong connection can damage equipment',  sub: 'Short circuits & meter burnouts' },
  ];

  cards.forEach((c, i) => {
    const p = seg(t, c.t0, c.t0 + 0.32);
    if (p <= 0) return;
    const s = back(p, 1.35);
    const cyCard = 636 + i * 78;
    const cwCard = 892;
    const chCard = 66;

    ctx.save();
    ctx.translate(rx + cwCard / 2, cyCard + chCard / 2);
    ctx.scale(lerp(0.92, 1.0, s), lerp(0.92, 1.0, s));
    ctx.translate(-(rx + cwCard / 2), -(cyCard + chCard / 2));
    ctx.globalAlpha = clamp(p * 2.5);

    roundRect(rx, cyCard, cwCard, chCard, 12);
    ctx.fillStyle = RED_BG;
    ctx.fill();
    roundRect(rx, cyCard, cwCard, chCard, 12);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Warning dot
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(rx + 26, cyCard + chCard / 2, 6, 0, Math.PI * 2);
    ctx.fill();

    // Main label
    ctx.fillStyle = '#FFE5E7';
    ctx.font = '600 24px "Inter", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.text, rx + 46, cyCard + chCard / 2 + 1);
    ctx.restore();

    activeTexts.push({ id: c.id, text: c.text, x0: rx, y0: cyCard, x1: rx + cwCard, y1: cyCard + chCard });
  });
}

// --- ACT III: 16.0 - 27.0 s — Features ---
function renderAct3(t) {
  drawStage(0.6);

  if (t < 18.0) {
    // 16.0 - 18.0 s: Learn mode popup explaining a step
    const k = eo(seg(t, 16.0, 18.0));
    const scale = lerp(1.04, 1.18, k);
    drawCamImage(imgs.learnStep, scale, 0.25, 0.72);
    drawBadge('feat_learn', 'Learn Mode', 56, 48, ACCENT, 'rgba(10,12,18,0.88)', 'rgba(0,242,254,0.45)', 22, 'left', false);
  } else if (t < 20.2) {
    // 18.0 - 20.2 s: Self mode wiring mistake + MCB TRIPPED / M <-> L swapped callout
    const k = eo(seg(t, 18.0, 20.2));
    const scale = lerp(1.0, 1.12, k);
    drawCamImage(imgs.selfFault, scale, 0.5, 0.5);

    // Crisp red fault alert card (MCB TRIPPED / Wattmeter M & L swapped)
    const pop = back(seg(t, 18.0, 18.3), 1.4);
    if (pop > 0) {
      const fx = 620, fy = 78, fw = 680, fh = 84;
      ctx.save();
      ctx.translate(fx + fw / 2, fy + fh / 2);
      ctx.scale(lerp(0.88, 1.0, pop), lerp(0.88, 1.0, pop));
      ctx.translate(-(fx + fw / 2), -(fy + fh / 2));
      roundRect(fx, fy, fw, fh, 14);
      ctx.fillStyle = RED_BG;
      ctx.fill();
      roundRect(fx, fy, fw, fh, 14);
      ctx.strokeStyle = RED;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = RED;
      ctx.font = '700 22px "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText('MCB TRIPPED', fx + 26, fy + 28);

      ctx.fillStyle = '#FFE5E7';
      ctx.font = '500 20px "Inter", sans-serif';
      ctx.fillText('Wattmeter M ↔ L swapped or short circuit caught safely', fx + 26, fy + 58);
      ctx.restore();
      activeTexts.push({ id: 'feat_mcb', text: 'MCB TRIPPED', x0: fx, y0: fy, x1: fx + fw, y1: fy + fh });
    }
    drawBadge('feat_self', 'Self Mode', 56, 48, RED, RED_BG, RED, 22, 'left', false);
  } else if (t < 22.6) {
    // 20.2 - 22.6 s: Observation table + Efficiency vs Load VA chart
    const k = eo(seg(t, 20.2, 22.6));
    const scale = lerp(1.05, 1.48, k);
    drawCamImage(imgs.obsChart, scale, lerp(0.75, 0.90, k), lerp(0.45, 0.42, k));
    drawBadge('feat_obs', 'Observations', 56, 48, ACCENT, 'rgba(10,12,18,0.88)', 'rgba(0,242,254,0.45)', 22);
  } else if (t < 24.1) {
    // 22.6 - 24.1 s: Circuit diagram panel
    const k = eo(seg(t, 22.6, 24.1));
    const scale = lerp(1.06, 1.24, k);
    drawCamImage(imgs.diagPanel, scale, 0.16, 0.30);
    drawBadge('feat_diag', 'Circuit Diagram', 56, 48, ACCENT, 'rgba(10,12,18,0.88)', 'rgba(0,242,254,0.45)', 22, 'left', false);
  } else if (t < 25.5) {
    // 24.1 - 25.5 s: Observe mode (pre-wired bench)
    const k = eo(seg(t, 24.1, 25.5));
    const scale = lerp(1.02, 1.12, k);
    drawCamImage(imgs.loaded, scale, 0.44, 0.48);
    drawLightSweep(seg(t, 24.1, 25.3));
    drawBadge('feat_observe', 'Observe Mode', 56, 48, ACCENT, 'rgba(10,12,18,0.88)', 'rgba(0,242,254,0.45)', 22, 'left', false);
  } else {
    // 25.5 - 26.8 s: Light / Dark theme toggle + Phone layout
    const wipe = eio(seg(t, 25.55, 26.25));
    drawCamImage(imgs.pickerDark, 1.0, 0.5, 0.5);
    if (wipe > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W * wipe * 0.68, H);
      ctx.clip();
      drawCamImage(imgs.pickerLight, 1.0, 0.5, 0.5);
      ctx.restore();
      ctx.fillStyle = ACCENT;
      ctx.fillRect(W * wipe * 0.68 - 2, 0, 3, H);
    }

    // Phone layout frame sliding in on right
    const phoneIn = back(seg(t, 25.6, 26.15), 1.25);
    const pw = 360;
    const ph = 778;
    const px = lerp(W + 60, 1450, phoneIn);
    const py = 140;
    drawFramedCapture(imgs.phone, px, py, pw, ph, 28, 'rgba(0, 242, 254, 0.55)');

    drawBadge('feat_theme', 'Themes & Mobile', 56, 48, ACCENT, 'rgba(10,12,18,0.88)', 'rgba(0,242,254,0.45)', 22, 'left', false);
  }
}

// --- ACT IV: 26.75 - 30.0 s — End Card ---
function renderAct4(t) {
  drawStage(1.0);
  const k = eo(seg(t, 26.75, 27.2));
  const subIn = eo(seg(t, 26.75, 27.25));
  const credIn = eo(seg(t, 27.15, 27.65));

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Main Title
  ctx.globalAlpha = k;
  ctx.shadowColor = ACCENT_GLOW;
  ctx.shadowBlur = 36;
  ctx.fillStyle = ACCENT;
  ctx.font = '700 88px "Inter Tight", sans-serif';
  const titleY = H * 0.37 + (1 - k) * 18;
  ctx.fillText('Virtual Machines Lab', W * 0.5, titleY);
  ctx.shadowBlur = 0;

  // Tagline
  ctx.globalAlpha = subIn;
  ctx.fillStyle = '#E8EAF0';
  ctx.font = '500 38px "Inter", sans-serif';
  ctx.fillText('Practise before you power on.', W * 0.5, H * 0.48 + (1 - subIn) * 14);

  // Credits line
  ctx.globalAlpha = credIn;
  ctx.fillStyle = '#9AA3B5';
  ctx.font = '500 24px "JetBrains Mono", monospace';
  ctx.fillText('ZHCET, AMU  ·  EEC2910 (Electrical Machines Lab 1)  ·  Asad Mokarim', W * 0.5, H * 0.60 + (1 - credIn) * 10);

  // URL line
  ctx.fillStyle = '#5C6475';
  ctx.font = '500 20px "JetBrains Mono", monospace';
  ctx.fillText('[add URL]', W * 0.5, H * 0.66 + (1 - credIn) * 10);
  ctx.restore();

  if (k > 0.2) {
    activeTexts.push({ id: 'end_title', text: 'Virtual Machines Lab', x0: 460, y0: 340, x1: 1460, y1: 450 });
    activeTexts.push({ id: 'end_tag', text: 'Practise before you power on.', x0: 560, y0: 480, x1: 1360, y1: 540 });
    activeTexts.push({ id: 'end_cred', text: 'ZHCET, AMU · EEC2910 (Electrical Machines Lab 1) · Asad Mokarim', x0: 360, y0: 615, x1: 1560, y1: 660, pass: true });
  }

  drawLightSweep(seg(t, 27.1, 28.4));
}

// --- Burned-in Subtitles (Dark Tech Keynote Toast) ---
function drawSubtitles(t) {
  const cue = SUBTITLES.find((s) => t >= s.t0 && t <= s.t1);
  if (!cue) return;

  const enter = eo(seg(t, cue.t0, cue.t0 + 0.16));
  const exit = 1 - ei(seg(t, cue.t1 - 0.12, cue.t1));
  const alpha = clamp(Math.min(enter, exit));
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '500 34px "Inter", sans-serif';
  const m = ctx.measureText(cue.text);
  const padX = 28;
  const pw = Math.min(W - 160, m.width + padX * 2 + 24);
  const ph = 64;
  const px = (W - pw) / 2;
  const py = H - 108 + (1 - enter) * 10; // safe area above bottom 1080 edge

  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  roundRect(px, py, pw, ph, 16);
  ctx.fillStyle = 'rgba(12, 14, 19, 0.86)';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  roundRect(px, py, pw, ph, 16);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Speaking cyan dot
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(px + 24, py + ph / 2, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#E8EAF0';
  ctx.textBaseline = 'middle';
  ctx.fillText(cue.text, px + 42, py + ph / 2 + 1);
  ctx.restore();
}

function render(t) {
  activeTexts = [];
  if (t < 8.0) {
    renderAct1(t);
  } else if (t < 16.0) {
    renderAct2(t);
  } else if (t < 26.75) {
    renderAct3(t);
  } else {
    renderAct4(t);
  }
  drawVignette(0.45);
  drawSubtitles(t);
}

init();
