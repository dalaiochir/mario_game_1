'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type Rect = { x: number; y: number; w: number; h: number };

function aabb(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default function Page() {
  // World хэмжээс
  const VIEW_W = 960;
  const VIEW_H = 540;
  const GROUND_H = 70;
  const WORLD_W = 2600; // урт level
  const GRAVITY = 2100; // px/s^2
  const MOVE = 520;     // px/s
  const RUN = 760;      // px/s
  const JUMP = 820;     // px/s

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  const keys = useRef({
    left: false,
    right: false,
    down: false,
    jump: false,
    jumpPressed: false,
  });

  const [paused, setPaused] = useState(true);
  const [message, setMessage] = useState<string>('Start');

  const [life, setLife] = useState(3);
  const [coin, setCoin] = useState(0);
  const [score, setScore] = useState(0);
  const [big, setBig] = useState(false);
  const [won, setWon] = useState(false);

  // Mario state
  const mario = useRef({
    x: 60,
    y: VIEW_H - GROUND_H - 44,
    vx: 0,
    vy: 0,
    onGround: false,
    crouch: false,
    w: 34,
    h: 44,
  });

  // Level entities
  const blocks = useMemo<Rect[]>(
    () => [
      { x: 260, y: 360, w: 64, h: 44 },
      { x: 340, y: 300, w: 64, h: 44 },
      { x: 420, y: 240, w: 64, h: 44 },
      { x: 720, y: 320, w: 64, h: 44 },
      { x: 784, y: 320, w: 64, h: 44 },
      { x: 1100, y: 280, w: 64, h: 44 },
      { x: 1500, y: 340, w: 64, h: 44 },
      { x: 1564, y: 340, w: 64, h: 44 },
      { x: 1628, y: 340, w: 64, h: 44 },
      { x: 1950, y: 300, w: 64, h: 44 },
    ],
    []
  );

  const [coins, setCoins] = useState<Rect[]>(
    () => [
      { x: 280, y: 320, w: 24, h: 24 },
      { x: 360, y: 260, w: 24, h: 24 },
      { x: 440, y: 200, w: 24, h: 24 },
      { x: 740, y: 280, w: 24, h: 24 },
      { x: 1120, y: 240, w: 24, h: 24 },
      { x: 1980, y: 260, w: 24, h: 24 },
    ]
  );

  const [mushrooms, setMushrooms] = useState<Rect[]>(
    () => [{ x: 860, y: VIEW_H - GROUND_H - 30, w: 30, h: 30 }]
  );

  const [enemies, setEnemies] = useState<{ r: Rect; dir: 1 | -1; alive: boolean }[]>(
    () => [
      { r: { x: 560, y: VIEW_H - GROUND_H - 28, w: 34, h: 28 }, dir: -1, alive: true },
      { r: { x: 1320, y: VIEW_H - GROUND_H - 28, w: 34, h: 28 }, dir: -1, alive: true },
      { r: { x: 1750, y: VIEW_H - GROUND_H - 28, w: 34, h: 28 }, dir: -1, alive: true },
    ]
  );

  const flag = useMemo<Rect>(() => ({ x: WORLD_W - 120, y: VIEW_H - GROUND_H - 180, w: 74, h: 180 }), [WORLD_W]);

  // Camera
  const [camX, setCamX] = useState(0);

  const reset = () => {
    mario.current = {
      x: 60,
      y: VIEW_H - GROUND_H - 44,
      vx: 0,
      vy: 0,
      onGround: false,
      crouch: false,
      w: 34,
      h: 44,
    };
    setCamX(0);
    setCoins([
      { x: 280, y: 320, w: 24, h: 24 },
      { x: 360, y: 260, w: 24, h: 24 },
      { x: 440, y: 200, w: 24, h: 24 },
      { x: 740, y: 280, w: 24, h: 24 },
      { x: 1120, y: 240, w: 24, h: 24 },
      { x: 1980, y: 260, w: 24, h: 24 },
    ]);
    setMushrooms([{ x: 860, y: VIEW_H - GROUND_H - 30, w: 30, h: 30 }]);
    setEnemies([
      { r: { x: 560, y: VIEW_H - GROUND_H - 28, w: 34, h: 28 }, dir: -1, alive: true },
      { r: { x: 1320, y: VIEW_H - GROUND_H - 28, w: 34, h: 28 }, dir: -1, alive: true },
      { r: { x: 1750, y: VIEW_H - GROUND_H - 28, w: 34, h: 28 }, dir: -1, alive: true },
    ]);
    setCoin(0);
    setScore(0);
    setBig(false);
    setWon(false);
    setMessage('Start');
    setPaused(true);
  };

  const hit = () => {
    // Дайсанд хүрэх дүрэм:
    // - Big бол жижиг болно (амь хасахгүй)
    // - Small бол амь -1, дахин эхлэнэ
    if (big) {
      setBig(false);
      setScore((s) => Math.max(0, s - 50));
      return;
    }
    setLife((l) => l - 1);
    setScore((s) => Math.max(0, s - 100));
    mario.current.x = 60;
    mario.current.y = VIEW_H - GROUND_H - 44;
    mario.current.vx = 0;
    mario.current.vy = 0;
    setCamX(0);
  };

  // Key handlers
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft') keys.current.left = true;
      if (e.code === 'ArrowRight') keys.current.right = true;
      if (e.code === 'ArrowDown') keys.current.down = true;
      if (e.code === 'Space') {
        if (!keys.current.jump) keys.current.jumpPressed = true;
        keys.current.jump = true;
      }
      if (e.code === 'KeyP') setPaused((p) => !p);
      if (e.code === 'Enter' && paused) {
        setPaused(false);
        setMessage('');
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft') keys.current.left = false;
      if (e.code === 'ArrowRight') keys.current.right = false;
      if (e.code === 'ArrowDown') keys.current.down = false;
      if (e.code === 'Space') keys.current.jump = false;
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [paused]);

  // Game loop
  useEffect(() => {
    const step = (t: number) => {
      if (!lastRef.current) lastRef.current = t;
      const dt = clamp((t - lastRef.current) / 1000, 0, 0.033);
      lastRef.current = t;

      if (!paused && !won && life > 0) {
        const m = mario.current;

        // Crouch
        m.crouch = keys.current.down;

        // Move
        const speed = (keys.current.left || keys.current.right) && (keys.current.jump) ? RUN : MOVE;
        let targetVx = 0;
        if (keys.current.left) targetVx -= speed;
        if (keys.current.right) targetVx += speed;
        m.vx = targetVx;

        // Jump (press once)
        if (keys.current.jumpPressed && m.onGround) {
          m.vy = -JUMP;
          m.onGround = false;
        }
        keys.current.jumpPressed = false;

        // Gravity
        m.vy += GRAVITY * dt;

        // Integrate X
        let nx = m.x + m.vx * dt;
        let ny = m.y + m.vy * dt;

        // Bounds
        nx = clamp(nx, 0, WORLD_W - m.w);

        // Ground collision
        const groundY = VIEW_H - GROUND_H - m.h;
        if (ny >= groundY) {
          ny = groundY;
          m.vy = 0;
          m.onGround = true;
        }

        // Block collisions (simple resolution)
        const mRect: Rect = { x: nx, y: ny, w: m.w, h: m.h };
        for (const b of blocks) {
          if (!aabb(mRect, b)) continue;

          // Determine smallest penetration
          const dx1 = (b.x + b.w) - mRect.x;        // push left
          const dx2 = (mRect.x + mRect.w) - b.x;    // push right
          const dy1 = (b.y + b.h) - mRect.y;        // push up
          const dy2 = (mRect.y + mRect.h) - b.y;    // push down

          const minX = Math.min(dx1, dx2);
          const minY = Math.min(dy1, dy2);

          if (minX < minY) {
            // resolve horizontally
            if (dx1 < dx2) nx = b.x + b.w;
            else nx = b.x - mRect.w;
            m.vx = 0;
          } else {
            // resolve vertically
            if (dy1 < dy2) {
              ny = b.y + b.h; // hit from below
              m.vy = 0;
            } else {
              ny = b.y - mRect.h; // land on top
              m.vy = 0;
              m.onGround = true;
            }
          }
          mRect.x = nx; mRect.y = ny;
        }

        // Fall into pit (ямар нэг “нүх” эффект: газраас доош унах боломжгүй тул pit-ийг хиймлээр шалгана)
        // Энд demo болгон WORLD-ийн төгсгөлөөс өмнө нэг pit:
        const pitStart = 980;
        const pitEnd = 1040;
        const onPit = (mRect.x + mRect.w / 2) > pitStart && (mRect.x + mRect.w / 2) < pitEnd;
        if (onPit && mRect.y >= groundY - 1) {
          // pit дээр газар байхгүй мэт
          m.onGround = false;
          m.vy += GRAVITY * dt;
          ny = m.y + m.vy * dt;
          if (ny > VIEW_H + 200) hit();
        }

        // Update Mario
        m.x = nx;
        m.y = ny;

        // Enemy patrol + collisions
        setEnemies((prev) => {
          const next = prev.map((e) => {
            if (!e.alive) return e;
            const speedE = 90;
            let ex = e.r.x + e.dir * speedE * dt;

            // turn around on bounds
            if (ex < 0) { ex = 0; e.dir = 1; }
            if (ex > WORLD_W - e.r.w) { ex = WORLD_W - e.r.w; e.dir = -1; }

            // turn around near blocks (rough)
            const eRect: Rect = { ...e.r, x: ex };
            for (const b of blocks) {
              if (aabb({ x: eRect.x, y: eRect.y, w: eRect.w, h: eRect.h }, b)) {
                e.dir = (e.dir === 1 ? -1 : 1);
                ex = e.r.x; // cancel move
                break;
              }
            }

            e.r = { ...e.r, x: ex };
            return { ...e };
          });

          // Check enemy collision with Mario (use current rect)
          const mr: Rect = { x: m.x, y: m.y, w: m.w, h: m.h };
          const mrPrevY = m.y - m.vy * dt;

          let changed = false;
          for (const e of next) {
            if (!e.alive) continue;
            if (!aabb(mr, e.r)) continue;

            // Stomp detection: Mario was above enemy last frame and is falling
            const wasAbove = mrPrevY + m.h <= e.r.y + 6;
            const falling = m.vy > 0;

            if (wasAbove && falling) {
              e.alive = false;
              changed = true;
              m.vy = -JUMP * 0.55; // bounce
              setScore((s) => s + 200);
            } else {
              hit();
            }
          }
          return changed ? [...next] : next;
        });

        // Coin pickup
        setCoins((prev) => {
          const mr: Rect = { x: m.x, y: m.y, w: m.w, h: m.h };
          const remain: Rect[] = [];
          let got = 0;
          for (const c of prev) {
            if (aabb(mr, c)) got++;
            else remain.push(c);
          }
          if (got) {
            setCoin((k) => {
              const nk = k + got;
              // 100 coin -> +1 life
              if (nk >= 100) {
                setLife((l) => l + Math.floor(nk / 100));
                return nk % 100;
              }
              return nk;
            });
            setScore((s) => s + got * 50);
          }
          return remain;
        });

        // Mushroom pickup
        setMushrooms((prev) => {
          const mr: Rect = { x: m.x, y: m.y, w: m.w, h: m.h };
          const remain: Rect[] = [];
          let got = 0;
          for (const mu of prev) {
            if (aabb(mr, mu)) got++;
            else remain.push(mu);
          }
          if (got) {
            setBig(true);
            setScore((s) => s + 300);
          }
          return remain;
        });

        // Win check (flag)
        const mr2: Rect = { x: m.x, y: m.y, w: m.w, h: m.h };
        if (aabb(mr2, flag)) {
          setWon(true);
          setPaused(true);
          setMessage('You Win! 🎉');
        }

        // Camera follow
        const targetCam = clamp(m.x - VIEW_W * 0.38, 0, WORLD_W - VIEW_W);
        setCamX(targetCam);
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = 0;
    };
  }, [paused, won, life, blocks, flag]);

  useEffect(() => {
    if (life <= 0) {
      setPaused(true);
      setMessage('Game Over 💀');
    }
  }, [life]);

  const marioStyle: React.CSSProperties = {
    transform: `translate(${mario.current.x}px, ${mario.current.y}px)`,
  };

  return (
    <div className="wrap">
      <div className="hud">
        <div>
          <strong>Life:</strong> {life} &nbsp; <strong>Coin:</strong> {coin} &nbsp; <strong>Score:</strong> {score}
          &nbsp; <strong>State:</strong> {big ? 'Big' : 'Small'}
        </div>
        <div>
          <span>Controls:</span> <kbd>←</kbd><kbd>→</kbd> move &nbsp; <kbd>Space</kbd> jump &nbsp; <kbd>↓</kbd> crouch
          &nbsp; <kbd>Enter</kbd> start &nbsp; <kbd>P</kbd> pause
        </div>
      </div>

      <div className="game" onClick={() => paused && life > 0 && !won && (setPaused(false), setMessage(''))}>
        <div className="world" style={{ transform: `translateX(${-camX}px)` }}>
          {/* Ground */}
          <div className="ground" />

          {/* Blocks */}
          {blocks.map((b, i) => (
            <div key={i} className="block" style={{ left: b.x, top: b.y }} />
          ))}

          {/* Coins */}
          {coins.map((c, i) => (
            <div key={i} className="coin" style={{ left: c.x, top: c.y }} />
          ))}

          {/* Mushrooms */}
          {mushrooms.map((m, i) => (
            <div key={i} className="mushroom" style={{ left: m.x, top: m.y }} />
          ))}

          {/* Enemies */}
          {enemies.filter(e => e.alive).map((e, i) => (
            <div key={i} className="enemy" style={{ left: e.r.x, top: e.r.y }} />
          ))}

          {/* Flag */}
          <div className="flag" style={{ left: flag.x, top: flag.y }} />

          {/* Mario */}
          <div
            className={[
              'mario',
              big ? 'big' : '',
              mario.current.crouch ? 'crouch' : '',
            ].join(' ')}
            style={marioStyle}
          >
            <div className="cap" />
            <div className="head" />
            <div className="body" />
            <div className="legs" />
          </div>
        </div>

        {paused && (
          <div className="overlay">
            <div className="panel">
              <h1>
                {message === 'Start'
                  ? 'Mario CSS Demo'
                  : message}
              </h1>
              <p>Enter дарж эхлүүлнэ (эсвэл тоглоом дээр click).</p>
              <p>Дайсан дээрээс үсэрвэл устгана. Хажуу талаас мөргөлдвөл life хасна.</p>
              <p>🍄 Mushroom авбал Big болно (1 удаа гэмтэл “сөрнө”). 🪙 Coin цуглуул.</p>
              <div className="btnrow">
                <button onClick={() => (setPaused(false), setMessage(''))} disabled={life <= 0 || won}>
                  {won ? 'Finished' : life <= 0 ? 'Dead' : 'Play'}
                </button>
                <button className="secondary" onClick={reset}>Reset</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}