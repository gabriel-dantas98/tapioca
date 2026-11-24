'use strict';

const canvas = document.querySelector('#scene');
const ctx = canvas.getContext('2d');
const active = document.querySelector('#active');
const state = document.querySelector('#state');
const progress = document.querySelector('#progress');
const pauseButton = document.querySelector('#pause');
const playIcon = document.querySelector('#play-icon');
const combatButton = document.querySelector('#combat-only');
const moveButtons = [...document.querySelectorAll('[data-move]')];
const width = 360;
const height = 252;
const modes = {
  orbit: { label: 'Órbita', frames: 72, seconds: 6 },
  walk: { label: 'Caminhada', frames: 60, seconds: 5 },
  wave: { label: 'Aceno', frames: 56, seconds: 56 / 12 },
  jump: { label: 'Pulo', frames: 50, seconds: 50 / 12 },
  guard: { label: 'Guarda', frames: 42, seconds: 42 / 12, combat: true },
  dodge: { label: 'Esquiva', frames: 44, seconds: 44 / 12, combat: true },
  pulse: { label: 'Pulso de energia', frames: 48, seconds: 4, combat: true },
  slam: { label: 'Impacto no chão', frames: 50, seconds: 50 / 12, combat: true },
};

const spriteWidth = 180;
const spriteHeight = 228;
const atlasColumns = 8;
const atlases = {};
for (const mode of Object.keys(modes)) {
  const image = new Image();
  image.src = 'pose-' + mode + '.webp';
  atlases[mode] = image;
}
const poster = new Image();
poster.src = 'bumblebee.png';
ctx.imageSmoothingEnabled = false;

let current = 'orbit';
let elapsed = 0;
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let previousTime;
let bag = [];
let combatOnly = false;
const combatModes = Object.keys(modes).filter(mode => modes[mode].combat);

function nextMode() {
  if (!bag.length) {
    bag = combatOnly ? [...combatModes] : Object.keys(modes);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  const index = bag.findIndex(mode => mode !== current);
  if (index < 0) {
    bag = [];
    return nextMode();
  }
  return bag.splice(index, 1)[0];
}

function setMode(mode) {
  current = mode;
  elapsed = 0;
  active.textContent = modes[mode].label;
  for (const button of moveButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.move === mode));
  }
  paint(0);
}

function setCombatOnly(value) {
  combatOnly = value;
  bag = [];
  combatButton.setAttribute('aria-pressed', String(value));
}

function setPaused(value) {
  paused = value;
  const action = value ? 'Reproduzir' : 'Pausar';
  pauseButton.title = action;
  pauseButton.setAttribute('aria-label', action);
  playIcon.setAttribute('d', value ? 'm8 5 11 7-11 7V5z' : 'M9 5v14m6-14v14');
  document.body.dataset.paused = String(value);
  state.textContent = value ? 'PAUSADO' : 'EM LOOP';
}

function rect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function ellipse(x, y, rx, ry, color) {
  ctx.fillStyle = color;
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.floor(rx * Math.sqrt(1 - (dy / ry) ** 2));
    ctx.fillRect(Math.round(x) - half, Math.round(y) + dy, 2 * half + 1, 1);
  }
}

function line(x, y, x2, y2, color) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + .5, y + .5);
  ctx.lineTo(x2 + .5, y2 + .5);
  ctx.stroke();
}

const backdrop = document.createElement('canvas');
backdrop.width = width;
backdrop.height = height;
function buildBackdrop() {
  rect(0, 0, width, height, '#171f2a');
  for (let band = 0; band < 12; band++) {
    rect(0, band * 14, width, 14, ['#151d29','#17202b','#19232e','#1c2731','#1f2b34','#222f37'][Math.floor(band / 2)]);
  }
  for (const side of [0, 1]) {
    ctx.save();
    if (side) { ctx.translate(width, 0); ctx.scale(-1, 1); }
    rect(9, 0, 29, 153, '#111923');
    rect(11, 0, 3, 153, '#36414b');
    rect(37, 3, 2, 145, '#45525a');
    rect(16, 30, 4, 83, '#495358');
    rect(16, 35, 2, 29, '#a37d39');
    rect(16, 67, 2, 6, '#d6ac4b');
    rect(51, 39, 50, 73, '#19232c');
    rect(53, 40, 47, 2, '#34424b');
    rect(53, 111, 47, 1, '#3a4851');
    for (let stripe = 0; stripe < 6; stripe++) rect(59 + stripe * 5, 98, 3, 2, '#526069');
    ctx.restore();
  }
  rect(0, 151, width, 2, '#46535a');
  rect(0, 153, width, 4, '#151b21');
  for (let band = 0; band < 8; band++) {
    rect(0, 157 + band * 12, width, 12, ['#2b363c','#293339','#273137','#252e35','#232c33','#222a30','#20272e','#1e252c'][band]);
  }
  for (let col = -3; col <= 3; col++) line(180 + col * 23, 155, 180 + col * 80, 251, '#39434a');
  for (const row of [165, 179, 201, 231]) rect(0, row, width, 1, '#3e474d');
  for (let i = 0; i < 9; i++) {
    rect(15 + 7 * i, 157, 4, 2, i % 3 ? '#886533' : '#c49c45');
    rect(283 + 7 * i, 157, 4, 2, i % 3 ? '#886533' : '#c49c45');
  }
  for (let i = 0; i < 72; i++) {
    const x = (i * 71 + 27) % 349;
    const y = (i * 29 + 3) % height;
    rect(x, y, i % 9 ? 1 : 2, 1, i % 6 ? '#ffffff12' : '#f2cb572e');
  }
  backdrop.getContext('2d').drawImage(canvas, 0, 0);
}
buildBackdrop();

function combatEffect(mode, time) {
  if (mode === 'pulse' && time >= .24 && time < .64) {
    const released = time >= .43;
    const travel = released ? (time - .43) / .21 : 0;
    const charge = Math.min(1, (time - .24) / .19);
    const x = 216 + charge * 8 + travel * 127;
    const y = 133 - travel * 11;
    const radius = released ? Math.round(9 - 4 * travel) : Math.round(3 + 6 * charge);
    ellipse(x, y, radius + 7, 5, '#54eadb38');
    if (released) {
      rect(x - 23, y - 1, 25, 3, '#51dbc89d');
      rect(x - 15, y + 5, 9, 1, '#81fbe0ad');
    }
    ellipse(x, y, radius, 4, '#85f5dc');
    rect(x - 2, y - 1, 5, 3, '#f3fff4');
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 + time * 15;
      rect(x + Math.cos(angle) * (radius + 5), y + Math.sin(angle) * (radius + 3), 2, 1, '#96f8dd');
    }
  }

  if (mode === 'slam' && time >= .56 && time < .83) {
    const spread = (time - .56) / .27;
    ctx.save();
    ctx.globalAlpha = 1 - spread;
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12;
      const rx = 15 + 105 * spread;
      const ry = 3 + 19 * spread;
      rect(180 + Math.cos(angle) * rx, 198 + Math.sin(angle) * ry, 3, 2, '#ffd77c');
      if (i % 2 === 0) {
        const lift = Math.sin(Math.PI * spread) * (7 + (i % 5) * 3);
        rect(180 + Math.cos(angle) * (rx - 5), 196 + Math.sin(angle) * ry - lift, 2, 2, '#ed9a45');
      }
    }
    ctx.restore();
  }

  if (mode === 'dodge' && time >= .33 && time < .63) {
    const drift = (time - .33) / .30;
    ctx.save();
    ctx.globalAlpha = 1 - drift;
    for (let i = 0; i < 7; i++) {
      rect(163 - 27 * drift + i * 6, 194 - (i * 3 % 12) * drift, 3 - (i % 2), 2, '#e3c086');
    }
    ctx.restore();
  }
}

function paint(fraction) {
  const t = Math.min(1, Math.max(0, fraction));
  const flight = Math.max(0, Math.min(1, (t - .28) / .45));
  const slamFlight = Math.max(0, Math.min(1, (t - .23) / .34));
  const rise = current === 'jump' ? Math.sin(Math.PI * flight) :
    current === 'slam' ? Math.sin(Math.PI * slamFlight) : 0;
  const dodgeShift = current === 'dodge' ? 32 * Math.sin(Math.PI * t) ** 6 : 0;

  ctx.drawImage(backdrop, 0, 0);
  for (let i = 0; i < 11; i++) {
    const x = (i * 47 + 19) % 340 + 10;
    const y = 143 - ((i * 13 + t * 43) % 112);
    rect(x, y, i % 5 ? 1 : 2, 1, i % 3 ? '#bb9c50a0' : '#fde092aa');
  }

  ellipse(180, 215, 111, 19, '#141a21');
  ellipse(180, 209, 105, 20, '#242b30');
  ellipse(180, 203, 105, 20, '#9d7440');
  ellipse(180, 201, 105, 19, '#4a5152');
  ellipse(180, 201, 97, 16, '#323d43');
  ellipse(180, 200, 83, 12, '#3a4448');
  ellipse(180 + dodgeShift, 200, Math.round(38 - 11 * rise), Math.round(7 - 4 * rise), '#192229');

  const { frames } = modes[current];
  const atlas = atlases[current];
  const frame = Math.min(frames - 1, Math.floor(t * frames));
  const left = (width - spriteWidth) / 2;
  const top = 134 - spriteHeight / 2;
  if (atlas.complete && atlas.naturalWidth) {
    const x = (frame % atlasColumns) * spriteWidth;
    const y = Math.floor(frame / atlasColumns) * spriteHeight;
    ctx.drawImage(atlas, x, y, spriteWidth, spriteHeight, left, top, spriteWidth, spriteHeight);
  } else if (poster.complete && poster.naturalWidth) {
    ctx.drawImage(poster, left, top);
  }

  if (current === 'jump') {
    const impact = Math.max(0, 1 - Math.abs(t - .74) / .065);
    for (let i = 0; impact > 0 && i < 13; i++) {
      const spread = (i - 6) * (6 + (1 - impact) * 3);
      const y = 199 - (i * 13 % 9) * impact;
      rect(180 + spread, y, i % 3 + 1, 1, i % 3 ? '#b58443' : '#ffdb73');
    }
  }
  if (atlas.complete && atlas.naturalWidth) combatEffect(current, t);
  progress.style.transform = 'scaleX(' + t + ')';
}

pauseButton.addEventListener('click', () => setPaused(!paused));
document.querySelector('#skip').addEventListener('click', () => setMode(nextMode()));
for (const button of moveButtons) {
  button.addEventListener('click', () => {
    const mode = button.dataset.move;
    if (combatOnly && !modes[mode].combat) setCombatOnly(false);
    setMode(mode);
    setPaused(false);
  });
}
combatButton.addEventListener('click', () => {
  setCombatOnly(!combatOnly);
  if (combatOnly && !modes[current].combat) setMode(nextMode());
});
for (const atlas of Object.values(atlases)) {
  atlas.addEventListener('load', () => paint(elapsed / modes[current].seconds));
}
poster.addEventListener('load', () => paint(elapsed / modes[current].seconds));
setPaused(paused);
const firstMode = combatModes[Math.floor(Math.random() * combatModes.length)];
setMode(paused ? current : firstMode);

function animate(time) {
  const delta = previousTime === undefined ? 0 : Math.min(.1, (time - previousTime) / 1000);
  previousTime = time;
  if (!paused && atlases[current].complete) {
    elapsed += delta;
    if (elapsed >= modes[current].seconds) setMode(nextMode());
    else paint(elapsed / modes[current].seconds);
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

const promptText = document.querySelector('#prompt-text');
const copyStatus = document.querySelector('#copy-status');
document.querySelector('#copy-prompt').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(promptText.value);
    copyStatus.textContent = 'Prompt copiado.';
  } catch {
    promptText.focus();
    promptText.select();
    copyStatus.textContent = 'Texto selecionado. Use o comando Copiar do seu dispositivo.';
  }
});
