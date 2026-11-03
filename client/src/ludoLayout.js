export const COLORS = {
  red: '#e53935',
  green: '#43a047',
  yellow: '#fdd835',
  blue: '#1e88e5',
};
export const LIGHT = {
  red: '#ffcdd2',
  green: '#c8e6c9',
  yellow: '#fff59d',
  blue: '#bbdefb',
};

export const START = { red: 0, green: 13, yellow: 26, blue: 39 };
export const SAFE = [0, 8, 13, 21, 26, 34, 39, 47];

// The 52 main-track squares as [row, col], clockwise, starting at red's start square
export const PATH = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
];

// Home lane squares (engine positions 51-55) as [row, col]
export const LANES = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
};

// Where tokens sit while in base, as [x, y]
export const BASE_SPOTS = {
  red: [[2, 2], [4, 2], [2, 4], [4, 4]],
  green: [[11, 2], [13, 2], [11, 4], [13, 4]],
  yellow: [[11, 11], [13, 11], [11, 13], [13, 13]],
  blue: [[2, 11], [4, 11], [2, 13], [4, 13]],
};

// Where finished tokens sit (inside each color's center triangle)
const FINISH_XY = {
  red: [6.85, 7.5],
  green: [7.5, 6.85],
  yellow: [8.15, 7.5],
  blue: [7.5, 8.15],
};

// Turns { red: [pos x4], ... } into drawable tokens with x, y and size
export function layoutTokens(tokens) {
  const items = [];
  for (const color of Object.keys(tokens)) {
    tokens[color].forEach((pos, idx) => {
      let x, y;
      if (pos === -1) {
        [x, y] = BASE_SPOTS[color][idx];
      } else if (pos <= 50) {
        const [r, c] = PATH[(START[color] + pos) % 52];
        x = c + 0.5;
        y = r + 0.5;
      } else if (pos <= 55) {
        const [r, c] = LANES[color][pos - 51];
        x = c + 0.5;
        y = r + 0.5;
      } else {
        [x, y] = FINISH_XY[color];
      }
      items.push({ color, idx, pos, x, y, scale: pos === 56 ? 0.6 : 1 });
    });
  }

  // Spread tokens that share the same square so they don't hide each other
  const groups = {};
  items.forEach((t) => {
    (groups[`${t.x},${t.y}`] ||= []).push(t);
  });
  Object.values(groups).forEach((g) => {
    if (g.length < 2) return;
    g.forEach((t, i) => {
      if (t.pos === 56) {
        const offset = (i - (g.length - 1) / 2) * 0.24;
        if (t.color === 'red' || t.color === 'yellow') t.y += offset;
        else t.x += offset;
      } else {
        t.scale = 0.7;
        const a = (i / g.length) * Math.PI * 2;
        t.x += Math.cos(a) * 0.2;
        t.y += Math.sin(a) * 0.2;
      }
    });
  });
  return items;
}