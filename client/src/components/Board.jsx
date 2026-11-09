import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  COLORS, PATH, LANES, START, BASE_SPOTS, FINISH_XY, HOME_TRIANGLES, layoutTokens,
} from '../ludoLayout';
import BoardBackground from './BoardBackground';
const RADIUS = 0.36;
const MOVE_STEP_MS = 250;
const HOME_FX_MS = 1500;
const CONFETTI = 16;
const GOLD = '#fbbf24';

function playArcadeCaptureImpact(context) {
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.7, now);
  master.connect(context.destination);

  const blip = context.createOscillator();
  const blipGain = context.createGain();
  blip.type = 'square';
  blip.frequency.setValueAtTime(740, now);
  blip.frequency.exponentialRampToValueAtTime(260, now + 0.075);
  blipGain.gain.setValueAtTime(0.18, now);
  blipGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  blip.connect(blipGain).connect(master);
  blip.start(now);
  blip.stop(now + 0.085);

  const impact = context.createOscillator();
  const impactGain = context.createGain();
  impact.type = 'sine';
  impact.frequency.setValueAtTime(180, now);
  impact.frequency.exponentialRampToValueAtTime(48, now + 0.19);
  impactGain.gain.setValueAtTime(0.65, now);
  impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  impact.connect(impactGain).connect(master);
  impact.start(now);
  impact.stop(now + 0.21);

  const frameCount = Math.floor(context.sampleRate * 0.12);
  const noiseBuffer = context.createBuffer(1, frameCount, context.sampleRate);
  const noise = noiseBuffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    noise[i] = Math.random() * 2 - 1;
  }
  const noiseSource = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noiseSource.buffer = noiseBuffer;
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(900, now);
  noiseGain.gain.setValueAtTime(0.22, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  noiseSource.connect(filter).connect(noiseGain).connect(master);
  noiseSource.start(now);
  noiseSource.stop(now + 0.125);
}

// Centre of each colour's triangle (where the home celebration bursts from)
const centroid = (points) => {
  const pts = points.split(' ').map((p) => p.split(',').map(Number));
  return [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ];
};
// A token that reached the middle square of the board is home
const isHome = (t) => t.x > 6.05 && t.x < 8.95 && t.y > 6.05 && t.y < 8.95;

function squareCenter(color, position) {
  if (position <= 51) {
    const [row, column] = PATH[(START[color] + position) % 52];
    return [column + 0.5, row + 0.5];
  }
  if (position <= 56) {
    const [row, column] = LANES[color][position - 52];
    return [column + 0.5, row + 0.5];
  }
  return FINISH_XY[color];
}

function getMovePositions(from, to, captures) {
  const positions = [from];
  let position = from;
  while (position !== to && positions.length <= 60) {
    if (captures > 0 && position === 50 && to > 51) position = 52;
    else if (position >= 0 && to > position) position += 1;
    else if (position >= 46 && to < 6) position = (position + 1) % 52;
    else position = to;
    positions.push(position);
  }
  return positions;
}

export default function Board({
  tokens, captures = {}, lastMove, celebrateWinner, turn, myColor, rotation = 0, movable, diceOptions, rollId, onMove, soundMuted,
}) {
  const [kill, setKill] = useState(null);
  const [announce, setAnnounce] = useState(null);
  const [pendingCapture, setPendingCapture] = useState(null);
  const [captureIndex, setCaptureIndex] = useState(0);
  const [choiceTokenId, setChoiceTokenId] = useState(null);
  const [homeFx, setHomeFx] = useState([]);
  const previousTokens = useRef(tokens);
  const lastMoveId = useRef(lastMove?.id);
  const lastAnimatedMoveId = useRef(lastMove?.id);
  const killTimer = useRef(null);
  const captureRun = useRef(null);
  const homedRef = useRef(null);
  const homeTimer = useRef(null);
  const moveAudio = useRef(null);
  const captureAudio = useRef(null);
  const captureContext = useRef(null);
  const captureAudioUnlocked = useRef(false);
  const captureAudioUnlocking = useRef(false);
  const victoryAudio = useRef(null);
  const victoryAudioUnlocked = useRef(false);
  const victoryAudioUnlocking = useRef(false);
  const playedWinner = useRef(null);
  const moveSoundPosition = useRef(lastMove?.id);
  const tokenElements = useRef(new Map());

  useEffect(() => {
    // CC0 sound: "Woodblock-soft.wav" by hollandm.
    moveAudio.current = new Audio('/sounds/piece-move.mp3');
    moveAudio.current.preload = 'auto';
    moveAudio.current.volume = 0.14;
    moveAudio.current.playbackRate = 0.9;
    // CC0 sound: "LowHit_01.wav" by Faulkin.
    captureAudio.current = new Audio('/sounds/capture-hit.mp3');
    captureAudio.current.preload = 'auto';
    captureAudio.current.volume = 0.65;
    captureAudio.current.playbackRate = 1.15;
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (AudioContextConstructor) captureContext.current = new AudioContextConstructor();
    // CC0 sound: "Game Success Fanfare Short" by el_boss.
    victoryAudio.current = new Audio('/sounds/victory-fanfare.mp3');
    victoryAudio.current.preload = 'auto';
    victoryAudio.current.volume = 0.45;
    return () => {
      moveAudio.current?.pause();
      captureAudio.current?.pause();
      victoryAudio.current?.pause();
      captureContext.current?.close();
      moveAudio.current = null;
      captureAudio.current = null;
      captureContext.current = null;
      victoryAudio.current = null;
    };
  }, []);

  useEffect(() => {
    if (soundMuted) return;
    const unlockAudio = (audio, unlocked, unlocking) => {
      if (!audio || unlocked.current || unlocking.current) return;
      unlocking.current = true;
      audio.muted = true;
      audio.currentTime = 0;
      audio.play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          unlocked.current = true;
          unlocking.current = false;
        })
        .catch((error) => {
          audio.muted = false;
          unlocking.current = false;
          console.warn('Could not unlock game sound:', error);
        });
    };
    const unlockGameAudio = () => {
      if (captureContext.current?.state === 'suspended') {
        captureContext.current.resume().catch((error) => {
          console.warn('Could not unlock arcade capture sound:', error);
        });
      }
      unlockAudio(captureAudio.current, captureAudioUnlocked, captureAudioUnlocking);
      unlockAudio(victoryAudio.current, victoryAudioUnlocked, victoryAudioUnlocking);
      if (captureAudioUnlocked.current && victoryAudioUnlocked.current) {
        document.removeEventListener('pointerdown', unlockGameAudio);
      }
    };

    document.addEventListener('pointerdown', unlockGameAudio);
    return () => document.removeEventListener('pointerdown', unlockGameAudio);
  }, [soundMuted]);

  useEffect(() => {
    if (soundMuted || !kill?.sequence || !captureAudio.current) return;
    if (captureContext.current?.state === 'running') {
      playArcadeCaptureImpact(captureContext.current);
      return;
    }
    captureAudio.current.currentTime = 0;
    captureAudio.current.play().catch((error) => {
      console.warn('Could not play capture sound:', error);
    });
  }, [kill?.sequence, soundMuted]);

  useEffect(() => {
    if (soundMuted || !celebrateWinner || playedWinner.current === celebrateWinner || !victoryAudio.current) return;
    playedWinner.current = celebrateWinner;
    victoryAudio.current.currentTime = 0;
    victoryAudio.current.play().catch((error) => {
      console.warn('Could not play victory fanfare:', error);
    });
  }, [celebrateWinner, soundMuted]);

  useEffect(() => {
    if (soundMuted || !lastMove?.id) return;
    if (moveSoundPosition.current === lastMove.id) return;
    moveSoundPosition.current = lastMove.id;
    const audio = moveAudio.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch((error) => {
      console.warn('Could not play token move sound:', error);
    });
  }, [lastMove, soundMuted]);

  useEffect(() => {
    if (!soundMuted) return;
    moveAudio.current?.pause();
    captureAudio.current?.pause();
    victoryAudio.current?.pause();
  }, [soundMuted]);

  useLayoutEffect(() => {
    const movingToken = lastMove?.color && Number.isInteger(lastMove.tokenIdx)
      ? `${lastMove.color}-${lastMove.tokenIdx}`
      : null;
    const from = movingToken ? previousTokens.current[lastMove.color]?.[lastMove.tokenIdx] : null;
    const to = movingToken ? tokens[lastMove.color]?.[lastMove.tokenIdx] : null;

    if (
      movingToken
      && lastMove.id !== lastAnimatedMoveId.current
      && from >= 0
      && to >= 0
      && from !== to
    ) {
      lastAnimatedMoveId.current = lastMove.id;
      const element = tokenElements.current.get(movingToken);
      if (element?.animate) {
        const positions = getMovePositions(from, to, captures[lastMove.color] || 0);
        const start = layoutTokens(previousTokens.current).find(
          (token) => `${token.color}-${token.idx}` === movingToken
        );
        const end = layoutTokens(tokens).find(
          (token) => `${token.color}-${token.idx}` === movingToken
        );
        const keyframes = [
          { transform: `translate(${start.x}px, ${start.y}px)` },
          ...positions.slice(1, -1).map((position) => {
            const [x, y] = squareCenter(lastMove.color, position);
            return { transform: `translate(${x}px, ${y}px)` };
          }),
          { transform: `translate(${end.x}px, ${end.y}px)` },
        ];
        element.animate(keyframes, {
          duration: (positions.length - 1) * MOVE_STEP_MS,
          easing: 'linear',
        });
      }
    } else if (lastMove?.id != null) {
      lastAnimatedMoveId.current = lastMove.id;
    }

  }, [tokens, captures, lastMove]);

  useLayoutEffect(() => {
    if (lastMove?.id != null && lastMove.id !== lastMoveId.current) {
      lastMoveId.current = lastMove.id;
      const captures = lastMove.captured || [];
      if (captures.length) {
        clearTimeout(killTimer.current);
        captureRun.current = null;
        const captureItems = captures.map((captured, index) => {
          const before = Object.fromEntries(
            Object.entries(previousTokens.current).map(([color, positions]) => [color, [...positions]])
          );
          before[captured.color][captured.tokenIdx] =
            captured.pos ?? before[captured.color][captured.tokenIdx];
          const token = layoutTokens(before).find(
            (item) => item.color === captured.color && item.idx === captured.tokenIdx
          );
          if (!token) return null;
          const [homeX, homeY] = BASE_SPOTS[captured.color][captured.tokenIdx];
          return {
            x: token.x,
            y: token.y,
            homeDx: homeX - token.x,
            homeDy: homeY - token.y,
            midDx: (homeX - token.x) / 2,
            midDy: (homeY - token.y) / 2 - 30,
            id: `${captured.color}-${captured.tokenIdx}`,
            sequence: `${lastMove.id}-${index}`,
          };
        }).filter(Boolean);

        if (captureItems.length) {
          const moveFrom = previousTokens.current[lastMove.color]?.[lastMove.tokenIdx];
          const moveTo = tokens[lastMove.color]?.[lastMove.tokenIdx];
          const movePositions = getMovePositions(
            moveFrom,
            moveTo,
            captures[lastMove.color] || 0
          );
          setPendingCapture({
            id: lastMove.id,
            killerColor: lastMove.color,
            killerTokenIdx: lastMove.tokenIdx,
            target: tokens[lastMove.color][lastMove.tokenIdx],
            captures: captureItems,
            moveDuration: (movePositions.length - 1) * MOVE_STEP_MS,
          });
          setCaptureIndex(0);
        }
      }
    }

    previousTokens.current = tokens;
  }, [tokens, lastMove]);

  useEffect(() => {
    if (!pendingCapture) return;

    if (captureRun.current?.id !== pendingCapture.id) {
      captureRun.current = { id: pendingCapture.id, started: false };
    }
    if (captureRun.current.started) return;

    captureRun.current.started = true;
    const showCapture = (index) => {
      const captured = pendingCapture.captures[index];
      if (!captured) {
        setKill(null);
        setAnnounce(null);
        setPendingCapture(null);
        setCaptureIndex(0);
        captureRun.current = null;
        return;
      }

      setCaptureIndex(index);
      setAnnounce({ x: captured.x, y: captured.y, sequence: captured.sequence });
      killTimer.current = setTimeout(() => {
        setKill({
          x: captured.x,
          y: captured.y,
          homeDx: captured.homeDx,
          homeDy: captured.homeDy,
          midDx: captured.midDx,
          midDy: captured.midDy,
          id: captured.id,
          by: `${pendingCapture.killerColor}-${pendingCapture.killerTokenIdx}`,
          sequence: captured.sequence,
        });
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const isMobile = window.matchMedia('(max-width: 600px)').matches;
        const animationDuration = prefersReducedMotion ? 450 : isMobile ? 480 : 750;
        killTimer.current = setTimeout(() => showCapture(index + 1), animationDuration);
      }, 220);
    };

    killTimer.current = setTimeout(showCapture, pendingCapture.moveDuration, 0);
  }, [pendingCapture]);

  // A token just landed in the centre: celebrate (not for tokens already home on first load)
  useEffect(() => {
    const now = new Set(
      layoutTokens(tokens).filter(isHome).map((t) => `${t.color}-${t.idx}`)
    );
    if (homedRef.current === null) {
      homedRef.current = now;
      return;
    }
    const fresh = [...now].filter((id) => !homedRef.current.has(id));
    homedRef.current = now;
    if (!fresh.length) return;
    const stamp = Date.now();
    setHomeFx(fresh.map((id) => {
      const [color, idx] = id.split('-');
      return { id, color, idx: Number(idx), seq: `${id}-${stamp}` };
    }));
    clearTimeout(homeTimer.current);
    homeTimer.current = setTimeout(() => setHomeFx([]), HOME_FX_MS);
  }, [tokens]);

  useEffect(
    () => () => {
      clearTimeout(killTimer.current);
      clearTimeout(homeTimer.current);
    },
    []
  );

  const items = layoutTokens(tokens);
  const choiceToken = choiceTokenId?.rollId === rollId
    ? items.find((item) => `${item.color}-${item.idx}` === choiceTokenId.id)
    : null;
  const choiceOptions = choiceToken
    ? diceOptions.filter((option) => option.moves.includes(choiceToken.idx))
    : [];

  return (
    <>
    <div className="board-orientation" style={{ '--board-rotation': `${rotation}deg` }}>
    <svg viewBox="0 0 15 15" className={`board${kill ? ' shake' : ''}${celebrateWinner ? ' win-shake' : ''}`}>
      <BoardBackground turn={turn} captures={captures} />

      {/* Tokens */}
      {items.map((t) => {
        const settled = true;
        const canMove = t.color === myColor && movable.includes(t.idx) && settled && !pendingCapture;
        const r = RADIUS * t.scale;
        const id = `${t.color}-${t.idx}`;
        const activeCapture = pendingCapture?.captures[captureIndex];
        const heldCapture = pendingCapture?.captures.find(
          (captured, index) => index >= captureIndex && captured.id === id
        );
        const isCaptured = activeCapture?.id === id && kill?.id === id;
        const isKiller = kill?.by === id;
        const isHoming = homeFx.some((fx) => fx.id === id);
        const isWinner = celebrateWinner === t.color && tokens[t.color][t.idx] === 57;
        return (
          <g
            key={t.color + t.idx}
            ref={(element) => {
              const tokenId = `${t.color}-${t.idx}`;
              if (element) tokenElements.current.set(tokenId, element);
              else tokenElements.current.delete(tokenId);
            }}
            className={`token${canMove ? ' movable' : ''}${isCaptured ? ' captured' : ''}${isKiller ? ' killer' : ''}${isHoming ? ' homing' : ''}${isWinner ? ' winner-token' : ''}`}
            style={{
              transform: `translate(${isCaptured ? kill.x : heldCapture ? heldCapture.x : t.x}px, ${isCaptured ? kill.y : heldCapture ? heldCapture.y : t.y}px)`,
              ...(isCaptured && {
                '--home-dx': `${kill.homeDx}px`,
                '--home-dy': `${kill.homeDy}px`,
                '--mid-dx': `${kill.midDx}px`,
                '--mid-dy': `${kill.midDy}px`,
              }),
            }}
            onClick={canMove ? () => {
              const options = diceOptions.filter((option) => option.moves.includes(t.idx));
              const hasDifferentValues = options.some((option) => option.value !== options[0].value);
              if (options.length > 1 && hasDifferentValues) {
                setChoiceTokenId({ id, rollId });
              } else if (options.length > 0) {
                onMove(t.idx, options[0].id);
              }
              else if (options.length === 1) onMove(t.idx, options[0].id);
            } : undefined}
          >
            {canMove && <circle r={0.7} fill="transparent" />}
            {canMove && (
              <circle className="ring" r={r + 0.17} fill="none" stroke="#111" strokeWidth="0.1" />
            )}
            <circle r={r} fill={COLORS[t.color]} stroke="#1f2937" strokeWidth="0.07" />
            <circle r={r * 0.45} fill="rgba(255,255,255,0.4)" />
          </g>
        );
      })}
      {choiceToken && movable.includes(choiceToken.idx) && choiceOptions.length > 0 && (() => {
        const width = 1.05;
        const gap = 0.12;
        const totalWidth = choiceOptions.length * width + (choiceOptions.length - 1) * gap;
        const x = Math.max(0.08, Math.min(15 - totalWidth - 0.08, choiceToken.x - totalWidth / 2));
        const y = choiceToken.y < 1.6 ? choiceToken.y + 0.65 : choiceToken.y - 1.25;
        return (
          <g className="token-dice-menu">
            {choiceOptions.map((option, index) => (
              <g
                key={option.id}
                role="button"
                tabIndex="0"
                aria-label={`Move this token ${option.value} spaces`}
                onClick={(event) => {
                  event.stopPropagation();
                  onMove(choiceToken.idx, option.id);
                  setChoiceTokenId(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onMove(choiceToken.idx, option.id);
                    setChoiceTokenId(null);
                  }
                }}
              >
                <rect
                  x={x + index * (width + gap)}
                  y={y}
                  width={width}
                  height="0.9"
                  rx="0.2"
                />
                <text
                  x={x + index * (width + gap) + width / 2}
                  y={y + 0.47}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {option.value}
                </text>
              </g>
            ))}
          </g>
        );
      })()}
      {kill && (
        <>
          <circle className="kill-burst red" cx={kill.x} cy={kill.y} r="0.45" />
          <circle className="kill-burst b2" cx={kill.x} cy={kill.y} r="0.45" />
          {Array.from({ length: 10 }, (_, i) => {
            const angle = (i / 10) * Math.PI * 2;
            const distance = 0.65 + (i % 3) * 0.24;
            const colors = ['#ef4444', '#b91c1c', '#f97316', '#fbbf24', '#fff'];
            return (
              <circle
                key={`${kill.sequence}-${i}`}
                className="kill-particle"
                cx={kill.x + Math.cos(angle) * distance}
                cy={kill.y + Math.sin(angle) * distance}
                r={i % 3 === 0 ? 0.13 : 0.09}
                fill={colors[i % colors.length]}
              />
            );
          })}
        </>
      )}
      {celebrateWinner && (
        <g className="winner-burst" pointerEvents="none">
          <circle cx="7.5" cy="7.5" r="0.55" />
          <circle cx="7.5" cy="7.5" r="0.55" />
          {Array.from({ length: 12 }, (_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            return (
              <line
                key={i}
                x1={7.5 + Math.cos(angle) * 0.9}
                y1={7.5 + Math.sin(angle) * 0.9}
                x2={7.5 + Math.cos(angle) * 1.8}
                y2={7.5 + Math.sin(angle) * 1.8}
              />
            );
          })}
        </g>
      )}

      {/* Home celebration: triangle flash, shock rings, confetti, HOME! text */}
      {homeFx.map((fx) => {
        const [cx, cy] = centroid(HOME_TRIANGLES[fx.color]);
        return (
          <g key={fx.seq} style={{ pointerEvents: 'none' }}>
            <polygon className="home-flash" points={HOME_TRIANGLES[fx.color]} />
            <g className="home-rays">
              {Array.from({ length: 12 }, (_, i) => {
                const angle = (i / 12) * Math.PI * 2;
                return (
                  <line
                    key={i}
                    x1={cx + Math.cos(angle) * 0.65}
                    y1={cy + Math.sin(angle) * 0.65}
                    x2={cx + Math.cos(angle) * 1.35}
                    y2={cy + Math.sin(angle) * 1.35}
                  />
                );
              })}
            </g>
            <circle className="home-ring" cx={cx} cy={cy} r="0.5" stroke={COLORS[fx.color]} />
            <circle className="home-ring r2" cx={cx} cy={cy} r="0.5" stroke={GOLD} />
            {Array.from({ length: CONFETTI }, (_, i) => {
              const angle = (i / CONFETTI) * Math.PI * 2;
              const dist = 2 + (i % 3) * 0.55;
              const fill = i % 3 === 0 ? GOLD : i % 3 === 1 ? COLORS[fx.color] : '#fff';
              const style = {
                '--dx': `${Math.cos(angle) * dist}px`,
                '--dy': `${Math.sin(angle) * dist}px`,
                '--rot': `${i * 70}deg`,
                animationDelay: `${(i % 4) * 30}ms`,
              };
              return i % 2 ? (
                <rect key={i} className="confetti" x={cx - 0.11} y={cy - 0.11} width="0.22" height="0.22" fill={fill} style={style} />
              ) : (
                <circle key={i} className="confetti" cx={cx} cy={cy} r="0.12" fill={fill} style={style} />
              );
            })}
            <text className="home-text" x="7.5" y="5.25" textAnchor="middle" fill={GOLD}>
              🎉 HOME! 🏆
            </text>
          </g>
        );
      })}
    </svg>
    </div>
    {announce && <div key={announce.sequence} className="kill-text" aria-hidden="true">KILL! 💥</div>}
    {celebrateWinner && <div key={celebrateWinner} className="winner-text" aria-hidden="true">WIN! 🏆💥</div>}
    </>
  );
}