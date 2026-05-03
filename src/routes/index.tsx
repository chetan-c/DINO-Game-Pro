import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dino Run — Chrome Dino Clone" },
      { name: "description", content: "A Chrome Dino style endless runner built with Vanilla JS." },
    ],
  }),
  component: Index,
});

type GameState = "idle" | "playing" | "over";

function Index() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>("idle");
  const [uiState, setUiState] = useState<GameState>("idle");
  const [score, setScore] = useState(0);
  const [hi, setHi] = useState(0);
  const startRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;
    const GROUND_Y = H - 30;

    const stored = parseInt(localStorage.getItem("dino_hi") || "0", 10);
    let highScore = stored;
    setHi(highScore);

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
        if (this.legTimer > 6) {
          this.legTimer = 0;
          this.legFrame ^= 1;
        }
      },
      draw() {
        const x = this.x;
        const y = this.y - this.h;
        ctx.fillStyle = "#e8e8ec";
        ctx.fillRect(x + 8, y + 12, 28, 22);
        ctx.fillRect(x + 22, y, 22, 18);
        ctx.fillStyle = "#15151a";
        ctx.fillRect(x + 36, y + 5, 3, 3);
        ctx.fillStyle = "#e8e8ec";
        ctx.fillRect(x, y + 14, 10, 6);
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
        ctx.fillRect(x + 30, y + 22, 8, 4);
      },
      hitbox() {
        return { x: this.x + 6, y: this.y - this.h + 4, w: this.w - 12, h: this.h - 6 };
      },
    };

    type Box = { x: number; y: number; w: number; h: number };
    type Cactus = Box & { draw(): void; update(s: number): void; offscreen(): boolean; hitbox(): Box };
    type Cloud = { x: number; y: number; speed: number; draw(): void; update(): void; offscreen(): boolean };

    function makeCactus(): Cactus {
      const variants = [
        { w: 16, h: 32 },
        { w: 22, h: 40 },
        { w: 32, h: 32 },
      ];
      const v = variants[Math.floor(Math.random() * variants.length)];
      return {
        x: W + 10,
        y: GROUND_Y,
        w: v.w,
        h: v.h,
        update(s: number) {
          this.x -= s;
        },
        draw() {
          ctx.fillStyle = "#7bd17b";
          const x = this.x;
          const y = this.y - this.h;
          ctx.fillRect(x, y, this.w, this.h);
          ctx.fillRect(x - 4, y + 8, 4, 12);
          ctx.fillRect(x + this.w, y + 14, 4, 10);
          ctx.fillStyle = "#4ea84e";
          ctx.fillRect(x + 2, y + 4, 3, this.h - 8);
        },
        offscreen() {
          return this.x + this.w < -10;
        },
        hitbox() {
          return { x: this.x + 2, y: this.y - this.h + 2, w: this.w - 4, h: this.h - 4 };
        },
      };
    }

    function makeCloud(): Cloud {
      return {
        x: W + Math.random() * 200,
        y: 30 + Math.random() * 80,
        speed: 0.5 + Math.random() * 0.5,
        update() {
          this.x -= this.speed;
        },
        draw() {
          ctx.fillStyle = "#2a2a33";
          ctx.fillRect(this.x, this.y, 30, 8);
          ctx.fillRect(this.x + 6, this.y - 5, 20, 8);
          ctx.fillRect(this.x + 12, this.y - 9, 12, 8);
        },
        offscreen() {
          return this.x + 40 < 0;
        },
      };
    }

    let obstacles: Cactus[] = [];
    let clouds: Cloud[] = [];
    let groundOffset = 0;
    let speed = 6;
    let scoreVal = 0;
    let spawnTimer = 0;
    let nextSpawn = 60;
    let cloudTimer = 0;

    function reset() {
      obstacles = [];
      clouds = [];
      speed = 6;
      scoreVal = 0;
      spawnTimer = 0;
      nextSpawn = 60;
      cloudTimer = 0;
      groundOffset = 0;
      dino.reset();
    }

    function collide(a: Box, b: Box) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function drawGround() {
      ctx.fillStyle = "#3a3a44";
      ctx.fillRect(0, GROUND_Y + 1, W, 2);
      ctx.fillStyle = "#5a5a66";
      for (let i = 0; i < W; i += 24) {
        const x = (i - groundOffset) % W;
        ctx.fillRect(x, GROUND_Y + 5, 8, 2);
        ctx.fillRect(x + 14, GROUND_Y + 9, 4, 2);
      }
    }

    function gameOver() {
      stateRef.current = "over";
      setUiState("over");
      const final = Math.floor(scoreVal);
      if (final > highScore) {
        highScore = final;
        localStorage.setItem("dino_hi", String(highScore));
        setHi(highScore);
      }
    }

    function update() {
      if (stateRef.current === "playing") {
        speed += 0.002;
        scoreVal += 0.1;
        groundOffset = (groundOffset + speed) % 24;
        dino.update();

        spawnTimer++;
        if (spawnTimer >= nextSpawn) {
          spawnTimer = 0;
          nextSpawn = 50 + Math.random() * 80;
          obstacles.push(makeCactus());
        }
        cloudTimer++;
        if (cloudTimer > 120) {
          cloudTimer = 0;
          if (clouds.length < 4) clouds.push(makeCloud());
        }

        obstacles.forEach((o) => o.update(speed));
        obstacles = obstacles.filter((o) => !o.offscreen());
        clouds.forEach((c) => c.update());
        clouds = clouds.filter((c) => !c.offscreen());

        const db = dino.hitbox();
        for (const o of obstacles) {
          if (collide(db, o.hitbox())) {
            gameOver();
            break;
          }
        }
        setScore(Math.floor(scoreVal));
      } else if (stateRef.current === "idle") {
        dino.legTimer++;
        if (dino.legTimer > 12) {
          dino.legTimer = 0;
          dino.legFrame ^= 1;
        }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      clouds.forEach((c) => c.draw());
      drawGround();
      obstacles.forEach((o) => o.draw());
      dino.draw();
    }

    let raf = 0;
    function loop() {
      update();
      draw();
      raf = requestAnimationFrame(loop);
    }

    function startGame() {
      reset();
      stateRef.current = "playing";
      setUiState("playing");
    }
    startRef.current = startGame;

    function handleJump() {
      if (stateRef.current === "playing") dino.jump();
    }

    function onKey(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (stateRef.current === "playing") dino.jump();
        else startGame();
      }
    }
    function onTouch(e: TouchEvent) {
      e.preventDefault();
      if (stateRef.current === "playing") dino.jump();
      else startGame();
    }
    function onMouse() {
      handleJump();
    }

    window.addEventListener("keydown", onKey);
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    canvas.addEventListener("mousedown", onMouse);

    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("touchstart", onTouch);
      canvas.removeEventListener("mousedown", onMouse);
    };
  }, []);

  const showOverlay = uiState !== "playing";

  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-[#0f0f12] text-[#e8e8ec] font-mono select-none">
      <div className="absolute top-4 right-6 text-xs tracking-widest text-[#9aa0a6] z-10">
        <span className="text-[#f5b301] font-bold">HI {String(hi).padStart(5, "0")}</span>
        <span className="ml-3 font-bold">{String(score).padStart(5, "0")}</span>
      </div>
      <canvas
        ref={canvasRef}
        width={800}
        height={260}
        className="block max-h-[80vh] w-[min(95vw,900px)] [image-rendering:pixelated]"
      />
      {showOverlay && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0f0f12]/80 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-[#2a2a33] bg-[#15151a] px-10 py-8 text-center shadow-2xl">
            <h1 className="mb-2 text-3xl font-bold tracking-[4px] text-white">
              {uiState === "over" ? "GAME OVER" : "DINO RUN"}
            </h1>
            {uiState === "over" ? (
              <div className="mb-5 flex justify-center gap-6 text-sm text-[#c9ccd1]">
                <div>
                  SCORE
                  <b className="mt-1 block text-lg text-[#f5b301]">{String(score).padStart(5, "0")}</b>
                </div>
                <div>
                  HI
                  <b className="mt-1 block text-lg text-[#f5b301]">{String(hi).padStart(5, "0")}</b>
                </div>
              </div>
            ) : (
              <p className="mb-5 text-xs text-[#9aa0a6]">Press SPACE / ▲ or Tap to jump</p>
            )}
            <button
              onClick={() => startRef.current()}
              className="rounded-md bg-[#f5b301] px-7 py-3 text-base font-bold tracking-widest text-[#15151a] transition-transform hover:bg-[#ffc933] active:scale-95"
            >
              {uiState === "over" ? "RESTART" : "START GAME"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
