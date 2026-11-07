import { useEffect, useRef, useState } from 'react';
import {
  COLORS, LIGHT, PATH, LANES, START, SAFE, BASE_SPOTS, layoutTokens,
} from '../ludoLayout';

const BLOCKS = [
  ['red', 0, 0],
  ['green', 9, 0],
  ['yellow', 9, 9],
  ['blue', 0, 9],
];
const TRIANGLES = {
  red: '6,6 6,9 7.5,7.5',
  green: '6,6 9,6 7.5,7.5',
  yellow: '9,6 9,9 7.5,7.5',
  blue: '6,9 9,9 7.5,7.5',
};
const RADIUS = 0.36;
const HOP_MS = 50;
const HOME_FX_MS = 1500;
const CONFETTI = 16;
const GOLD = '#fbbf24';

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

export default function Board({
  tokens, captures = {}, lastMove, celebrateWinner, turn, myColor, rotation = 0, movable, diceOptions, rollId, onMove,
}) {
  // `shown` follows `tokens` one square at a time, so tokens hop like in real Ludo
  const [shown, setShown] = useState(tokens);
  const [kill, setKill] = useState(null);
  const [announce, setAnnounce] = useState(null);
  const [pendingCapture, setPendingCapture] = useState(null);
  const [choiceTokenId, setChoiceTokenId] = useState(null);
  const [homeFx, setHomeFx] = useState([]);
  const previousTokens = useRef(tokens);
  const lastMoveId = useRef(lastMove?.id);
  const killTimer = useRef(null);
  const captureRun = useRef(null);
  const homedRef = useRef(null);
  const homeTimer = useRef(null);

  useEffect(() => {
    const id = setInterval(() => {
      setShown((cur) => {
        let changed = false;
        const next = {};
        for (const color of Object.keys(tokens)) {
          next[color] = (cur[color] || tokens[color]).map((p, i) => {
            const target = tokens[color][i];
            if (p === target) return p;
            changed = true;
            if (captures[color] > 0 && p === 50 && target > 51) return 52;
            if (p >= 0 && target > p) return p + 1; // hop forward one square
            if (p >= 46 && target < 6) return (p + 1) % 52;
            return target;                          // leaving base or captured: jump
          });
        }
        return changed ? next : cur;
      });
    }, HOP_MS);
    return () => clearInterval(id);
  }, [tokens, captures, lastMove]);

  useEffect(() => {
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
          setPendingCapture({
            id: lastMove.id,
            killerColor: lastMove.color,
            killerTokenIdx: lastMove.tokenIdx,
            target: tokens[lastMove.color][lastMove.tokenIdx],
            captures: captureItems,
          });
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
    if (shown[pendingCapture.killerColor]?.[pendingCapture.killerTokenIdx] !== pendingCapture.target) return;

    captureRun.current.started = true;
    const showCapture = (index) => {
      const captured = pendingCapture.captures[index];
      if (!captured) {
        setKill(null);
        setAnnounce(null);
        setPendingCapture(null);
        captureRun.current = null;
        return;
      }

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
        killTimer.current = setTimeout(() => showCapture(index + 1), 850);
      }, 220);
    };

    showCapture(0);
  }, [pendingCapture, shown]);

  // A token just landed in the centre: celebrate (not for tokens already home on first load)
  useEffect(() => {
    const now = new Set(
      layoutTokens(shown).filter(isHome).map((t) => `${t.color}-${t.idx}`)
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
  }, [shown]);

  useEffect(
    () => () => {
      clearTimeout(killTimer.current);
      clearTimeout(homeTimer.current);
    },
    []
  );

  const items = layoutTokens(shown);
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
      <rect width="15" height="15" fill="#fff" />

      {/* Home bases */}
      {BLOCKS.map(([color, x, y]) => (
        <g key={color}>
          <rect x={x} y={y} width="6" height="6" fill={COLORS[color]} />
          <rect x={x + 1} y={y + 1} width="4" height="4" rx="0.5" fill="#fff" />
          {BASE_SPOTS[color].map(([cx, cy], i) => (
            <circle
              key={i} cx={cx} cy={cy} r="0.55"
              fill={LIGHT[color]} stroke={COLORS[color]} strokeWidth="0.06"
            />
          ))}
          {turn === color && (
            <rect
              className="glow" x={x + 0.1} y={y + 0.1} width="5.8" height="5.8"
              fill="none" stroke="#fff" strokeWidth="0.22"
            />
          )}
        </g>
      ))}

      {/* Main track */}
      {PATH.map(([r, c], abs) => {
        const owner = Object.keys(START).find((k) => START[k] === abs);
        return (
          <g key={abs}>
            <rect
              x={c} y={r} width="1" height="1"
              fill={owner ? COLORS[owner] : '#fff'} stroke="#555" strokeWidth="0.04"
            />
            {SAFE.includes(abs) && (
              <text
                x={c + 0.5} y={r + 0.5} fontSize="0.8" textAnchor="middle"
                dominantBaseline="central" fill={owner ? '#fff' : '#9e9e9e'}
              >
                ★
              </text>
            )}
          </g>
        );
      })}

      {/* Home lanes */}
      {Object.entries(LANES).map(([color, cells]) =>
        cells.map(([r, c], i) => (
          <rect
            key={color + i} x={c} y={r} width="1" height="1"
            fill={COLORS[color]} stroke="#555" strokeWidth="0.04"
          />
        ))
      )}

      {/* Home-lane entry stays locked until this player captures an opponent token. */}
      {Object.keys(captures).filter((color) => captures[color] < 1).map((color) => {
        const [r, c] = LANES[color][0];
        return (
          <g
            key={`${color}-home-lock`}
            transform={`translate(${c + 0.5} ${r + 0.5}) scale(0.035) translate(-12 -12)`}
            pointerEvents="none"
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" fill="#3b2412" />
            <path d="m6 18 12-12" />
          </g>
        );
      })}

      {/* Center */}
      {Object.entries(TRIANGLES).map(([color, points]) => (
        <polygon key={color} points={points} fill={COLORS[color]} stroke="#555" strokeWidth="0.04" />
      ))}

      {/* Tokens */}
      {items.map((t) => {
        const settled = shown[t.color][t.idx] === tokens[t.color][t.idx];
        const canMove = t.color === myColor && movable.includes(t.idx) && settled && !pendingCapture;
        const r = RADIUS * t.scale;
        const id = `${t.color}-${t.idx}`;
        const isCaptured = kill?.id === id;
        const isKiller = kill?.by === id;
        const isHoming = homeFx.some((fx) => fx.id === id);
        const isWinner = celebrateWinner === t.color && tokens[t.color][t.idx] === 57;
        return (
          <g
            key={t.color + t.idx}
            className={`token${canMove ? ' movable' : ''}${isCaptured ? ' captured' : ''}${isKiller ? ' killer' : ''}${isHoming ? ' homing' : ''}${isWinner ? ' winner-token' : ''}`}
            style={{
              transform: `translate(${isCaptured ? kill.x : t.x}px, ${isCaptured ? kill.y : t.y}px)`,
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
          <circle className="kill-burst" cx={kill.x} cy={kill.y} r="0.45" />
          <circle className="kill-burst b2" cx={kill.x} cy={kill.y} r="0.45" />
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
        const [cx, cy] = centroid(TRIANGLES[fx.color]);
        return (
          <g key={fx.seq} style={{ pointerEvents: 'none' }}>
            <polygon className="home-flash" points={TRIANGLES[fx.color]} />
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