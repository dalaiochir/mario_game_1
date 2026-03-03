'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type Rect = { x: number; y: number; w: number; h: number };

function aabb(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** File-less SFX (WebAudio synth) */
function makeAudio() {
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.18;
  master.connect(ctx.destination);

  const beep = (freq: number, dur = 0.08, type: OscillatorType = 'square', gain = 0.9) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);

    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);

    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur);
  };

  const noise = (dur = 0.12, gain = 0.35) => {
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);

    src.connect(g);
    g.connect(master);
    src.start();
    src.stop(ctx.currentTime + dur);
  };

  return {
    ctx,
    setMuted(m: boolean) {
      master.gain.value = m ? 0 : 0.18;
    },
    sfx: {
      start() { beep(440, 0.08, 'triangle', 0.25); },
      jump() { beep(880, 0.07, 'square', 0.7); beep(1320, 0.05, 'square', 0.35); },
      coin() { beep(1046, 0.05, 'triangle', 0.55); beep(1568, 0.06, 'triangle', 0.35); },
      power() { beep(523, 0.08, 'sawtooth', 0.5); beep(784, 0.10, 'sawtooth', 0.35); },
      stomp() { beep(220, 0.07, 'square', 0.6); },
      hurt() { noise(0.14, 0.45); beep(110, 0.14, 'sawtooth', 0.25); },
      win() { beep(659, 0.10, 'triangle', 0.35); beep(784, 0.10, 'triangle', 0.35); beep(988, 0.14, 'triangle', 0.35); }
    }
  };
}

export default function Page() {
  // View/world
  const VIEW_W = 960;
  const VIEW_H = 540;
  const GROUND_H = 70;
  const WORLD_W = 2600;

  // Physics
  const GRAVITY = 2100;
  const MOVE = 520;
  const RUN = 760;
  const JUMP = 820;

  // Smooth feel
  const ACCEL = 5200;
  const FRICTION = 6200;
  const COYOTE = 0.09;
  const JUMPBUF = 0.10;

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  const keys = useRef({
    left: false,
    right: false,
    down: false
  });

  const coyoteRef = useRef(0);
  const jumpBufRef = useRef(0);

  // Audio
  const audioRef = useRef<ReturnType<typeof makeAudio> | null>(null);
  const [muted, setMuted] = useState(false);

  const ensureAudio = async () => {
    if (!audioRef.current) audioRef.current = makeAudio();
    audioRef.current.setMuted(muted);
    if (audioRef.current.ctx.state !== 'running') {
      await audioRef.current.ctx.resume();
    }
  };
  const sfx = (name: keyof ReturnType<typeof makeAudio>['sfx']) => {
    // audio autoplay policy: must be after user gesture at least once
    audioRef.current?.setMuted(muted);
    audioRef.current?.sfx[name]?.();
  };

  // Game state
  const [paused, setPaused] = useState(true);
  const [message, setMessage] = useState('Start');
  const [life, setLife] = useState(3);
  const [coin, setCoin] = useState(0);
  const [score, setScore] = useState(0);
  const [big, setBig] = useState(false);
  const [won, setWon] = useState(false);
  const [camX, setCamX] = useState(0);

  // Mario
  const mario = useRef({
    x: 60,
    y: VIEW_H - GROUND_H - 44,
    vx: 0,
    vy: 0,
    onGround: false,
    crouch: false,
    w: 34,
    h: 44
  });

  // Level
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
      { x: 1950, y: 300, w: 64, h: 44 }
    ],
    []
  );

  const [coins, setCoins] = useState<Rect[]>(() => [
    { x: 280, y: 320, w: 24, h: 24 },
    { x: 360, y: 260, w: 24, h: 24 },
    { x: 440, y: 200, w: 24, h: 24 },
    { x: 740, y: 280, w: 24, h: 24 },
    { x: 1120, y: 240, w: 24, h: 24 },
    { x: 1980, y: 260, w: 24, h: 24 }
  ]);

  const [mushrooms, setMushrooms] = useState<Rect[]>(() => [
    { x: 860, y: VIEW_H - GROUND_H - 30, w: 30, h: 30 }
  ]);

  const [enemies, setEnemies] = useState<{ r: Rect; dir: 1 | -1; alive: boolean }[]>(() => [
    { r: { x: 560, y: VIEW_H - GROUND_H - 28, w: 34, h: 28 }, dir: -1, alive: true },
    { r: { x: 1320, y: VIEW_H - GROUND_H - 28, w: 34, h: 28 }, dir: -1, alive: true },
    { r: { x: 1750, y: VIEW_H - GROUND_H - 28, w: 34, h: 28 }, dir: -1, alive: true }
  ]);

  const flag = useMemo<Rect>(() => ({ x: WORLD_W - 120, y: VIEW_H - GROUND_H - 180, w: 74, h: 180 }), [WORLD_W]);

  const reset = () => {
    mario.current = {
      x: 60,
      y: VIEW_H - GROUND_H - 44,
      vx: 0,
      vy: 0,
      onGround: false,
      crouch: false,
      w: 34,
      h: 44
    };
    coyoteRef.current = 0;
    jumpBufRef.current = 0;

    setCamX(0);
    setCoins([
      { x: 280, y: 320, w: 24, h: 24 },
      { x: 360, y: 260, w: 24, h: 24 },
      { x: 440, y: 200, w: 24, h: 24 },
      { x: 740, y: 280, w: 24, h: 24 },
      { x: 1120, y: 240, w: 24, h: 24 },
      { x: 1980, y: 260, w: 24, h: 24 }
    ]);
    setMushrooms([{ x: 860, y: VIEW_H - GROUND_H - 30, w: 30, h: 30 }]);
    setEnemies([
      { r: { x: 560, y: VIEW_H - GROUND_H - 28, w: 34, h: 28 }, dir: -1, alive: true },
      { r: { x: 1320, y: VIEW_H - GROUND_H - 28, w: 34, h: 28 }, dir: -1, alive: true },
      { r: { x: 1750, y: VIEW_H - GROUND_H - 28, w: 34, h: 28 }, dir: -1, alive: true }
    ]);
    setCoin(0);
    setScore(0);
    setBig(false);
    setWon(false);
    setLife(3);
    setMessage('Start');
    setPaused(true);
  };

  const hit = () => {
    // SFX (if audio already enabled)
    sfx('hurt');

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
    mario.current.onGround = false;
    setCamX(0);
  };

  // Input
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft') keys.current.left = true;
      if (e.code === 'ArrowRight') keys.current.right = true;
      if (e.code === 'ArrowDown') keys.current.down = true;

      if (e.code === 'Space') {
        // jump buffer (press slightly early)
        jumpBufRef.current = JUMPBUF;
      }

      if (e.code === 'KeyP') setPaused((p) => !p);

      if (e.code === 'Enter' && paused) {
        // user gesture -> enable audio here
        ensureAudio()
          .then(() => sfx('start'))
          .catch(() => {});
        setPaused(false);
        setMessage('');
      }
    };

    const up = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft') keys.current.left = false;
      if (e.code === 'ArrowRight') keys.current.right = false;
      if (e.code === 'ArrowDown') keys.current.down = false;
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [paused]);

  // Main loop
  useEffect(() => {
    const step = (t: number) => {
      if (!lastRef.current) lastRef.current = t;
      const dt = clamp((t - lastRef.current) / 1000, 0, 0.033);
      lastRef.current = t;

      if (!paused && !won && life > 0) {
        const m = mario.current;

        // Crouch (visual)
        m.crouch = keys.current.down;

        // Ground/coyote bookkeeping
        if (m.onGround) coyoteRef.current = COYOTE;
        else coyoteRef.current = Math.max(0, coyoteRef.current - dt);

        // Jump buffer countdown
        jumpBufRef.current = Math.max(0, jumpBufRef.current - dt);

        // Horizontal movement (accel + friction)
        const maxSpeed = (keys.current.left || keys.current.right) ? MOVE : 0;
        const maxRun = (keys.current.left || keys.current.right) ? RUN : 0;

        // simple run: hold Arrow + not needed extra key; keep it MOVE (optional)
        const topSpeed = (jumpBufRef.current > 0) ? maxRun : maxSpeed;

        let input = 0;
        if (keys.current.left) input -= 1;
        if (keys.current.right) input += 1;

        if (input !== 0) {
          const desired = input * (topSpeed || MOVE);
          const diff = desired - m.vx;
          const stepV = clamp(diff, -ACCEL * dt, ACCEL * dt);
          m.vx += stepV;
        } else {
          const diff = -m.vx;
          const stepV = clamp(diff, -FRICTION * dt, FRICTION * dt);
          m.vx += stepV;
        }

        // Jump (coyote + buffer)
        const canJump = (m.onGround || coyoteRef.current > 0) && jumpBufRef.current > 0;
        if (canJump) {
          sfx('jump');
          m.vy = -JUMP;
          m.onGround = false;
          coyoteRef.current = 0;
          jumpBufRef.current = 0;
        }

        // Gravity
        m.vy += GRAVITY * dt;

        // Integrate
        let nx = m.x + m.vx * dt;
        let ny = m.y + m.vy * dt;

        nx = clamp(nx, 0, WORLD_W - m.w);

        // Ground
        const groundY = VIEW_H - GROUND_H - m.h;
        if (ny >= groundY) {
          ny = groundY;
          m.vy = 0;
          m.onGround = true;
        } else {
          m.onGround = false;
        }

        // Block collisions (AABB resolve)
        const mRect: Rect = { x: nx, y: ny, w: m.w, h: m.h };
        for (const b of blocks) {
          if (!aabb(mRect, b)) continue;

          const dx1 = (b.x + b.w) - mRect.x;
          const dx2 = (mRect.x + mRect.w) - b.x;
          const dy1 = (b.y + b.h) - mRect.y;
          const dy2 = (mRect.y + mRect.h) - b.y;

          const minX = Math.min(dx1, dx2);
          const minY = Math.min(dy1, dy2);

          if (minX < minY) {
            if (dx1 < dx2) nx = b.x + b.w;
            else nx = b.x - mRect.w;
            m.vx = 0;
          } else {
            if (dy1 < dy2) {
              ny = b.y + b.h; // head hit
              m.vy = 0;
            } else {
              ny = b.y - mRect.h; // land
              m.vy = 0;
              m.onGround = true;
            }
          }
          mRect.x = nx; mRect.y = ny;
        }

        // Pit demo
        const pitStart = 980;
        const pitEnd = 1040;
        const centerX = mRect.x + mRect.w / 2;
        const onPit = centerX > pitStart && centerX < pitEnd;
        if (onPit && mRect.y >= groundY - 1) {
          // fall
          m.onGround = false;
          m.vy += GRAVITY * dt;
          ny = m.y + m.vy * dt;
          if (ny > VIEW_H + 200) hit();
        }

        // Apply
        m.x = nx;
        m.y = ny;

        // Enemies
        setEnemies((prev) => {
          const next = prev.map((e) => {
            if (!e.alive) return e;
            const speedE = 90;
            let ex = e.r.x + e.dir * speedE * dt;

            if (ex < 0) { ex = 0; e.dir = 1; }
            if (ex > WORLD_W - e.r.w) { ex = WORLD_W - e.r.w; e.dir = -1; }

            const eRect: Rect = { ...e.r, x: ex };
            for (const b of blocks) {
              if (aabb(eRect, b)) {
                e.dir = e.dir === 1 ? -1 : 1;
                ex = e.r.x;
                break;
              }
            }
            e.r = { ...e.r, x: ex };
            return { ...e };
          });

          // collision with Mario
          const mr: Rect = { x: m.x, y: m.y, w: m.w, h: m.h };
          const mrPrevY = m.y - m.vy * dt;

          let changed = false;
          for (const e of next) {
            if (!e.alive) continue;
            if (!aabb(mr, e.r)) continue;

            const wasAbove = mrPrevY + m.h <= e.r.y + 6;
            const falling = m.vy > 0;

            if (wasAbove && falling) {
              e.alive = false;
              changed = true;
              m.vy = -JUMP * 0.55;
              setScore((s) => s + 200);
              sfx('stomp');
            } else {
              hit();
            }
          }
          return changed ? [...next] : next;
        });

        // Coins
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
              if (nk >= 100) {
                setLife((l) => l + Math.floor(nk / 100));
                return nk % 100;
              }
              return nk;
            });
            setScore((s) => s + got * 50);
            sfx('coin');
          }
          return remain;
        });

        // Mushrooms
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
            sfx('power');
          }
          return remain;
        });

        // Win
        const mr2: Rect = { x: m.x, y: m.y, w: m.w, h: m.h };
        if (aabb(mr2, flag)) {
          setWon(true);
          setPaused(true);
          setMessage('You Win! 🎉');
          sfx('win');
        }

        // Smooth camera (frame-rate independent lerp)
        const targetCam = clamp(m.x - VIEW_W * 0.38, 0, WORLD_W - VIEW_W);
        setCamX((c) => c + (targetCam - c) * (1 - Math.pow(0.001, dt)));
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = 0;
    };
  }, [paused, won, life, blocks, flag, muted]);

  useEffect(() => {
    if (life <= 0) {
      setPaused(true);
      setMessage('Game Over 💀');
    }
  }, [life]);

  // IMPORTANT: Mario visibility fix => use left/top, NOT transform translate
  const marioStyle: React.CSSProperties = {
    left: mario.current.x,
    top: mario.current.y
  };

  const startByClick = async () => {
    try {
      await ensureAudio();
    } catch {}
    if (paused && life > 0 && !won) {
      sfx('start');
      setPaused(false);
      setMessage('');
    }
  };

  return (
    <div className="wrap">
      <div className="hud">
        <div>
          <strong>Life:</strong> {life} &nbsp; <strong>Coin:</strong> {coin} &nbsp; <strong>Score:</strong> {score}
          &nbsp; <strong>State:</strong> {big ? 'Big' : 'Small'}
        </div>
        <div className="right">
          <span>Controls:</span>
          <kbd>←</kbd><kbd>→</kbd> move &nbsp; <kbd>Space</kbd> jump &nbsp; <kbd>↓</kbd> crouch &nbsp; <kbd>Enter</kbd> start &nbsp; <kbd>P</kbd> pause
          <button
            className="secondary"
            onClick={async () => {
              try { await ensureAudio(); } catch {}
              setMuted((m) => !m);
              // apply instantly
              setTimeout(() => audioRef.current?.setMuted(!muted), 0);
            }}
          >
            {muted ? 'Unmute' : 'Mute'}
          </button>
        </div>
      </div>

      <div className="game" onClick={startByClick}>
        <div className="world" style={{ transform: `translateX(${-camX}px)` }}>
          <div className="ground" />

          {blocks.map((b, i) => (
            <div key={i} className="block" style={{ left: b.x, top: b.y }} />
          ))}

          {coins.map((c, i) => (
            <div key={i} className="coin" style={{ left: c.x, top: c.y }} />
          ))}

          {mushrooms.map((m, i) => (
            <div key={i} className="mushroom" style={{ left: m.x, top: m.y }} />
          ))}

          {enemies.filter((e) => e.alive).map((e, i) => (
            <div key={i} className="enemy" style={{ left: e.r.x, top: e.r.y }} />
          ))}

          <div className="flag" style={{ left: flag.x, top: flag.y }} />

          <div
            className={['mario', big ? 'big' : '', mario.current.crouch ? 'crouch' : ''].join(' ')}
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
              <h1>{message === 'Start' ? 'Mario CSS Demo' : message}</h1>
              <p>Enter дарж эхлүүлнэ (эсвэл тоглоом дээр click).</p>
              <p>Дайсан дээрээс үсэрвэл устгана. Хажуу талаас мөргөлдвөл life хасна.</p>
              <p>🍄 Mushroom авбал Big болно (1 удаа гэмтэл “сөрнө”). 🪙 Coin цуглуул.</p>
              <div className="btnrow">
                <button onClick={startByClick} disabled={life <= 0 || won}>
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