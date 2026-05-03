/**
 * Dino Runner — Optimized Script
 *
 * Improvement Index (search the tag to find the change):
 *  [PHYSICS]    - Delta-time gravity/velocity; frame-rate-independent jump arc
 *  [LOOP]       - Single RAF loop with delta-time cap; rafId prevents duplicate loops
 *  [COLLISION]  - Tight AABB with per-entity padding; hitbox helpers on every class
 *  [PERF]       - Object pooling (Cactus, Cloud); batched canvas path for ground tiles
 *  [STRUCTURE]  - ES6 classes: Dino, Cactus, Cloud, ObjectPool; separated concerns
 *  [GAMEPLAY]   - Smooth speed ramp via lerp; spawn interval shrinks with speed
 *  [CONTROLS]   - State-machine input object; keyup resets handled flag (no stuck jump)
 *  [STABILITY]  - rafId guard on restart; dt capped at 100 ms; score DOM only on change
 */

(() => {
  'use strict';

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const canvas    = document.getElementById('game');
  const ctx       = canvas.getContext('2d');
  const overlay   = document.getElementById('overlay');
  const startBtn  = document.getElementById('startBtn');
  const titleEl   = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  const scoreEl   = document.getElementById('score');
  const hiEl      = document.getElementById('hi');

  // ── Constants ───────────────────────────────────────────────────────────────
  const W        = canvas.width;   // 960
  const H        = canvas.height;  // 320
  const GROUND_Y = H - 30;

  // [PHYSICS] All physics in pixels-per-millisecond so behaviour is FPS-independent
  // Gravity: 0.0028 px/ms²  → travels ≈ 150 px up, feels natural at 60 fps
  const GRAVITY   = 0.0028;   // px / ms²
  const JUMP_VY   = -0.88;    // px / ms  (negative = up)

  // [GAMEPLAY] Speed in px/ms; starts at 0.35, caps at 0.85 after ~5 min of play
  const SPEED_INIT = 0.35;
  const SPEED_MAX  = 0.85;
  const SPEED_RAMP = 0.000011; // px/ms added per ms of play

  // ── State machine ───────────────────────────────────────────────────────────
  const STATE = Object.freeze({ IDLE: 'idle', PLAYING: 'playing', OVER: 'over' });
  let state = STATE.IDLE;

  // ── Persistent high score ───────────────────────────────────────────────────
  let highScore = parseInt(localStorage.getItem('dino_hi') || '0', 10);
  hiEl.textContent = String(highScore).padStart(5, '0');

  // ── [CONTROLS] Input state object ───────────────────────────────────────────
  // jumpPressed: true while key/touch is held
  // jumpConsumed: true after one jump was triggered; reset on keyup so hold doesn't re-jump
  const input = { jumpPressed: false, jumpConsumed: false };

  function onInputDown(e) {
    const isKey   = (e.code === 'Space' || e.code === 'ArrowUp');
    const isTouch = (e.type === 'touchstart' || e.type === 'mousedown');
    if (!isKey && !isTouch) return;
    if (e.cancelable) e.preventDefault();

    if (state === STATE.IDLE || state === STATE.OVER) {
      startGame();
      return;
    }
    input.jumpPressed = true;
  }

  function onInputUp(e) {
    const isKey   = (e.code === 'Space' || e.code === 'ArrowUp');
    const isTouch = (e.type === 'touchend' || e.type === 'mouseup');
    if (!isKey && !isTouch) return;
    // [CONTROLS] Reset both flags so next press is a fresh jump
    input.jumpPressed  = false;
    input.jumpConsumed = false;
  }

  window.addEventListener('keydown',   onInputDown, { passive: false });
  window.addEventListener('keyup',     onInputUp);
  canvas.addEventListener('touchstart', onInputDown, { passive: false });
  canvas.addEventListener('touchend',   onInputUp);
  canvas.addEventListener('mousedown',  onInputDown);
  canvas.addEventListener('mouseup',    onInputUp);
  startBtn.addEventListener('click', () => { if (state !== STATE.PLAYING) startGame(); });

  // ── [STRUCTURE] Dino class ───────────────────────────────────────────────────
  class Dino {
    constructor() {
      this.w = 44;
      this.h = 48;
      this.x = 60;
      this.reset();
    }

    reset() {
      this.y         = GROUND_Y;
      this.vy        = 0;
      this.onGround  = true;
      this.legTimer  = 0;
      this.legFrame  = 0;
    }

    update(dt) {
      // [CONTROLS] Only jump once per press; jumpConsumed prevents auto-repeat
      if (input.jumpPressed && !input.jumpConsumed && this.onGround) {
        this.vy           = JUMP_VY;
        this.onGround     = false;
        input.jumpConsumed = true;
      }

      // [PHYSICS] Semi-implicit Euler integration (gravity applied before position)
      if (!this.onGround) {
        this.vy += GRAVITY * dt;
        this.y  += this.vy * dt;

        if (this.y >= GROUND_Y) {
          this.y        = GROUND_Y; // snap to ground
          this.vy       = 0;
          this.onGround = true;
        }
      }

      // Animation — ~100 ms per frame at 60 fps
      this.legTimer += dt;
      if (this.legTimer > 100) {
        this.legTimer = 0;
        this.legFrame ^= 1;
      }
    }

    draw() {
      const x = this.x;
      const y = this.y - this.h;

      ctx.fillStyle = '#e8e8ec';
      ctx.fillRect(x + 8,  y + 12, 28, 22); // body
      ctx.fillRect(x + 22, y,      22, 18); // head

      ctx.fillStyle = '#15151a';
      ctx.fillRect(x + 36, y + 5, 3, 3);    // eye

      ctx.fillStyle = '#e8e8ec';
      ctx.fillRect(x, y + 14, 10, 6);       // tail

      // legs
      if (this.onGround) {
        if (this.legFrame === 0) {
          ctx.fillRect(x + 12, y + 34, 6, 14);
          ctx.fillRect(x + 26, y + 34, 6, 10);
        } else {
          ctx.fillRect(x + 12, y + 34, 6, 10);
          ctx.fillRect(x + 26, y + 34, 6, 14);
        }
      } else {
        ctx.fillRect(x + 12, y + 34, 6, 12);
        ctx.fillRect(x + 26, y + 34, 6, 12);
      }

      ctx.fillRect(x + 30, y + 22, 8, 4);   // arm
    }

    // [COLLISION] Inset hitbox — avoids false positives at sprite edges
    hitbox() {
      return {
        x: this.x + 9,
        y: this.y - this.h + 8,
        w: this.w - 18,
        h: this.h - 14,
      };
    }
  }

  // ── [STRUCTURE] Cactus class ─────────────────────────────────────────────────
  class Cactus {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.reset(w, h);
    }

    // [PERF] reset() called by ObjectPool instead of new allocation
    reset(w, h) {
      this.w      = w;
      this.h      = h;
      this.x      = W + 10;
      this.y      = GROUND_Y;
      this.active = true;
    }

    update(dt, spd) {
      this.x -= spd * dt;
      if (this.x + this.w < -10) this.active = false;
    }

    draw() {
      const x = this.x;
      const y = this.y - this.h;

      ctx.fillStyle = '#7bd17b';
      ctx.fillRect(x,          y,      this.w, this.h);
      ctx.fillRect(x - 4,      y + 8,  4,      12);
      ctx.fillRect(x + this.w, y + 14, 4,      10);

      ctx.fillStyle = '#4ea84e';
      ctx.fillRect(x + 2, y + 4, 3, this.h - 8);
    }

    // [COLLISION] Inset 4 px on each side — forgives grazing misses
    hitbox() {
      return {
        x: this.x + 4,
        y: this.y - this.h + 4,
        w: this.w - 8,
        h: this.h - 8,
      };
    }
  }

  // ── [STRUCTURE] Cloud class ──────────────────────────────────────────────────
  class Cloud {
    constructor() {
      this.reset();
    }

    reset() {
      this.x      = W + Math.random() * 200;
      this.y      = 30  + Math.random() * 80;
      // [PHYSICS] Cloud speed in px/ms — decoupled from game speed
      this.spd    = 0.025 + Math.random() * 0.025;
      this.active = true;
    }

    update(dt) {
      this.x -= this.spd * dt;
      if (this.x + 40 < 0) this.active = false;
    }

    draw() {
      ctx.fillStyle = '#2a2a33';
      ctx.fillRect(this.x,      this.y,     30,  8);
      ctx.fillRect(this.x + 6,  this.y - 5, 20,  8);
      ctx.fillRect(this.x + 12, this.y - 9, 12,  8);
    }
  }

  // ── [PERF] Generic Object Pool ───────────────────────────────────────────────
  class ObjectPool {
    constructor(factory) {
      this._pool   = [];
      this._factory = factory;
    }
    /** Retrieves a recycled or newly created object */
    get(...args) {
      const obj = this._pool.pop();
      if (obj) { obj.reset(...args); return obj; }
      return this._factory(...args);
    }
    /** Returns object back to pool for reuse */
    release(obj) {
      this._pool.push(obj);
    }
    /** Bulk-release an array and clear it */
    releaseAll(arr) {
      for (const obj of arr) this._pool.push(obj);
      arr.length = 0;
    }
  }

  const cactusPool = new ObjectPool((w, h) => new Cactus(w, h));
  const cloudPool  = new ObjectPool(() => new Cloud());

  // ── Obstacle variants (constant — never reallocated) ────────────────────────
  const CACTUS_VARIANTS = Object.freeze([
    { w: 16, h: 32 },
    { w: 22, h: 40 },
    { w: 32, h: 32 },
  ]);

  // ── Game variables ───────────────────────────────────────────────────────────
  const dino = new Dino();
  let obstacles     = [];
  let clouds        = [];
  let groundOffset  = 0;
  let speed         = SPEED_INIT;
  let score         = 0;
  let spawnTimer    = 0;
  let nextSpawnMs   = 1000;
  let cloudTimer    = 0;
  let lastDisplayed = -1;   // [PERF] only write to DOM when integer score changes
  let rafId         = 0;    // [STABILITY] store RAF id to cancel on restart

  // ── [GAMEPLAY] Spawn interval shrinks as speed grows ────────────────────────
  function calcNextSpawn() {
    const speedRatio  = speed / SPEED_INIT;  // grows as game progresses
    const base        = 900;                  // ms base gap
    const jitter      = Math.random() * 1200; // ms random extra
    return Math.max(480, (base + jitter) / speedRatio);
  }

  // ── Reset all state for a fresh game ────────────────────────────────────────
  function resetGame() {
    // [STABILITY] Return all live objects to pools to avoid leaks
    cactusPool.releaseAll(obstacles);
    cloudPool.releaseAll(clouds);

    speed        = SPEED_INIT;
    score        = 0;
    spawnTimer   = 0;
    nextSpawnMs  = 1000;
    cloudTimer   = 0;
    groundOffset = 0;
    lastDisplayed = -1;
    dino.reset();
  }

  // ── [COLLISION] Axis-Aligned Bounding Box test ───────────────────────────────
  function aabb(a, b) {
    return (
      a.x         < b.x + b.w &&
      a.x + a.w   > b.x       &&
      a.y         < b.y + b.h &&
      a.y + a.h   > b.y
    );
  }

  // ── [PERF] Ground rendered as single batched path ────────────────────────────
  function drawGround() {
    ctx.fillStyle = '#3a3a44';
    ctx.fillRect(0, GROUND_Y + 1, W, 2);

    ctx.fillStyle = '#5a5a66';
    ctx.beginPath();
    const offset = groundOffset % 24;
    for (let i = -24; i < W + 24; i += 24) {
      const x = i - offset;
      ctx.rect(x,      GROUND_Y + 5, 8, 2);
      ctx.rect(x + 14, GROUND_Y + 9, 4, 2);
    }
    ctx.fill();
  }

  // ── Update (runs every frame) ────────────────────────────────────────────────
  function update(dt) {
    if (state === STATE.PLAYING) {
      // [GAMEPLAY] Smooth speed ramp — clamped to SPEED_MAX
      speed = Math.min(SPEED_MAX, speed + SPEED_RAMP * dt);

      // [PHYSICS] Score and ground scroll both use the same delta time
      score        += 0.006 * dt;
      groundOffset += speed * dt;

      dino.update(dt);

      // ── Spawn obstacles ──────────────────────────────────────────────────
      spawnTimer += dt;
      if (spawnTimer >= nextSpawnMs) {
        spawnTimer  = 0;
        nextSpawnMs = calcNextSpawn();
        const v = CACTUS_VARIANTS[Math.floor(Math.random() * CACTUS_VARIANTS.length)];
        obstacles.push(cactusPool.get(v.w, v.h));
      }

      // ── Spawn clouds ─────────────────────────────────────────────────────
      cloudTimer += dt;
      if (cloudTimer > 2000) {
        cloudTimer = 0;
        if (clouds.length < 4) clouds.push(cloudPool.get());
      }

      // ── Update & cull obstacles ──────────────────────────────────────────
      for (let i = obstacles.length - 1; i >= 0; i--) {
        obstacles[i].update(dt, speed);
        if (!obstacles[i].active) {
          cactusPool.release(obstacles[i]);
          obstacles.splice(i, 1);
        }
      }

      // ── Update & cull clouds ─────────────────────────────────────────────
      for (let i = clouds.length - 1; i >= 0; i--) {
        clouds[i].update(dt);
        if (!clouds[i].active) {
          cloudPool.release(clouds[i]);
          clouds.splice(i, 1);
        }
      }

      // [COLLISION] Check dino vs every obstacle — break on first hit
      const db = dino.hitbox();
      for (let i = 0; i < obstacles.length; i++) {
        if (aabb(db, obstacles[i].hitbox())) {
          gameOver();
          return; // stop further update after collision
        }
      }

      // [PERF] DOM write only when the displayed integer changes
      const flooredScore = Math.floor(score);
      if (flooredScore !== lastDisplayed) {
        scoreEl.textContent = String(flooredScore).padStart(5, '0');
        lastDisplayed = flooredScore;
      }

    } else if (state === STATE.IDLE) {
      // Idle leg-bob animation — time-based
      dino.legTimer += dt;
      if (dino.legTimer > 220) {
        dino.legTimer = 0;
        dino.legFrame ^= 1;
      }
    }
  }

  // ── Draw (runs every frame) ──────────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < clouds.length; i++)    clouds[i].draw();
    drawGround();
    for (let i = 0; i < obstacles.length; i++) obstacles[i].draw();
    dino.draw();
  }

  // ── [LOOP] Main loop — delta time capped so tab-switch spike can't kill player ──
  let lastTimestamp = 0;
  function loop(timestamp) {
    rafId = requestAnimationFrame(loop); // store id

    if (!lastTimestamp) lastTimestamp = timestamp;
    let dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    // [STABILITY] Cap dt — prevents huge jumps after browser tab inactivity
    if (dt > 100) dt = 16.67; // treat as single 60 fps frame

    update(dt);
    draw();
  }

  // ── State transitions ────────────────────────────────────────────────────────
  function startGame() {
    // [STABILITY] Cancel any existing loop before starting a new one
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    lastTimestamp = 0;

    resetGame();
    state = STATE.PLAYING;
    overlay.classList.add('hidden');

    // [CONTROLS] Mark jump consumed so Space/click that launched the game
    // doesn't immediately trigger a jump on the first frame
    input.jumpConsumed = true;

    rafId = requestAnimationFrame(loop);
  }

  function gameOver() {
    state = STATE.OVER;
    const finalScore = Math.floor(score);

    if (finalScore > highScore) {
      highScore = finalScore;
      localStorage.setItem('dino_hi', String(highScore));
      hiEl.textContent = String(highScore).padStart(5, '0');
    }

    titleEl.textContent  = 'GAME OVER';
    subtitleEl.innerHTML = `
      <div class="final">
        <div>SCORE<b>${String(finalScore).padStart(5, '0')}</b></div>
        <div>HI<b>${String(highScore).padStart(5, '0')}</b></div>
      </div>`;
    startBtn.textContent = 'RESTART';
    overlay.classList.remove('hidden');
  }

  // ── [STABILITY] Kick off the idle loop once on page load ────────────────────
  rafId = requestAnimationFrame(loop);
})();
