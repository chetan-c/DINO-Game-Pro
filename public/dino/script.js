(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = H - 30;

  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  const scoreEl = document.getElementById('score');
  const hiEl = document.getElementById('hi');

  const STATE = { IDLE: 'idle', PLAYING: 'playing', OVER: 'over' };
  let state = STATE.IDLE;

  let highScore = parseInt(localStorage.getItem('dino_hi') || '0', 10);
  hiEl.textContent = String(highScore).padStart(5, '0');

  // ---- Dino ----
  const dino = {
    x: 60,
    y: GROUND_Y,
    w: 44,
    h: 48,
    vy: 0,
    gravity: 0.9,
    jumpV: -15,
    onGround: true,
    legTimer: 0,
    legFrame: 0,
    reset() {
      this.y = GROUND_Y;
      this.vy = 0;
      this.onGround = true;
    },
    jump() {
      if (this.onGround) {
        this.vy = this.jumpV;
        this.onGround = false;
      }
    },
    update() {
      this.vy += this.gravity;
      this.y += this.vy;
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y;
        this.vy = 0;
        this.onGround = true;
      }
      this.legTimer++;
      if (this.legTimer > 6) { this.legTimer = 0; this.legFrame ^= 1; }
    },
    draw() {
      const x = this.x;
      const y = this.y - this.h;
      ctx.fillStyle = '#e8e8ec';
      // body
      ctx.fillRect(x + 8, y + 12, 28, 22);
      // head
      ctx.fillRect(x + 22, y, 22, 18);
      // eye (dark)
      ctx.fillStyle = '#15151a';
      ctx.fillRect(x + 36, y + 5, 3, 3);
      // tail
      ctx.fillStyle = '#e8e8ec';
      ctx.fillRect(x, y + 14, 10, 6);
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
      // arm
      ctx.fillRect(x + 30, y + 22, 8, 4);
    },
    hitbox() {
      return { x: this.x + 6, y: this.y - this.h + 4, w: this.w - 12, h: this.h - 6 };
    }
  };

  // ---- Obstacles ----
  class Cactus {
    constructor(speed) {
      const variants = [
        { w: 16, h: 32 },
        { w: 22, h: 40 },
        { w: 32, h: 32 },
      ];
      const v = variants[Math.floor(Math.random() * variants.length)];
      this.w = v.w; this.h = v.h;
      this.x = W + 10;
      this.y = GROUND_Y;
      this.speed = speed;
    }
    update(speed) { this.x -= speed; }
    draw() {
      ctx.fillStyle = '#7bd17b';
      const x = this.x, y = this.y - this.h;
      ctx.fillRect(x, y, this.w, this.h);
      // arms detail
      ctx.fillRect(x - 4, y + 8, 4, 12);
      ctx.fillRect(x + this.w, y + 14, 4, 10);
      ctx.fillStyle = '#4ea84e';
      ctx.fillRect(x + 2, y + 4, 3, this.h - 8);
    }
    offscreen() { return this.x + this.w < -10; }
    hitbox() { return { x: this.x + 2, y: this.y - this.h + 2, w: this.w - 4, h: this.h - 4 }; }
  }

  // ---- Clouds ----
  class Cloud {
    constructor() {
      this.x = W + Math.random() * 200;
      this.y = 30 + Math.random() * 80;
      this.speed = 0.5 + Math.random() * 0.5;
    }
    update() { this.x -= this.speed; }
    draw() {
      ctx.fillStyle = '#2a2a33';
      ctx.fillRect(this.x, this.y, 30, 8);
      ctx.fillRect(this.x + 6, this.y - 5, 20, 8);
      ctx.fillRect(this.x + 12, this.y - 9, 12, 8);
    }
    offscreen() { return this.x + 40 < 0; }
  }

  let obstacles = [];
  let clouds = [];
  let groundOffset = 0;
  let speed = 6;
  let score = 0;
  let spawnTimer = 0;
  let nextSpawn = 60;
  let cloudTimer = 0;

  function reset() {
    obstacles = [];
    clouds = [];
    speed = 6;
    score = 0;
    spawnTimer = 0;
    nextSpawn = 60;
    cloudTimer = 0;
    groundOffset = 0;
    dino.reset();
  }

  function collide(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function drawGround() {
    ctx.fillStyle = '#3a3a44';
    ctx.fillRect(0, GROUND_Y + 1, W, 2);
    ctx.fillStyle = '#5a5a66';
    for (let i = 0; i < W; i += 24) {
      const x = (i - groundOffset) % W;
      ctx.fillRect(x, GROUND_Y + 5, 8, 2);
      ctx.fillRect(x + 14, GROUND_Y + 9, 4, 2);
    }
  }

  function update() {
    if (state === STATE.PLAYING) {
      speed += 0.002;
      score += 0.1;
      groundOffset = (groundOffset + speed) % 24;

      dino.update();

      spawnTimer++;
      if (spawnTimer >= nextSpawn) {
        spawnTimer = 0;
        nextSpawn = 50 + Math.random() * 80;
        obstacles.push(new Cactus(speed));
      }

      cloudTimer++;
      if (cloudTimer > 120) {
        cloudTimer = 0;
        if (clouds.length < 4) clouds.push(new Cloud());
      }

      obstacles.forEach(o => o.update(speed));
      obstacles = obstacles.filter(o => !o.offscreen());
      clouds.forEach(c => c.update());
      clouds = clouds.filter(c => !c.offscreen());

      const db = dino.hitbox();
      for (const o of obstacles) {
        if (collide(db, o.hitbox())) { gameOver(); break; }
      }

      scoreEl.textContent = String(Math.floor(score)).padStart(5, '0');
    } else if (state === STATE.IDLE) {
      dino.legTimer++;
      if (dino.legTimer > 12) { dino.legTimer = 0; dino.legFrame ^= 1; }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    clouds.forEach(c => c.draw());
    drawGround();
    obstacles.forEach(o => o.draw());
    dino.draw();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  function startGame() {
    reset();
    state = STATE.PLAYING;
    overlay.classList.add('hidden');
  }

  function gameOver() {
    state = STATE.OVER;
    const final = Math.floor(score);
    if (final > highScore) {
      highScore = final;
      localStorage.setItem('dino_hi', String(highScore));
      hiEl.textContent = String(highScore).padStart(5, '0');
    }
    titleEl.textContent = 'GAME OVER';
    subtitleEl.innerHTML = `
      <div class="final">
        <div>SCORE<b>${String(final).padStart(5,'0')}</b></div>
        <div>HI<b>${String(highScore).padStart(5,'0')}</b></div>
      </div>`;
    startBtn.textContent = 'RESTART';
    overlay.classList.remove('hidden');
  }

  // ---- Inputs ----
  function handleJump(e) {
    if (state === STATE.PLAYING) {
      dino.jump();
      e.preventDefault?.();
    }
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      if (state === STATE.IDLE || state === STATE.OVER) startGame();
      else handleJump(e);
      e.preventDefault();
    }
  });
  canvas.addEventListener('touchstart', (e) => { handleJump(e); }, { passive: false });
  canvas.addEventListener('mousedown', (e) => { handleJump(e); });
  startBtn.addEventListener('click', startGame);

  loop();
})();
