'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type Rect = { x: number; y: number; w: number; h: number };
type Enemy = { r: Rect; dir: 1 | -1; alive: boolean };

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

/** ---------- 3 LEVEL DATA ---------- */
type LevelData = {
  worldW: number;
  blocks: Rect[];
  coins: Rect[];
  mushrooms: Rect[];
  enemies: Enemy[];
  pits: { start: number; end: number }[];
  flag: Rect; // (w/h нь collision-д)
};

export default function Page() {
  // View
  const VIEW_W = 960;
  const VIEW_H = 540;
  const GROUND_H = 70;

  // Physics
  const GRAVITY = 2100;
  const MOVE = 520;
  const JUMP = 820;

  // Smooth feel
  const ACCEL = 5200;
  const FRICTION = 6200;
  const COYOTE = 0.09;
  const JUMPBUF = 0.10;

  const LEVELS: LevelData[] = useMemo(() => {
    const mkEnemy = (x: number, dir: 1 | -1 = -1): Enemy => ({
      r: { x, y: VIEW_H - GROUND_H - 28, w: 34, h: 28 },
      dir,
      alive: true
    });

    const level1W = 2600;
    const level2W = 2800;
    const level3W = 3000;

    const baseFlag = (worldW: number): Rect => ({
      x: worldW - 120,
      y: VIEW_H - GROUND_H - 180,
      w: 74,
      h: 180
    });

    return [
      {
        worldW: level1W,
        blocks: [
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
        coins: [
          { x: 280, y: 320, w: 24, h: 24 },
          { x: 360, y: 260, w: 24, h: 24 },
          { x: 440, y: 200, w: 24, h: 24 },
          { x: 740, y: 280, w: 24, h: 24 },
          { x: 1120, y: 240, w: 24, h: 24 },
          { x: 1980, y: 260, w: 24, h: 24 }
        ],
        mushrooms: [{ x: 860, y: VIEW_H - GROUND_H - 30, w: 30, h: 30 }],
        enemies: [mkEnemy(560), mkEnemy(1320), mkEnemy(1750)],
        pits: [{ start: 980, end: 1040 }],
        flag: baseFlag(level1W)
      },

      {
        worldW: level2W,
        blocks: [
          { x: 240, y: 350, w: 64, h: 44 },
          { x: 304, y: 350, w: 64, h: 44 },
          { x: 520, y: 300, w: 64, h: 44 },
          { x: 584, y: 260, w: 64, h: 44 },
          { x: 760, y: 320, w: 64, h: 44 },
          { x: 1100, y: 260, w: 64, h: 44 },
          { x: 1164, y: 260, w: 64, h: 44 },
          { x: 1520, y: 320, w: 64, h: 44 },
          { x: 1720, y: 280, w: 64, h: 44 },
          { x: 2100, y: 340, w: 64, h: 44 }
        ],
        coins: [
          { x: 260, y: 310, w: 24, h: 24 },
          { x: 540, y: 260, w: 24, h: 24 },
          { x: 604, y: 220, w: 24, h: 24 },
          { x: 1120, y: 220, w: 24, h: 24 },
          { x: 1540, y: 280, w: 24, h: 24 },
          { x: 2120, y: 300, w: 24, h: 24 }
        ],
        mushrooms: [{ x: 980, y: VIEW_H - GROUND_H - 30, w: 30, h: 30 }],
        enemies: [mkEnemy(420), mkEnemy(900), mkEnemy(1460), mkEnemy(1960)],
        pits: [{ start: 700, end: 780 }, { start: 1600, end: 1680 }],
        flag: baseFlag(level2W)
      },

      {
        worldW: level3W,
        blocks: [
          { x: 260, y: 330, w: 64, h: 44 },
          { x: 324, y: 330, w: 64, h: 44 },
          { x: 520, y: 290, w: 64, h: 44 },
          { x: 720, y: 250, w: 64, h: 44 },
          { x: 920, y: 320, w: 64, h: 44 },
          { x: 1180, y: 280, w: 64, h: 44 },
          { x: 1244, y: 280, w: 64, h: 44 },
          { x: 1600, y: 320, w: 64, h: 44 },
          { x: 2000, y: 300, w: 64, h: 44 },
          { x: 2320, y: 260, w: 64, h: 44 }
        ],
        coins: [
          { x: 280, y: 290, w: 24, h: 24 },
          { x: 540, y: 250, w: 24, h: 24 },
          { x: 740, y: 210, w: 24, h: 24 },
          { x: 940, y: 280, w: 24, h: 24 },
          { x: 2020, y: 260, w: 24, h: 24 },
          { x: 2340, y: 220, w: 24, h: 24 }
        ],
        mushrooms: [
          { x: 880, y: VIEW_H - GROUND_H - 30, w: 30, h: 30 },
          { x: 1800, y: VIEW_H - GROUND_H - 30, w: 30, h: 30 }
        ],
        enemies: [mkEnemy(460), mkEnemy(1040), mkEnemy(1520), mkEnemy(1860), mkEnemy(2220)],
        pits: [{ start: 600, end: 700 }, { start: 1400, end: 1500 }, { start: 2100, end: 2200 }],
        flag: baseFlag(level3W)
      }
    ];
  }, [VIEW_H, GROUND_H]);

  // Current level index (0..2)
  const [levelIndex, setLevelIndex] = useState(0);

  // Active level state
  const [worldW, setWorldW] = useState(LEVELS[0].worldW);
  const blocks = useRef<Rect[]>(LEVELS[0].blocks);
  const pits = useRef<{ start: number; end: number }[]>(LEVELS[0].pits);
  const flag = useRef<Rect>(LEVELS[0].flag);

  const [coins, setCoins] = useState<Rect[]>(LEVELS[0].coins);
  const [mushrooms, setMushrooms] = useState<Rect[]>(LEVELS[0].mushrooms);
  const [enemies, setEnemies] = useState<Enemy[]>(LEVELS[0].enemies);

  // Loop
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  const keys = useRef({ left: false, right: false, down: false });
  const coyoteRef = useRef(0);
  const jumpBufRef = useRef(0);

  // Audio
  const audioRef = useRef<ReturnType<typeof makeAudio> | null>(null);
  const [muted, setMuted] = useState(false);
  const ensureAudio = async () => {
    if (!audioRef.current) audioRef.current = makeAudio();
    audioRef.current.setMuted(muted);
    if (audioRef.current.ctx.state !== 'running') await audioRef.current.ctx.resume();
  };
  const sfx = (name: keyof ReturnType<typeof makeAudio>['sfx']) => {
    audioRef.current?.setMuted(muted);
    audioRef.current?.sfx[name]?.();
  };

  // UI state
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

  const loadLevel = (idx: number, keepStats: boolean) => {
    const lv = LEVELS[idx];
    setWorldW(lv.worldW);
    blocks.current = lv.blocks;
    pits.current = lv.pits;
    flag.current = lv.flag;

    setCoins(lv.coins);
    setMushrooms(lv.mushrooms);
    setEnemies(lv.enemies);

    // reset mario + camera
    mario.current.x = 60;
    mario.current.y = VIEW_H - GROUND_H - 44;
    mario.current.vx = 0;
    mario.current.vy = 0;
    mario.current.onGround = false;
    mario.current.crouch = false;
    coyoteRef.current = 0;
    jumpBufRef.current = 0;
    setCamX(0);

    setWon(false);
    setPaused(true);
    setMessage(`Level ${idx + 1}`);

    if (!keepStats) {
      setLife(3);
      setCoin(0);
      setScore(0);
      setBig(false);
    }
  };

  const resetAll = () => {
    setLevelIndex(0);
    loadLevel(0, false);
    setMessage('Start');
  };

  const hit = () => {
    sfx('hurt');
    if (big) {
      setBig(false);
      setScore((s) => Math.max(0, s - 50));
      return;
    }
    setLife((l) => l - 1);
    setScore((s) => Math.max(0, s - 100));

    // restart same level (keep stats except big already handled)
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
      if (e.code === 'Space') jumpBufRef.current = JUMPBUF;

      if (e.code === 'KeyP') setPaused((p) => !p);

      if (e.code === 'Enter' && paused) {
        ensureAudio().then(() => sfx('start')).catch(() => {});
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

        m.crouch = keys.current.down;

        if (m.onGround) coyoteRef.current = COYOTE;
        else coyoteRef.current = Math.max(0, coyoteRef.current - dt);

        jumpBufRef.current = Math.max(0, jumpBufRef.current - dt);

        // accel/friction
        let input = 0;
        if (keys.current.left) input -= 1;
        if (keys.current.right) input += 1;

        if (input !== 0) {
          const desired = input * MOVE;
          const diff = desired - m.vx;
          m.vx += clamp(diff, -ACCEL * dt, ACCEL * dt);
        } else {
          const diff = -m.vx;
          m.vx += clamp(diff, -FRICTION * dt, FRICTION * dt);
        }

        // jump (coyote + buffer)
        const canJump = (m.onGround || coyoteRef.current > 0) && jumpBufRef.current > 0;
        if (canJump) {
          sfx('jump');
          m.vy = -JUMP;
          m.onGround = false;
          coyoteRef.current = 0;
          jumpBufRef.current = 0;
        }

        // gravity
        m.vy += GRAVITY * dt;

        // integrate
        let nx = clamp(m.x + m.vx * dt, 0, worldW - m.w);
        let ny = m.y + m.vy * dt;

        // ground
        const groundY = VIEW_H - GROUND_H - m.h;
        if (ny >= groundY) {
          ny = groundY;
          m.vy = 0;
          m.onGround = true;
        } else {
          m.onGround = false;
        }

        // blocks
        const mRect: Rect = { x: nx, y: ny, w: m.w, h: m.h };
        for (const b of blocks.current) {
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
          mRect.x = nx;
          mRect.y = ny;
        }

        // pits
        const centerX = mRect.x + mRect.w / 2;
        const onPit = pits.current.some((p) => centerX > p.start && centerX < p.end);
        if (onPit && mRect.y >= groundY - 1) {
          m.onGround = false;
          m.vy += GRAVITY * dt;
          ny = m.y + m.vy * dt;
          if (ny > VIEW_H + 200) hit();
        }

        // apply
        m.x = nx;
        m.y = ny;

        // enemies update + collisions
        setEnemies((prev) => {
          const next = prev.map((e) => {
            if (!e.alive) return e;
            const speedE = 90;
            let ex = e.r.x + e.dir * speedE * dt;

            if (ex < 0) { ex = 0; e.dir = 1; }
            if (ex > worldW - e.r.w) { ex = worldW - e.r.w; e.dir = -1; }

            const eRect: Rect = { ...e.r, x: ex };
            for (const b of blocks.current) {
              if (aabb(eRect, b)) {
                e.dir = e.dir === 1 ? -1 : 1;
                ex = e.r.x;
                break;
              }
            }
            e.r = { ...e.r, x: ex };
            return { ...e };
          });

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

        // coins
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

        // mushrooms
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

        // flag / win => next level or finish
        const mr2: Rect = { x: m.x, y: m.y, w: m.w, h: m.h };
        if (aabb(mr2, flag.current)) {
          sfx('win');
          setWon(true);
          setPaused(true);

          const nextIdx = levelIndex + 1;
          if (nextIdx < 3) {
            setMessage(`Level ${levelIndex + 1} Clear! ➜ Level ${nextIdx + 1}`);
          } else {
            setMessage('All Levels Cleared! 🎉');
          }
        }

        // camera lerp
        const targetCam = clamp(m.x - VIEW_W * 0.38, 0, worldW - VIEW_W);
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
  }, [paused, won, life, muted, levelIndex, worldW, VIEW_W, COYOTE, JUMPBUF, ACCEL, FRICTION, GRAVITY, MOVE, JUMP]);

  useEffect(() => {
    if (life <= 0) {
      setPaused(true);
      setMessage('Game Over 💀');
    }
  }, [life]);

  // Mario visibility fix: left/top
  const marioStyle: React.CSSProperties = { left: mario.current.x, top: mario.current.y };

  const startByClick = async () => {
    try { await ensureAudio(); } catch {}
    if (paused && life > 0 && !won) {
      sfx('start');
      setPaused(false);
      setMessage('');
    }
  };

  const nextLevel = () => {
    const nextIdx = levelIndex + 1;
    if (nextIdx < 3) {
      setLevelIndex(nextIdx);
      loadLevel(nextIdx, true); // keep stats across levels
    } else {
      // finished all
      setMessage('All Levels Cleared! 🎉');
      setPaused(true);
    }
  };

  // initial load (only once)
  useEffect(() => {
    loadLevel(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="wrap">
      <div className="hud">
        <div>
          <strong>Level:</strong> {levelIndex + 1}/3 &nbsp;
          <strong>Life:</strong> {life} &nbsp;
          <strong>Coin:</strong> {coin} &nbsp;
          <strong>Score:</strong> {score} &nbsp;
          <strong>State:</strong> {big ? 'Big' : 'Small'}
        </div>

        <div className="right">
          <span>Controls:</span>
          <kbd>←</kbd><kbd>→</kbd> move &nbsp; <kbd>Space</kbd> jump &nbsp; <kbd>↓</kbd> crouch &nbsp; <kbd>Enter</kbd> start &nbsp; <kbd>P</kbd> pause
          <button
            className="secondary"
            onClick={async () => {
              try { await ensureAudio(); } catch {}
              setMuted((m) => !m);
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

          {blocks.current.map((b, i) => (
            <div key={`b-${i}`} className="block" style={{ left: b.x, top: b.y }} />
          ))}

          {coins.map((c, i) => (
            <div key={`c-${i}`} className="coin" style={{ left: c.x, top: c.y }} />
          ))}

          {mushrooms.map((m, i) => (
            <div key={`m-${i}`} className="mushroom" style={{ left: m.x, top: m.y }} />
          ))}

          {enemies.filter((e) => e.alive).map((e, i) => (
            <div key={`e-${i}`} className="enemy" style={{ left: e.r.x, top: e.r.y }} />
          ))}

          <div className="flag" style={{ left: flag.current.x, top: flag.current.y }} />

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
              <h1>{message === 'Start' ? 'Mario CSS Demo (3 Levels)' : message}</h1>
              <p>Enter дарж эхлүүлнэ (эсвэл тоглоом дээр click).</p>
              <p>Flag хүрвэл дараагийн level рүү шилжинэ (3 үе).</p>
              <p>🍄 Mushroom авбал Big болно (1 удаа гэмтлээс хамгаална). 🪙 Coin цуглуул.</p>

              <div className="btnrow">
                {!won && (
                  <button onClick={startByClick} disabled={life <= 0}>
                    {life <= 0 ? 'Dead' : 'Play'}
                  </button>
                )}

                {won && levelIndex < 2 && (
                  <button onClick={nextLevel}>Next Level</button>
                )}

                <button className="secondary" onClick={resetAll}>Reset All</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}