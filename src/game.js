import { GAME_CONFIG as CONFIG } from "./config.js";

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const startOverlay = document.querySelector("#startOverlay");
const messageOverlay = document.querySelector("#messageOverlay");
const startButton = document.querySelector("#startButton");
const restartButton = document.querySelector("#restartButton");
const messageEyebrow = document.querySelector("#messageEyebrow");
const messageTitle = document.querySelector("#messageTitle");
const messageBody = document.querySelector("#messageBody");
const audioNotice = document.querySelector("#audioNotice");

const touchButtons = {
  jump: document.querySelector("#jumpButton"),
  crouch: document.querySelector("#crouchButton"),
  boost: document.querySelector("#boostButton")
};
const touchControls = document.querySelector("#touchControls");

const STATE = {
  READY: "ready",
  RUNNING: "running",
  GAME_OVER: "game-over"
};

const world = {
  groundY: 612,
  gravity: 2200,
  baseSpeed: 350,
  boostSpeed: 560,
  cameraX: 0,
  spawnX: 820,
  bestScore: Number(localStorage.getItem("fengpao_best_score") || 0)
};

const player = {
  x: 180,
  footY: world.groundY,
  previousFootY: world.groundY,
  velocityY: 0,
  width: 54,
  standHeight: 110,
  crouchHeight: 58,
  state: "idle",
  animationTimer: 0,
  currentFrame: 0,
  lastAnimationState: "idle",
  grounded: true,
  jumpsUsed: 0,
  maxJumps: 2,
  doubleJumpTimer: 0,
  invincibleTimer: 0,
  trailTimer: 0
};

let state = STATE.READY;
let lastTime = 0;
let elapsed = 0;
let score = 0;
let coins = 0;
let lives = 3;
let distance = 0;
let currentSpeed = world.baseSpeed;
const playerSprites = {
  run: [],
  jump: null,
  crouch: null,
  idle: null,
  missing: []
};
let spritesReady = false;
let musicTried = false;

const input = {
  crouch: false,
  boost: false
};

const level = {
  obstacles: [],
  collectibles: [],
  platforms: [],
  particles: []
};

const bgm = new Audio(CONFIG.LOCAL_MUSIC_PATH);
bgm.loop = true;
bgm.volume = CONFIG.MUSIC_VOLUME;
bgm.preload = "auto";

ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = "high";

function fitCanvasToDisplay() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(CONFIG.WIDTH * dpr);
  canvas.height = Math.round(CONFIG.HEIGHT * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}

function loadImage(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = path;
  });
}

function measureSpriteFrame(image) {
  const scratch = document.createElement("canvas");
  const scratchCtx = scratch.getContext("2d");
  scratch.width = image.naturalWidth;
  scratch.height = image.naturalHeight;
  scratchCtx.drawImage(image, 0, 0);

  const { data, width, height } = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 12) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const bbox = maxX >= minX
    ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
    : { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };

  return { image, bbox };
}

async function loadSpriteFrame(path) {
  const image = await loadImage(path);
  return { ...measureSpriteFrame(image), path };
}

async function loadPlayerSprites() {
  playerSprites.run = [];
  playerSprites.jump = null;
  playerSprites.crouch = null;
  playerSprites.idle = null;
  playerSprites.missing = [];

  for (const path of CONFIG.PLAYER_SPRITES.run) {
    try {
      playerSprites.run.push(await loadSpriteFrame(path));
    } catch {
      playerSprites.missing.push(path);
    }
  }

  for (const [key, path] of [["jump", CONFIG.PLAYER_SPRITES.jump], ["crouch", CONFIG.PLAYER_SPRITES.crouch], ["idle", CONFIG.PLAYER_SPRITES.idle]]) {
    try {
      playerSprites[key] = await loadSpriteFrame(path);
    } catch {
      playerSprites.missing.push(path);
    }
  }

  spritesReady = Boolean(playerSprites.run.length === CONFIG.PLAYER_SPRITES.run.length
    && playerSprites.jump
    && playerSprites.crouch
    && playerSprites.idle);
}

function setNotice(text) {
  audioNotice.textContent = text;
}

async function tryPlayMusic() {
  if (musicTried && !bgm.paused) {
    return;
  }

  musicTried = true;

  try {
    bgm.volume = CONFIG.MUSIC_VOLUME;
    await bgm.play();
    setNotice("背景音乐播放中，音量 0.4");
  } catch {
    setNotice("没有播放到音乐：请把 mp3 放到 assets/music/bgm.mp3");
  }
}

function roundedRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function resetGame() {
  level.obstacles = [];
  level.collectibles = [];
  level.platforms = [];
  level.particles = [];

  player.x = 180;
  player.footY = world.groundY;
  player.previousFootY = world.groundY;
  player.velocityY = 0;
  player.state = "idle";
  player.animationTimer = 0;
  player.currentFrame = 0;
  player.lastAnimationState = "idle";
  player.grounded = true;
  player.jumpsUsed = 0;
  player.doubleJumpTimer = 0;
  player.invincibleTimer = 0;
  player.trailTimer = 0;

  world.cameraX = 0;
  world.spawnX = 820;
  score = 0;
  coins = 0;
  lives = 3;
  distance = 0;
  currentSpeed = world.baseSpeed;
  elapsed = 0;
  input.crouch = false;
  input.boost = false;

  for (let i = 0; i < 8; i += 1) {
    spawnSegment();
  }
}

function beginGame() {
  resetGame();
  state = STATE.RUNNING;
  startOverlay.classList.add("overlay-hidden");
  messageOverlay.classList.add("overlay-hidden");
  tryPlayMusic();
}

function showMessage({ eyebrow, title, body }) {
  messageEyebrow.textContent = eyebrow;
  messageTitle.textContent = title;
  messageBody.textContent = body;
  messageOverlay.classList.remove("overlay-hidden");
}

function endGame() {
  state = STATE.GAME_OVER;
  bgm.pause();

  if (score > world.bestScore) {
    world.bestScore = score;
    localStorage.setItem("fengpao_best_score", String(world.bestScore));
  }

  showMessage({
    eyebrow: "本局结束",
    title: "撞上障碍了",
    body: `得分 ${score}，距离 ${Math.floor(distance)} 米。按 R 或点击按钮重新开始。`
  });
}

function exitToMenu() {
  state = STATE.READY;
  bgm.pause();
  startOverlay.classList.remove("overlay-hidden");
  messageOverlay.classList.add("overlay-hidden");
  setNotice("已回到开始界面。浏览器里 Esc 会退出本局，不能强制关闭 Safari。");
}

function playerHeight() {
  return input.crouch ? player.crouchHeight : player.standHeight;
}

function playerHitbox() {
  const h = playerHeight();
  return {
    x: player.x - player.width / 2,
    y: player.footY - h,
    w: player.width,
    h
  };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function queueJump() {
  if (state === STATE.RUNNING) {
    requestJump();
  } else if (state === STATE.GAME_OVER) {
    beginGame();
  }
}

function spawnDust(x, y, count, color = "rgba(255, 224, 138, 0.72)") {
  for (let i = 0; i < count; i += 1) {
    level.particles.push({
      x: x + randomBetween(-14, 14),
      y: y + randomBetween(-4, 8),
      vx: randomBetween(-120, 30),
      vy: randomBetween(-150, -40),
      life: randomBetween(0.22, 0.52),
      maxLife: 0.52,
      size: randomBetween(3, 8),
      color
    });
  }
}

function spawnSegment() {
  const x = world.spawnX + randomBetween(350, 650);
  const difficulty = Math.min(1, distance / 4200);
  const roll = Math.random();

  if (x > 1300 && roll < 0.38 + difficulty * 0.08) {
    const w = randomBetween(48, 86);
    const h = randomBetween(54, 94);
    level.obstacles.push({
      kind: "ground",
      x,
      y: world.groundY - h,
      w,
      h,
      hit: false
    });
    spawnCoinLine(x + 110, world.groundY - 158, 4, 48);
  } else if (roll < 0.66) {
    const h = randomBetween(38, 52);
    level.obstacles.push({
      kind: "high",
      x,
      y: world.groundY - 142,
      w: randomBetween(96, 150),
      h,
      hit: false
    });
    spawnCoinLine(x + 20, world.groundY - 78, 3, 46);
  } else if (roll < 0.84) {
    const platformY = world.groundY - randomBetween(154, 210);
    const platformW = randomBetween(190, 270);
    level.platforms.push({
      x,
      y: platformY,
      w: platformW,
      h: 24
    });
    spawnCoinArc(x + 28, platformY - 48, 5);
  } else {
    spawnCoinArc(x, world.groundY - 128, 6);
  }

  if (Math.random() < 0.18) {
    level.collectibles.push({
      kind: "star",
      x: x + randomBetween(160, 300),
      y: world.groundY - randomBetween(180, 250),
      r: 18,
      collected: false
    });
  }

  world.spawnX = x;
}

function spawnCoinLine(startX, y, count, gap) {
  for (let i = 0; i < count; i += 1) {
    level.collectibles.push({
      kind: "coin",
      x: startX + i * gap,
      y,
      r: 14,
      collected: false
    });
  }
}

function spawnCoinArc(startX, y, count) {
  for (let i = 0; i < count; i += 1) {
    const offset = Math.sin((i / Math.max(1, count - 1)) * Math.PI) * 54;
    level.collectibles.push({
      kind: "coin",
      x: startX + i * 48,
      y: y - offset,
      r: 14,
      collected: false
    });
  }
}

function performJump(isDoubleJump) {
  const jumpVelocity = isDoubleJump
    ? (input.boost ? -1120 : -1050)
    : (input.boost ? -820 : -760);

  player.velocityY = jumpVelocity;
  player.grounded = false;
  player.state = "jumping";
  player.jumpsUsed = Math.min(player.jumpsUsed + 1, player.maxJumps);
  player.doubleJumpTimer = isDoubleJump ? 0.75 : 0;
  input.crouch = false;

  spawnDust(
    player.x,
    isDoubleJump ? player.footY - playerHeight() * 0.55 : player.footY,
    isDoubleJump ? 18 : 8,
    isDoubleJump ? "rgba(184, 240, 255, 0.86)" : "rgba(255, 224, 138, 0.72)"
  );
}

function requestJump() {
  if (player.grounded) {
    performJump(false);
    return;
  }

  if (player.jumpsUsed === 1) {
    performJump(true);
    return;
  }

  if (player.jumpsUsed === 0) {
    performJump(false);
  }
}

function updatePlayerState() {
  if (state !== STATE.RUNNING) {
    player.state = "idle";
  } else if (!player.grounded) {
    player.state = "jumping";
  } else if (input.crouch) {
    player.state = "crouching";
  } else {
    player.state = "running";
  }
}

function updatePlayerAnimation(dt) {
  updatePlayerState();

  if (player.state !== player.lastAnimationState) {
    player.animationTimer = 0;
    player.currentFrame = 0;
    player.lastAnimationState = player.state;
  }

  if (player.state === "running") {
    const interval = input.boost ? 0.055 : 0.09;
    player.animationTimer += dt;
    player.currentFrame = Math.floor(player.animationTimer / interval) % Math.max(1, playerSprites.run.length);
  } else {
    player.currentFrame = 0;
    player.animationTimer += dt;
  }
}

function updatePlayer(dt) {
  const targetSpeed = input.boost ? world.boostSpeed : world.baseSpeed;
  currentSpeed += (targetSpeed - currentSpeed) * Math.min(1, dt * 7);
  currentSpeed += Math.min(distance / 12000, 1) * 85 * dt;

  player.previousFootY = player.footY;
  player.x += currentSpeed * dt;
  player.velocityY += world.gravity * dt;
  player.footY += player.velocityY * dt;
  player.grounded = false;

  for (const platform of level.platforms) {
    const withinX = player.x + player.width * 0.34 > platform.x && player.x - player.width * 0.34 < platform.x + platform.w;
    const crossedTop = player.previousFootY <= platform.y && player.footY >= platform.y;
    if (player.velocityY >= 0 && withinX && crossedTop) {
      player.footY = platform.y;
      player.velocityY = 0;
      player.grounded = true;
      player.jumpsUsed = 0;
      break;
    }
  }

  if (player.footY >= world.groundY) {
    if (!player.grounded && player.velocityY > 700) {
      spawnDust(player.x, world.groundY, 10, "rgba(216, 237, 196, 0.72)");
    }
    player.footY = world.groundY;
    player.velocityY = 0;
    player.grounded = true;
    player.jumpsUsed = 0;
  }

  if (player.invincibleTimer > 0) {
    player.invincibleTimer -= dt;
  }

  if (player.doubleJumpTimer > 0) {
    player.doubleJumpTimer -= dt;
  }

  if (input.boost && player.grounded) {
    player.trailTimer -= dt;
    if (player.trailTimer <= 0) {
      player.trailTimer = 0.035;
      spawnDust(player.x - 24, player.footY, 2, "rgba(255, 184, 77, 0.56)");
    }
  }

  distance = Math.max(0, (player.x - 180) / 10);
  score = Math.floor(distance) + coins * 50;
  world.cameraX = Math.max(0, player.x - 330);
  updatePlayerAnimation(dt);
}

function updateLevel(dt) {
  while (world.spawnX < world.cameraX + CONFIG.WIDTH + 900) {
    spawnSegment();
  }

  const removeBefore = world.cameraX - 260;
  level.obstacles = level.obstacles.filter((item) => item.x + item.w > removeBefore);
  level.platforms = level.platforms.filter((item) => item.x + item.w > removeBefore);
  level.collectibles = level.collectibles.filter((item) => !item.collected && item.x + item.r > removeBefore);

  const hitbox = playerHitbox();
  for (const obstacle of level.obstacles) {
    if (!obstacle.hit && player.invincibleTimer <= 0 && rectsOverlap(hitbox, obstacle)) {
      obstacle.hit = true;
      lives -= 1;
      player.invincibleTimer = 1.35;
      player.velocityY = Math.min(player.velocityY, -390);
      spawnDust(player.x, hitbox.y + hitbox.h / 2, 18, "rgba(255, 94, 94, 0.66)");

      if (lives <= 0) {
        endGame();
      }
      break;
    }
  }

  for (const item of level.collectibles) {
    const itemBox = {
      x: item.x - item.r,
      y: item.y - item.r,
      w: item.r * 2,
      h: item.r * 2
    };

    if (!item.collected && rectsOverlap(hitbox, itemBox)) {
      item.collected = true;
      coins += item.kind === "star" ? 3 : 1;
      spawnDust(item.x, item.y, item.kind === "star" ? 12 : 7, item.kind === "star" ? "rgba(255, 255, 166, 0.72)" : "rgba(255, 211, 105, 0.72)");
    }
  }

  for (const particle of level.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 430 * dt;
  }

  level.particles = level.particles.filter((particle) => particle.life > 0);
}

function update(dt) {
  elapsed += dt;

  if (state !== STATE.RUNNING) {
    world.cameraX += dt * 16;
    updatePlayerAnimation(dt);
    for (const particle of level.particles) {
      particle.life -= dt;
    }
    level.particles = level.particles.filter((particle) => particle.life > 0);
    return;
  }

  updatePlayer(dt);
  updateLevel(dt);
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, CONFIG.HEIGHT);
  sky.addColorStop(0, "#9ed6c1");
  sky.addColorStop(0.48, "#d8edc4");
  sky.addColorStop(1, "#f4d27a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

  ctx.save();
  ctx.translate(-world.cameraX * 0.08, 0);
  ctx.fillStyle = "rgba(255, 231, 151, 0.86)";
  ctx.beginPath();
  ctx.arc(240, 116, 52, 0, Math.PI * 2);
  ctx.fill();

  drawCloud(470, 92, 1.05);
  drawCloud(940, 140, 0.8);
  drawCloud(1490, 100, 1);
  drawCloud(2050, 150, 0.92);
  ctx.restore();

  drawMountainLayer(0.18, 430, "#567f69", "#426653");
  drawMountainLayer(0.32, 505, "#3e705b", "#2f5849");
  drawForestLayer();
}

function drawCloud(x, y, scale) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
  ctx.beginPath();
  ctx.arc(x, y, 24 * scale, 0, Math.PI * 2);
  ctx.arc(x + 30 * scale, y - 13 * scale, 34 * scale, 0, Math.PI * 2);
  ctx.arc(x + 68 * scale, y, 28 * scale, 0, Math.PI * 2);
  ctx.arc(x + 38 * scale, y + 13 * scale, 34 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawMountainLayer(parallax, baseY, colorA, colorB) {
  const offset = -(world.cameraX * parallax) % 720;
  ctx.save();
  ctx.translate(offset - 720, 0);
  for (let i = 0; i < 5; i += 1) {
    const x = i * 720;
    const gradient = ctx.createLinearGradient(x, baseY - 260, x, baseY);
    gradient.addColorStop(0, colorA);
    gradient.addColorStop(1, colorB);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x + 150, baseY - 190);
    ctx.lineTo(x + 300, baseY - 72);
    ctx.lineTo(x + 470, baseY - 250);
    ctx.lineTo(x + 720, baseY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawForestLayer() {
  const offset = -(world.cameraX * 0.55) % 110;
  ctx.save();
  ctx.translate(offset - 110, 0);
  for (let x = 0; x < CONFIG.WIDTH + 220; x += 110) {
    const trunkX = x + 44;
    ctx.fillStyle = "#5f4b32";
    ctx.fillRect(trunkX, world.groundY - 74, 14, 78);
    ctx.fillStyle = x % 220 === 0 ? "#2f6d4f" : "#39805b";
    ctx.beginPath();
    ctx.moveTo(x + 51, world.groundY - 158);
    ctx.lineTo(x + 6, world.groundY - 64);
    ctx.lineTo(x + 96, world.groundY - 64);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 51, world.groundY - 126);
    ctx.lineTo(x + 14, world.groundY - 42);
    ctx.lineTo(x + 88, world.groundY - 42);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawGround() {
  ctx.fillStyle = "#426653";
  ctx.fillRect(0, world.groundY, CONFIG.WIDTH, CONFIG.HEIGHT - world.groundY);
  ctx.fillStyle = "#6ea861";
  ctx.fillRect(0, world.groundY, CONFIG.WIDTH, 18);

  const offset = -(world.cameraX % 84);
  for (let x = offset - 84; x < CONFIG.WIDTH + 84; x += 84) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    roundedRect(x + 18, world.groundY + 38, 30, 8, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
    roundedRect(x + 52, world.groundY + 78, 42, 10, 5);
    ctx.fill();
  }
}

function drawPlatforms() {
  for (const platform of level.platforms) {
    const x = platform.x - world.cameraX;
    if (x > CONFIG.WIDTH + 80 || x + platform.w < -80) {
      continue;
    }

    ctx.fillStyle = "#6a8f55";
    roundedRect(x, platform.y, platform.w, platform.h, 8);
    ctx.fill();
    ctx.fillStyle = "#a3c96d";
    roundedRect(x, platform.y, platform.w, 9, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(x + 12, platform.y + platform.h, platform.w - 24, 8);
  }
}

function drawObstacles() {
  for (const obstacle of level.obstacles) {
    const x = obstacle.x - world.cameraX;
    if (x > CONFIG.WIDTH + 120 || x + obstacle.w < -120) {
      continue;
    }

    if (obstacle.kind === "ground") {
      ctx.fillStyle = obstacle.hit ? "#7c4d47" : "#6d6f63";
      roundedRect(x, obstacle.y, obstacle.w, obstacle.h, 8);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
      roundedRect(x + 10, obstacle.y + 10, obstacle.w * 0.46, 12, 6);
      ctx.fill();
      ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
      roundedRect(x + obstacle.w * 0.42, obstacle.y + obstacle.h - 20, obstacle.w * 0.44, 10, 5);
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(54, 65, 55, 0.55)";
      ctx.fillRect(x + 10, obstacle.y - 46, 8, 46);
      ctx.fillRect(x + obstacle.w - 18, obstacle.y - 46, 8, 46);
      ctx.fillStyle = obstacle.hit ? "#8e554b" : "#cf7b45";
      roundedRect(x, obstacle.y, obstacle.w, obstacle.h, 8);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 224, 138, 0.9)";
      ctx.fillRect(x + 8, obstacle.y + obstacle.h / 2 - 4, obstacle.w - 16, 8);
    }
  }
}

function drawStar(cx, cy, outer, inner, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawCollectibles() {
  for (const item of level.collectibles) {
    const x = item.x - world.cameraX;
    if (x > CONFIG.WIDTH + 80 || x < -80) {
      continue;
    }

    ctx.save();
    ctx.translate(x, item.y);
    ctx.rotate(elapsed * (item.kind === "star" ? 2.4 : 3.5));

    if (item.kind === "star") {
      drawStar(0, 0, item.r + 5, item.r * 0.48, "#fff06f");
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(-4, -4, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const coinGradient = ctx.createRadialGradient(-4, -6, 4, 0, 0, item.r);
      coinGradient.addColorStop(0, "#fff6aa");
      coinGradient.addColorStop(0.58, "#ffd36b");
      coinGradient.addColorStop(1, "#d48731");
      ctx.fillStyle = coinGradient;
      ctx.beginPath();
      ctx.ellipse(0, 0, item.r * (0.72 + Math.cos(elapsed * 5) * 0.14), item.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(91, 56, 28, 0.36)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawParticles() {
  for (const particle of level.particles) {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x - world.cameraX, particle.y, particle.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFallbackPlayer(screenX, footY, height) {
  const crouching = input.crouch;
  const bodyH = crouching ? height * 0.7 : height * 0.82;

  ctx.save();
  ctx.translate(screenX, footY);
  if (input.boost) {
    ctx.rotate(-0.08);
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 6, crouching ? 30 : 38, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1e8b5f";
  roundedRect(-25, -bodyH, 50, bodyH, 16);
  ctx.fill();
  ctx.fillStyle = "#f4e0bd";
  ctx.beginPath();
  ctx.arc(0, -bodyH - 17, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#173b34";
  ctx.fillRect(-13, -bodyH - 22, 26, 6);
  ctx.fillStyle = "#ffd36b";
  ctx.fillRect(-20, -bodyH + 28, 40, 8);

  ctx.strokeStyle = "#f7fff2";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-14, -bodyH + 50);
  ctx.lineTo(-28, -bodyH + (crouching ? 64 : 84));
  ctx.moveTo(14, -bodyH + 50);
  ctx.lineTo(30, -bodyH + (crouching ? 66 : 86));
  ctx.stroke();
  ctx.restore();
}

function getCurrentSpriteFrame() {
  if (!spritesReady) {
    return null;
  }

  if (player.state === "jumping") {
    return playerSprites.jump;
  }

  if (player.state === "crouching") {
    return playerSprites.crouch;
  }

  if (player.state === "running") {
    return playerSprites.run[player.currentFrame % playerSprites.run.length];
  }

  return playerSprites.idle;
}

function drawSpriteFrame(frame, centerX, footY, maxHeight) {
  const { image, bbox } = frame;
  const scale = maxHeight / bbox.h;
  const drawW = bbox.w * scale;
  const drawH = bbox.h * scale;

  ctx.drawImage(
    image,
    bbox.x,
    bbox.y,
    bbox.w,
    bbox.h,
    centerX - drawW / 2,
    footY - drawH,
    drawW,
    drawH
  );
}

function drawPlayer() {
  const screenX = player.x - world.cameraX;
  const h = playerHeight();
  const visible = player.invincibleTimer <= 0 || Math.floor(player.invincibleTimer * 16) % 2 === 0;

  ctx.save();
  ctx.translate(screenX, player.footY);

  if (input.boost && state === STATE.RUNNING) {
    ctx.strokeStyle = "rgba(255, 224, 138, 0.56)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-72 - i * 20, -30 - i * 12);
      ctx.lineTo(-24 - i * 10, -30 - i * 12);
      ctx.stroke();
    }
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
  ctx.beginPath();
  ctx.ellipse(0, 8, input.crouch ? 28 : 40, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  if (!visible) {
    return;
  }

  ctx.save();
  const lean = input.boost ? -0.08 : 0;
  ctx.translate(screenX, player.footY);
  ctx.rotate(lean);

  if (input.crouch) {
    ctx.fillStyle = "rgba(255, 224, 138, 0.22)";
    roundedRect(-44, -h - 8, 88, h + 12, 8);
    ctx.fill();
  }

  const spriteFrame = getCurrentSpriteFrame();
  if (spriteFrame) {
    const maxH = player.state === "crouching" ? 78 : 126;
    drawSpriteFrame(spriteFrame, 0, 0, maxH);
  } else {
    drawFallbackPlayer(0, 0, h);
  }

  ctx.restore();
}

function drawUi() {
  ctx.save();
  ctx.fillStyle = "rgba(18, 49, 42, 0.58)";
  roundedRect(22, 18, 362, 112, 8);
  ctx.fill();

  ctx.fillStyle = "#f7fff2";
  ctx.font = "900 28px Microsoft YaHei, sans-serif";
  ctx.fillText("峰跑", 42, 55);

  ctx.font = "700 18px Microsoft YaHei, sans-serif";
  ctx.fillStyle = "rgba(247, 255, 242, 0.86)";
  ctx.fillText(`得分 ${score}`, 42, 86);
  ctx.fillText(`距离 ${Math.floor(distance)}m`, 172, 86);
  ctx.fillText(`速度 ${Math.round(currentSpeed / 10)}`, 42, 114);
  ctx.fillText(`金币 ${coins}`, 172, 114);

  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = i < lives ? "#ff5e5e" : "rgba(255, 255, 255, 0.28)";
    drawStar(314 + i * 24, 48, 11, 5, ctx.fillStyle);
  }

  ctx.fillStyle = "rgba(18, 49, 42, 0.46)";
  roundedRect(CONFIG.WIDTH - 324, 18, 302, 82, 8);
  ctx.fill();
  ctx.fillStyle = "#f7fff2";
  ctx.font = "800 18px Microsoft YaHei, sans-serif";
  ctx.fillText(`最佳 ${world.bestScore}`, CONFIG.WIDTH - 302, 50);
  ctx.fillStyle = "rgba(247, 255, 242, 0.76)";
  ctx.font = "700 14px Microsoft YaHei, sans-serif";
  ctx.fillText("R 重新开始    Esc 退出本局", CONFIG.WIDTH - 302, 78);

  if (state === STATE.READY) {
    ctx.fillStyle = "rgba(18, 49, 42, 0.36)";
    roundedRect(438, 142, 404, 46, 8);
    ctx.fill();
    ctx.fillStyle = "#fff6aa";
    ctx.font = "800 20px Microsoft YaHei, sans-serif";
    ctx.fillText(spritesReady ? "角色精灵动画：assets/player/*.png" : "缺少角色动画帧，正在使用备用角色", 462, 172);
  }

  if (window.innerHeight > window.innerWidth) {
    ctx.fillStyle = "rgba(255, 224, 138, 0.92)";
    roundedRect(CONFIG.WIDTH / 2 - 142, 150, 284, 54, 27);
    ctx.fill();
    ctx.fillStyle = "#173b34";
    ctx.font = "900 28px Microsoft YaHei, PingFang SC, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("横屏体验更好", CONFIG.WIDTH / 2, 186);
    ctx.textAlign = "start";
  }

  ctx.restore();
}

function drawActionBadges() {
  if (state !== STATE.RUNNING) {
    return;
  }

  const badges = [];
  if (input.boost) {
    badges.push({ text: "加速", color: "#ffb84d" });
  }
  if (input.crouch) {
    badges.push({ text: "下蹲", color: "#91d6a0" });
  }
  if (!player.grounded) {
    badges.push({ text: "跳跃", color: "#fff06f" });
  }
  if (player.doubleJumpTimer > 0) {
    badges.push({ text: "二段跳", color: "#b8f0ff" });
  }

  let x = 42;
  for (const badge of badges) {
    const badgeWidth = badge.text.length > 2 ? 90 : 74;
    ctx.fillStyle = badge.color;
    roundedRect(x, 146, badgeWidth, 30, 8);
    ctx.fill();
    ctx.fillStyle = "#173b34";
    ctx.font = "900 16px Microsoft YaHei, sans-serif";
    ctx.fillText(badge.text, x + 18, 167);
    x += badgeWidth + 10;
  }
}

function draw() {
  ctx.clearRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  drawBackground();
  drawPlatforms();
  drawCollectibles();
  drawObstacles();
  drawGround();
  drawParticles();
  drawPlayer();
  drawUi();
  drawActionBadges();
}

function loop(timestamp) {
  if (!lastTime) {
    lastTime = timestamp;
  }

  const dt = Math.min(0.033, (timestamp - lastTime) / 1000);
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function setButtonActive(action, active) {
  const button = touchButtons[action];
  if (button) {
    button.classList.toggle("is-active", active);
  }
}

function setAction(action, active) {
  if (action === "jump" && active) {
    queueJump();
    setButtonActive(action, true);
    window.setTimeout(() => setButtonActive(action, false), 130);
    return;
  }

  input[action] = active;
  setButtonActive(action, active);
}

function bindHoldButton(button, action) {
  if (!button) {
    return;
  }

  let lastTouchStart = 0;

  const start = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.setPointerCapture && event.pointerId !== undefined) {
      button.setPointerCapture(event.pointerId);
    }
    setAction(action, true);
  };

  const end = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.releasePointerCapture && event.pointerId !== undefined && button.hasPointerCapture?.(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }
    if (action !== "jump") {
      setAction(action, false);
    }
  };

  button.addEventListener("touchstart", (event) => {
    lastTouchStart = performance.now();
    start(event);
  }, { passive: false });
  button.addEventListener("touchend", end, { passive: false });
  button.addEventListener("touchcancel", end, { passive: false });
  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" && performance.now() - lastTouchStart < 500) {
      return;
    }
    start(event);
  });
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("pointerleave", end);
  button.addEventListener("lostpointercapture", end);
}

function preventDefaultEvent(event) {
  if (event.cancelable) {
    event.preventDefault();
  }
}

function bindTouchDefaultBlocker(element) {
  if (!element) {
    return;
  }

  for (const eventName of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
    element.addEventListener(eventName, preventDefaultEvent, { passive: false });
  }
}

function bindMobileBrowserGuards() {
  document.addEventListener("contextmenu", preventDefaultEvent);
  document.addEventListener("selectstart", preventDefaultEvent);
  document.addEventListener("dragstart", preventDefaultEvent);

  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection?.();
    if (selection && selection.rangeCount > 0) {
      selection.removeAllRanges();
    }
  });

  document.addEventListener("touchstart", (event) => {
    if (state === STATE.RUNNING && !event.target.closest("#startButton, #restartButton, .control-button")) {
      preventDefaultEvent(event);
    }
  }, { passive: false, capture: true });

  document.addEventListener("touchmove", (event) => {
    if (state === STATE.RUNNING) {
      preventDefaultEvent(event);
    }
  }, { passive: false, capture: true });

  document.addEventListener("touchend", (event) => {
    if (state === STATE.RUNNING && !event.target.closest(".control-button")) {
      preventDefaultEvent(event);
    }
  }, { passive: false, capture: true });

  Object.values(touchButtons).forEach((button) => {
    const label = button.dataset.label || button.textContent.trim() || button.getAttribute("aria-label") || "";
    button.dataset.label = label;
    button.textContent = "";
  });

  document.querySelectorAll("img, canvas, button").forEach((element) => {
    element.draggable = false;
  });

  bindTouchDefaultBlocker(canvas);
  bindTouchDefaultBlocker(touchControls);
  Object.values(touchButtons).forEach(bindTouchDefaultBlocker);
}

function bindControls() {
  bindHoldButton(touchButtons.jump, "jump");
  bindHoldButton(touchButtons.crouch, "crouch");
  bindHoldButton(touchButtons.boost, "boost");

  window.addEventListener("keydown", (event) => {
    if (event.repeat && event.code !== "ShiftLeft" && event.code !== "ShiftRight") {
      return;
    }

    if (["Space", "ArrowUp", "KeyW", "ArrowDown", "KeyS"].includes(event.code)) {
      event.preventDefault();
    }

    if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
      queueJump();
    } else if (["ArrowDown", "KeyS"].includes(event.code)) {
      setAction("crouch", true);
    } else if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      setAction("boost", true);
    } else if (event.code === "KeyR") {
      beginGame();
    } else if (event.code === "Escape") {
      exitToMenu();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (["ArrowDown", "KeyS"].includes(event.code)) {
      setAction("crouch", false);
    } else if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      setAction("boost", false);
    }
  });

  window.addEventListener("blur", () => {
    setAction("crouch", false);
    setAction("boost", false);
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The game remains fully playable without offline caching.
    });
  }
}

function bindPageButtons() {
  startButton.addEventListener("click", beginGame);
  restartButton.addEventListener("click", beginGame);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      bgm.pause();
    } else if (state === STATE.RUNNING) {
      tryPlayMusic();
    }
  });
}

async function boot() {
  fitCanvasToDisplay();
  window.addEventListener("resize", fitCanvasToDisplay);
  bindMobileBrowserGuards();
  bindControls();
  bindPageButtons();
  registerServiceWorker();
  resetGame();
  await loadPlayerSprites();

  if (spritesReady) {
    setNotice("角色动画帧已加载：assets/player/run_0.png 到 crouch.png。音乐读取：assets/music/bgm.mp3");
  } else {
    setNotice(`缺少角色动画帧：${playerSprites.missing.join("、")}。请放到 assets/player/`);
  }

  requestAnimationFrame(loop);
}

boot();
