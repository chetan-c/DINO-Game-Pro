/* Dino Run Pro — Vanilla JS canvas game
   Clean modular structure: Game, Player, Enemy, Particle, Cloud, Audio, UI
*/
(() => {
  'use strict';

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const overlay = $('overlay');
  const pauseOverlay = $('pauseOverlay');
  const startBtn = $('startBtn');
  const resumeBtn = $('resumeBtn');
  const titleEl = $('title');
  const subtitleEl = $('subtitle');
  const scoreEl = $('score');
  const hiEl = $('hi');
  const comboEl = $('combo');
  const powerFill = $('powerFill');
  const finalBlock = $('finalScore');
  const finalScoreVal = $('finalScoreVal');
  const finalHiVal = $('finalHiVal');
  const charPicker = $('charPicker');
  const toast = $('toast');
  const pauseBtn = $('pauseBtn');
  const muteBtn = $('muteBtn');
  const themeBtn = $('themeBtn');
  const mJump = $('mJump');
  const mAttack = $('mAttack');
  const mSpecial = $('mSpecial');

  // ---------- Constants ----------
  const W = canvas.width;          // 960
  const H = canvas.height;         // 320
  const GROUND_Y = H - 40;
  const STATE = { IDLE: 'idle', PLAYING: 'playing', PAUSED: 'paused', OVER: 'over' };

  const CHARACTERS = {
    dino:  { name: 'DINO',  color: '#7bd17b', accent: '#3a8a3a', jumpV: -15.5, gravity: 0.9, speedMul: 1.0, atk: 1, w: 46, h: 50 },
    robot: { name: 'ROBOT', color: '#6c8cff', accent: '#2c3a8c', jumpV: -13.5, gravity: 0.95, speedMul: 1.15, atk: 2, w: 44, h: 48 },
    ninja: { name: 'NINJA', color: '#2e2e3a', accent: '#e8e8ec', jumpV: -17,   gravity: 0.95, speedMul: 1.05, atk: 3, w: 42, h: 50 },
  };

  // ---------- Audio (WebAudio, no assets) ----------
  const Sound = (() => {
    let actx = null, muted = false;
    const ensure = () => {
      if (!actx) {
        try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
      }
      if (actx && actx.state === 'suspended') actx.resume();
      return actx;
    };
    const tone = (freq, dur, type='square', vol=0.06, slide=0) => {
      const a = ensure(); if (!a || muted) return;
      const o = a.createOscillator(); const g = a.createGain();
      o.type = type; o.frequency.value = freq;
      if (slide) o.frequency.linearRampToValueAtTime(freq + slide, a.currentTime + dur);
      g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g).connect(a.destination);
      o.start(); o.stop(a.currentTime + dur);
    };
    return {
      jump:    () => tone(540, 0.12, 'square', 0.05, 220),
      attack:  () => { tone(320, 0.07, 'sawtooth', 0.06); setTimeout(()=>tone(180,0.08,'square',0.05),60); },
      hit:     () => tone(120, 0.35, 'triangle', 0.09, -80),
      kill:    () => { tone(700,0.06,'square',0.05); setTimeout(()=>tone(900,0.08,'square',0.05),60); },
      power:   () => { tone(440,0.08,'sine',0.06); setTimeout(()=>tone(660,0.1,'sine',0.06),80); setTimeout(()=>tone(880,0.14,'sine',0.06),160); },
      achieve: () => { tone(660,0.08,'square',0.05); setTimeout(()=>tone(990,0.12,'square',0.05),100); },
      toggle: () => { muted = !muted; return muted; },
      isMuted: () => muted,
    };
  })();

  // ---------- Utils ----------
  const rand = (min, max) => Math.random() * (max - min) + min;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const aabb = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const pad = (n, len=5) => String(Math.floor(n)).padStart(len, '0');

  // ---------- Particles ----------
  class Particle {
    constructor(x, y, opts = {}) {
      this.x = x; this.y = y;
      this.vx = opts.vx ?? rand(-2, 2);
      this.vy = opts.vy ?? rand(-3, -0.5);
      this.life = opts.life ?? rand(20, 40);
      this.max = this.life;
      this.size = opts.size ?? rand(2, 4);
      this.color = opts.color ?? '#f5b301';
      this.gravity = opts.gravity ?? 0.18;
    }
    update() {
      this.vy += this.gravity;
      this.x += this.vx; this.y += this.vy;
      this.life--;
    }
    draw(ctx) {
      const a = clamp(this.life / this.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x, this.y, this.size, this.size);
      ctx.globalAlpha = 1;
    }
    dead() { return this.life <= 0; }
  }

  // ---------- Clouds (parallax) ----------
  class Cloud {
    constructor(layer = 0) {
      this.layer = layer; // 0 far, 1 mid, 2 near
      this.x = W + rand(0, W);
      this.y = rand(20, GROUND_Y - 120);
      this.scale = layer === 2 ? rand(1, 1.4) : layer === 1 ? rand(0.7, 1) : rand(0.4, 0.7);
      this.speed = (0.3 + layer * 0.5);
    }
    update(speed) { this.x -= this.speed * (0.4 + speed * 0.05); }
    draw(ctx, dark) {
      const c = dark ? `rgba(255,255,255,${0.06 + this.layer*0.06})` : `rgba(255,255,255,${0.55 + this.layer*0.12})`;
      ctx.fillStyle = c;
      const s = this.scale;
      const x = this.x, y = this.y;
      ctx.beginPath();
      ctx.arc(x, y, 14*s, 0, Math.PI*2);
      ctx.arc(x+16*s, y-6*s, 12*s, 0, Math.PI*2);
      ctx.arc(x+30*s, y, 14*s, 0, Math.PI*2);
      ctx.arc(x+16*s, y+6*s, 12*s, 0, Math.PI*2);
      ctx.fill();
    }
    offscreen() { return this.x < -80; }
  }

  // ---------- Mountains (back parallax) ----------
  class Mountain {
    constructor() {
      this.x = W + rand(0, 400);
      this.h = rand(60, 130);
      this.w = this.h * rand(2, 3);
      this.speed = 0.4;
    }
    update(speed) { this.x -= this.speed * (0.3 + speed*0.04); }
    draw(ctx, dark) {
      const grad = ctx.createLinearGradient(0, GROUND_Y - this.h, 0, GROUND_Y);
      if (dark) {
        grad.addColorStop(0, '#2a2a3a'); grad.addColorStop(1, '#0e0e18');
      } else {
        grad.addColorStop(0, '#9bb4dd'); grad.addColorStop(1, '#cfe2ff');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(this.x, GROUND_Y);
      ctx.lineTo(this.x + this.w/2, GROUND_Y - this.h);
      ctx.lineTo(this.x + this.w, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }
    offscreen() { return this.x + this.w < -10; }
  }

  // ---------- Player ----------
  class Player {
    constructor(charKey) {
      this.setChar(charKey);
      this.x = 80;
      this.y = GROUND_Y;
      this.vy = 0;
      this.onGround = true;
      this.legTimer = 0; this.legFrame = 0;
      this.attackTimer = 0;
      this.invuln = 0;
      this.slowmoUntil = 0;
    }
    setChar(key) {
      this.charKey = key;
      const c = CHARACTERS[key];
      this.color = c.color; this.accent = c.accent;
      this.w = c.w; this.h = c.h;
      this.jumpV = c.jumpV; this.gravity = c.gravity;
      this.atk = c.atk; this.speedMul = c.speedMul;
    }
    jump() {
      if (this.onGround) {
        this.vy = this.jumpV;
        this.onGround = false;
        Sound.jump();
        for (let i = 0; i < 8; i++) game.particles.push(new Particle(this.x + this.w/2, this.y, {
          vx: rand(-1.5, 1.5), vy: rand(-1, 1), color: this.accent, size: rand(1,3), life: rand(15,28),
        }));
      }
    }
    attack() {
      if (this.attackTimer <= 0) {
        this.attackTimer = 18;
        Sound.attack();
        for (let i = 0; i < 10; i++) game.particles.push(new Particle(this.x + this.w + 6, this.y - this.h/2, {
          vx: rand(1.5, 4), vy: rand(-1.2, 1.2), color: '#ffd34d', size: rand(2,4), life: rand(14, 26), gravity: 0.05,
        }));
      }
    }
    update() {
      this.vy += this.gravity;
      this.y += this.vy;
      if (this.y >= GROUND_Y) { this.y = GROUND_Y; this.vy = 0; this.onGround = true; }
      if (this.attackTimer > 0) this.attackTimer--;
      if (this.invuln > 0) this.invuln--;
      this.legTimer++;
      if (this.legTimer > 5) { this.legTimer = 0; this.legFrame ^= 1; }
    }
    hitbox() { return { x: this.x + 6, y: this.y - this.h + 4, w: this.w - 12, h: this.h - 6 }; }
    attackBox() {
      if (this.attackTimer <= 0) return null;
      return { x: this.x + this.w, y: this.y - this.h + 6, w: 36, h: this.h - 10 };
    }
    draw(ctx) {
      const x = this.x, y = this.y - this.h;
      const blink = this.invuln > 0 && Math.floor(this.invuln / 4) % 2 === 0;
      if (blink) ctx.globalAlpha = 0.4;

      // shadow
      ctx.globalAlpha *= 0.35;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(this.x + this.w/2, GROUND_Y + 4, this.w/2, 4, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = blink ? 0.4 : 1;

      ctx.fillStyle = this.color;
      // body
      ctx.fillRect(x + 6, y + 14, 30, this.h - 22);
      // head
      ctx.fillRect(x + 18, y, 26, 20);
      // eye
      ctx.fillStyle = this.charKey === 'ninja' ? '#ff5b5b' : '#15151a';
      ctx.fillRect(x + 34, y + 6, 4, 4);
      // accent stripe
      ctx.fillStyle = this.accent;
      ctx.fillRect(x + 8, y + 16, 26, 3);
      // tail / cape
      ctx.fillStyle = this.color;
      if (this.charKey === 'ninja') {
        ctx.fillStyle = '#ff5b5b';
        ctx.fillRect(x + 2, y + 12, 8, 4);
      } else {
        ctx.fillRect(x, y + 16, 10, 6);
      }
      // legs
      ctx.fillStyle = this.color;
      if (this.onGround) {
        if (this.legFrame === 0) {
          ctx.fillRect(x + 10, y + this.h - 10, 6, 10);
          ctx.fillRect(x + 24, y + this.h - 10, 6, 6);
        } else {
          ctx.fillRect(x + 10, y + this.h - 10, 6, 6);
          ctx.fillRect(x + 24, y + this.h - 10, 6, 10);
        }
      } else {
        ctx.fillRect(x + 10, y + this.h - 10, 6, 8);
        ctx.fillRect(x + 24, y + this.h - 10, 6, 8);
      }
      // arm / weapon when attacking
      if (this.attackTimer > 0) {
        ctx.fillStyle = '#ffd34d';
        ctx.fillRect(x + this.w, y + 18, 26, 6);
        ctx.fillStyle = '#fff';
        ctx.globalAlpha *= 0.7;
        ctx.fillRect(x + this.w + 26, y + 14, 8, 14);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Enemies ----------
  class Cactus {
    constructor() {
      const variants = [{w:18,h:34},{w:24,h:42},{w:34,h:32}];
      const v = variants[Math.floor(Math.random()*variants.length)];
      this.w = v.w; this.h = v.h;
      this.x = W + 10; this.y = GROUND_Y;
      this.kind = 'cactus'; this.hp = 1;
    }
    update(speed) { this.x -= speed; }
    draw(ctx) {
      const x = this.x, y = this.y - this.h;
      ctx.fillStyle = '#4ea84e';
      ctx.fillRect(x, y, this.w, this.h);
      ctx.fillStyle = '#7bd17b';
      ctx.fillRect(x - 4, y + 8, 4, 12);
      ctx.fillRect(x + this.w, y + 14, 4, 10);
      ctx.fillStyle = '#356b35';
      ctx.fillRect(x + 2, y + 4, 3, this.h - 8);
    }
    offscreen() { return this.x + this.w < -10; }
    hitbox() { return { x: this.x + 2, y: this.y - this.h + 2, w: this.w - 4, h: this.h - 4 }; }
  }

  class Bird {
    constructor() {
      this.w = 36; this.h = 24;
      this.x = W + 10;
      const lanes = [GROUND_Y - 60, GROUND_Y - 110, GROUND_Y - 30];
      this.y = lanes[Math.floor(Math.random()*lanes.length)];
      this.baseY = this.y;
      this.t = Math.random() * Math.PI * 2;
      this.kind = 'bird'; this.hp = 1;
      this.flap = 0;
    }
    update(speed) {
      this.x -= speed * 1.05;
      this.t += 0.08;
      this.y = this.baseY + Math.sin(this.t) * 12;
      this.flap = (this.flap + 1) % 20;
    }
    draw(ctx) {
      const x = this.x, y = this.y - this.h;
      ctx.fillStyle = '#cf6bff';
      ctx.fillRect(x + 6, y + 8, 22, 10);
      ctx.fillRect(x + 24, y + 4, 10, 8);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 30, y + 6, 2, 2);
      ctx.fillStyle = '#cf6bff';
      const up = this.flap < 10;
      if (up) ctx.fillRect(x + 8, y, 18, 6);
      else    ctx.fillRect(x + 8, y + 16, 18, 6);
    }
    offscreen() { return this.x + this.w < -10; }
    hitbox() { return { x: this.x + 4, y: this.y - this.h + 2, w: this.w - 8, h: this.h - 4 }; }
  }

  class Drone {
    // shooter that moves up/down
    constructor() {
      this.w = 32; this.h = 26;
      this.x = W + 10;
      this.baseY = rand(GROUND_Y - 130, GROUND_Y - 50);
      this.y = this.baseY;
      this.t = 0;
      this.kind = 'drone'; this.hp = 2;
      this.shootTimer = rand(60, 120);
    }
    update(speed) {
      this.x -= speed * 0.7;
      this.t += 0.06;
      this.y = this.baseY + Math.sin(this.t) * 22;
      this.shootTimer--;
      if (this.shootTimer <= 0 && this.x < W - 60 && this.x > 120) {
        this.shootTimer = rand(80, 160);
        game.bullets.push(new Bullet(this.x, this.y - this.h/2));
      }
    }
    draw(ctx) {
      const x = this.x, y = this.y - this.h;
      ctx.fillStyle = '#ff5b5b';
      ctx.fillRect(x + 4, y + 8, this.w - 8, 10);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + this.w - 10, y + 11, 4, 4);
      ctx.fillStyle = '#444';
      ctx.fillRect(x, y + 6, 4, 2);
      ctx.fillRect(x + this.w - 4, y + 6, 4, 2);
      // rotor
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(x - 2, y + 4, this.w + 4, 2);
    }
    offscreen() { return this.x + this.w < -10; }
    hitbox() { return { x: this.x + 2, y: this.y - this.h + 2, w: this.w - 4, h: this.h - 4 }; }
  }

  class Bullet {
    constructor(x, y) {
      this.x = x; this.y = y; this.w = 8; this.h = 4;
      this.vx = -5;
    }
    update() { this.x += this.vx; }
    draw(ctx) {
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(this.x + 6, this.y, 6, this.h);
      ctx.globalAlpha = 1;
    }
    offscreen() { return this.x + this.w < -10 || this.x > W + 20; }
    hitbox() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  }

  // ---------- Game ----------
  const game = {
    state: STATE.IDLE,
    player: null,
    chosen: 'dino',
    enemies: [],
    bullets: [],
    particles: [],
    clouds: [],
    mountains: [],
    speed: 6,
    score: 0,
    hi: parseInt(localStorage.getItem('dinopro_hi') || '0', 10),
    spawnTimer: 0,
    nextSpawn: 60,
    cloudTimer: 0,
    mountainTimer: 0,
    groundOffset: 0,
    power: 0,                 // 0..100
    powerActive: 0,           // frames remaining of special
    cooldown: 0,              // frames until power regen begins after use
    combo: 1,
    comboTimer: 0,
    achievements: new Set(JSON.parse(localStorage.getItem('dinopro_ach') || '[]')),
    autoNight: false,
  };

  // ---------- UI helpers ----------
  function setHi() { hiEl.textContent = pad(game.hi); }
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 1800);
  }
  function unlockAchievement(id, label) {
    if (game.achievements.has(id)) return;
    game.achievements.add(id);
    localStorage.setItem('dinopro_ach', JSON.stringify([...game.achievements]));
    Sound.achieve();
    showToast('🏆 ' + label);
  }
  function applyTheme(mode) {
    document.body.classList.toggle('theme-light', mode === 'light');
    document.body.classList.toggle('theme-dark', mode === 'dark');
    themeBtn.textContent = mode === 'light' ? '☀️' : '🌙';
    localStorage.setItem('dinopro_theme', mode);
  }

  // ---------- Reset ----------
  function reset() {
    game.player = new Player(game.chosen);
    game.enemies = []; game.bullets = []; game.particles = [];
    game.clouds = []; game.mountains = [];
    game.speed = 6; game.score = 0;
    game.spawnTimer = 0; game.nextSpawn = 60;
    game.cloudTimer = 0; game.mountainTimer = 0;
    game.groundOffset = 0;
    game.power = 0; game.powerActive = 0; game.cooldown = 0;
    game.combo = 1; game.comboTimer = 0;
    // seed background
    for (let i = 0; i < 5; i++) { const c = new Cloud(i % 3); c.x = rand(0, W); game.clouds.push(c); }
    for (let i = 0; i < 2; i++) { const m = new Mountain(); m.x = rand(0, W); game.mountains.push(m); }
  }

  // ---------- Spawning ----------
  function spawnEnemy() {
    const s = game.score;
    const r = Math.random();
    let pool = ['cactus'];
    if (s > 200) pool.push('bird');
    if (s > 500) pool.push('bird', 'drone');
    if (s > 1000) pool.push('drone', 'drone');
    const kind = pool[Math.floor(r * pool.length)];
    if (kind === 'cactus') game.enemies.push(new Cactus());
    else if (kind === 'bird') game.enemies.push(new Bird());
    else game.enemies.push(new Drone());
  }

  // ---------- Collision / damage ----------
  function onPlayerHit() {
    if (game.player.invuln > 0) return;
    Sound.hit();
    for (let i = 0; i < 24; i++) game.particles.push(new Particle(game.player.x + game.player.w/2, game.player.y - game.player.h/2, {
      vx: rand(-4,4), vy: rand(-4,1), color: '#ff5b5b', size: rand(2,4), life: rand(20,40),
    }));
    gameOver();
  }
  function killEnemy(e, idx) {
    Sound.kill();
    for (let i = 0; i < 18; i++) game.particles.push(new Particle(e.x + e.w/2, e.y - e.h/2, {
      vx: rand(-3,3), vy: rand(-3,1), color: '#ffd34d', size: rand(2,4), life: rand(18,32),
    }));
    game.score += 50 * game.combo;
    game.combo = Math.min(8, game.combo + 1);
    game.comboTimer = 90;
    game.power = Math.min(100, game.power + 8);
    game.enemies.splice(idx, 1);
    if (game.combo >= 4) unlockAchievement('combo4', 'COMBO ×4');
  }

  // ---------- Special ability ----------
  function activateSpecial() {
    if (game.power < 100 || game.powerActive > 0) return;
    Sound.power();
    game.powerActive = 240;       // 4s @60fps
    game.cooldown = 120;
    game.power = 0;
    game.player.invuln = 240;
    // burst particles
    for (let i = 0; i < 40; i++) game.particles.push(new Particle(game.player.x + game.player.w/2, game.player.y - game.player.h/2, {
      vx: rand(-5,5), vy: rand(-5,-1), color: '#6c8cff', size: rand(2,5), life: rand(30,60), gravity: 0.05,
    }));
    showToast('⚡ INVINCIBLE');
  }

  // ---------- Drawing background ----------
  function drawBackground() {
    const dark = document.body.classList.contains('theme-dark');
    // night blend by score
    const night = clamp(game.score / 1500, 0, 1);
    // gradient sky
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    if (dark) {
      grad.addColorStop(0, `rgba(20,20,40,${0.4 + night*0.4})`);
      grad.addColorStop(1, `rgba(8,8,14,${0.6 + night*0.3})`);
    } else {
      grad.addColorStop(0, `rgba(180,210,255,${1 - night*0.6})`);
      grad.addColorStop(1, `rgba(240,245,255,${1 - night*0.4})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // sun / moon
    const cx = W - 110, cy = 60;
    ctx.beginPath();
    ctx.fillStyle = night > 0.5 ? `rgba(220,220,240,${0.6 + night*0.3})` : `rgba(255,210,120,${0.9})`;
    ctx.arc(cx, cy, 22, 0, Math.PI*2);
    ctx.fill();
    if (night > 0.5) {
      ctx.fillStyle = 'rgba(20,20,40,0.7)';
      ctx.beginPath(); ctx.arc(cx-7, cy-3, 18, 0, Math.PI*2); ctx.fill();
    }

    // mountains
    game.mountains.forEach(m => m.draw(ctx, dark || night > 0.5));
    // clouds
    game.clouds.forEach(c => c.draw(ctx, dark || night > 0.5));
  }
  function drawGround() {
    const dark = document.body.classList.contains('theme-dark');
    ctx.fillStyle = dark ? '#3a3a48' : '#5b5b6a';
    ctx.fillRect(0, GROUND_Y + 1, W, 2);
    ctx.fillStyle = dark ? '#5a5a68' : '#7a7a88';
    for (let i = 0; i < W + 24; i += 24) {
      const x = (i - game.groundOffset) % (W + 24);
      ctx.fillRect(x, GROUND_Y + 6, 8, 2);
      ctx.fillRect(x + 14, GROUND_Y + 10, 4, 2);
    }
  }

  // ---------- Update / Draw ----------
  function update(dt) {
    // ambient idle
    if (game.state !== STATE.PLAYING) {
      game.clouds.forEach(c => c.update(2));
      game.clouds = game.clouds.filter(c => !c.offscreen());
      game.cloudTimer++;
      if (game.cloudTimer > 70) { game.cloudTimer = 0; game.clouds.push(new Cloud(Math.floor(rand(0,3)))); }
      if (game.player) {
        // idle bob
        game.player.legTimer++;
        if (game.player.legTimer > 10) { game.player.legTimer = 0; game.player.legFrame ^= 1; }
      }
      return;
    }

    // Difficulty scale
    const slow = game.powerActive > 0 ? 0.55 : 1;
    const targetSpeed = (6 + Math.min(8, game.score / 200)) * game.player.speedMul;
    game.speed += (targetSpeed - game.speed) * 0.02;
    const sp = game.speed * slow;

    game.score += 0.2 * (game.player.speedMul);
    game.groundOffset = (game.groundOffset + sp) % 24;

    // Combo decay
    if (game.comboTimer > 0) game.comboTimer--; else if (game.combo > 1) game.combo = Math.max(1, game.combo - 1);

    // Power regen
    if (game.cooldown > 0) game.cooldown--;
    else if (game.powerActive <= 0) game.power = Math.min(100, game.power + 0.12);
    if (game.powerActive > 0) game.powerActive--;

    // Player
    game.player.update();

    // Spawn
    game.spawnTimer++;
    const spawnGap = Math.max(36, 80 - Math.floor(game.score / 80));
    if (game.spawnTimer >= game.nextSpawn) {
      game.spawnTimer = 0;
      game.nextSpawn = spawnGap + Math.random() * 60;
      spawnEnemy();
    }
    game.cloudTimer++;
    if (game.cloudTimer > 70) { game.cloudTimer = 0; if (game.clouds.length < 8) game.clouds.push(new Cloud(Math.floor(rand(0,3)))); }
    game.mountainTimer++;
    if (game.mountainTimer > 240) { game.mountainTimer = 0; if (game.mountains.length < 4) game.mountains.push(new Mountain()); }

    // Update entities
    game.enemies.forEach(e => e.update(sp));
    game.bullets.forEach(b => b.update());
    game.clouds.forEach(c => c.update(sp));
    game.mountains.forEach(m => m.update(sp));
    game.particles.forEach(p => p.update());

    // Cull
    game.enemies = game.enemies.filter(e => !e.offscreen());
    game.bullets = game.bullets.filter(b => !b.offscreen());
    game.clouds = game.clouds.filter(c => !c.offscreen());
    game.mountains = game.mountains.filter(m => !m.offscreen());
    game.particles = game.particles.filter(p => !p.dead());

    // Player attack vs enemies
    const ab = game.player.attackBox();
    if (ab) {
      for (let i = game.enemies.length - 1; i >= 0; i--) {
        const e = game.enemies[i];
        if (aabb(ab, e.hitbox())) {
          e.hp -= game.player.atk;
          if (e.hp <= 0) killEnemy(e, i);
          else {
            for (let k=0;k<6;k++) game.particles.push(new Particle(e.x + e.w/2, e.y - e.h/2, { color: '#fff', size: 2, life: 14 }));
          }
        }
      }
    }

    // Enemy/bullet vs player
    const pb = game.player.hitbox();
    for (const e of game.enemies) {
      if (aabb(pb, e.hitbox())) {
        if (game.player.invuln > 0) {
          // ram-kill while invincible
          const idx = game.enemies.indexOf(e);
          killEnemy(e, idx);
        } else {
          onPlayerHit();
          return;
        }
      }
    }
    for (let i = game.bullets.length - 1; i >= 0; i--) {
      const b = game.bullets[i];
      if (aabb(pb, b.hitbox())) {
        if (game.player.invuln > 0) { game.bullets.splice(i,1); continue; }
        onPlayerHit();
        return;
      }
    }

    // Achievements
    if (game.score >= 100) unlockAchievement('s100', 'SURVIVOR — 100');
    if (game.score >= 500) unlockAchievement('s500', 'VETERAN — 500');
    if (game.score >= 1000) unlockAchievement('s1000', 'LEGEND — 1000');

    // UI
    scoreEl.textContent = pad(game.score);
    comboEl.textContent = String(game.combo);
    powerFill.style.width = game.power + '%';
    powerFill.classList.toggle('ready', game.power >= 100 && game.powerActive <= 0);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawGround();
    // back-to-front entities
    game.enemies.forEach(e => e.draw(ctx));
    game.bullets.forEach(b => b.draw(ctx));
    if (game.player) game.player.draw(ctx);
    game.particles.forEach(p => p.draw(ctx));

    // power-active overlay
    if (game.powerActive > 0) {
      ctx.fillStyle = 'rgba(108,140,255,0.08)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------- Main loop ----------
  let lastT = performance.now();
  function loop(t) {
    const dt = Math.min(33, t - lastT); lastT = t;
    if (game.state !== STATE.PAUSED) {
      update(dt);
      draw();
    }
    requestAnimationFrame(loop);
  }

  // ---------- State transitions ----------
  function startGame() {
    reset();
    game.state = STATE.PLAYING;
    overlay.classList.add('hidden');
    finalBlock.classList.add('hidden');
  }
  function gameOver() {
    game.state = STATE.OVER;
    if (game.score > game.hi) { game.hi = Math.floor(game.score); localStorage.setItem('dinopro_hi', String(game.hi)); setHi(); }
    titleEl.innerHTML = 'GAME <span class="accent">OVER</span>';
    subtitleEl.textContent = 'Pick a runner and try again';
    finalScoreVal.textContent = pad(game.score);
    finalHiVal.textContent = pad(game.hi);
    finalBlock.classList.remove('hidden');
    startBtn.textContent = 'RESTART';
    overlay.classList.remove('hidden');
  }
  function togglePause() {
    if (game.state === STATE.PLAYING) {
      game.state = STATE.PAUSED;
      pauseOverlay.classList.remove('hidden');
    } else if (game.state === STATE.PAUSED) {
      game.state = STATE.PLAYING;
      pauseOverlay.classList.add('hidden');
    }
  }

  // ---------- Inputs ----------
  function handleJump() {
    if (game.state === STATE.PLAYING) game.player.jump();
  }
  function handleAttack() {
    if (game.state === STATE.PLAYING) game.player.attack();
  }
  function handleSpecial() {
    if (game.state === STATE.PLAYING) activateSpecial();
  }

  window.addEventListener('keydown', (e) => {
    const k = e.code;
    if (['Space','ArrowUp','KeyA','KeyS','KeyP'].includes(k)) e.preventDefault();
    if (k === 'Space' || k === 'ArrowUp') {
      if (game.state === STATE.IDLE || game.state === STATE.OVER) startGame();
      else handleJump();
    } else if (k === 'KeyA') {
      handleAttack();
    } else if (k === 'KeyS') {
      handleSpecial();
    } else if (k === 'KeyP') {
      togglePause();
    }
  });

  // Touch / mouse on canvas: jump
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); if (game.state === STATE.PLAYING) handleJump(); }, { passive: false });
  canvas.addEventListener('mousedown', () => { if (game.state === STATE.PLAYING) handleJump(); });

  startBtn.addEventListener('click', startGame);
  resumeBtn.addEventListener('click', togglePause);
  pauseBtn.addEventListener('click', togglePause);
  muteBtn.addEventListener('click', () => {
    const m = Sound.toggle();
    muteBtn.textContent = m ? '🔈' : '🔊';
  });
  themeBtn.addEventListener('click', () => {
    const next = document.body.classList.contains('theme-dark') ? 'light' : 'dark';
    applyTheme(next);
  });

  // Mobile buttons
  const tap = (el, fn) => {
    el.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false });
    el.addEventListener('mousedown', (e) => { e.preventDefault(); fn(); });
  };
  tap(mJump, () => { if (game.state === STATE.IDLE || game.state === STATE.OVER) startGame(); else handleJump(); });
  tap(mAttack, handleAttack);
  tap(mSpecial, handleSpecial);

  // Character picker
  function selectChar(key) {
    game.chosen = key;
    [...charPicker.querySelectorAll('.char')].forEach(b => b.classList.toggle('selected', b.dataset.char === key));
  }
  charPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.char');
    if (!btn) return;
    selectChar(btn.dataset.char);
  });
  selectChar('dino');

  // ---------- Init ----------
  applyTheme(localStorage.getItem('dinopro_theme') || 'dark');
  setHi();
  game.player = new Player(game.chosen);
  // seed background for idle screen
  for (let i = 0; i < 5; i++) { const c = new Cloud(i % 3); c.x = rand(0, W); game.clouds.push(c); }
  for (let i = 0; i < 2; i++) { const m = new Mountain(); m.x = rand(0, W); game.mountains.push(m); }

  requestAnimationFrame(loop);
})();
