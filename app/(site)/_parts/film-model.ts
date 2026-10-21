/**
 * The home page's film: where each document stands at every point of the
 * scroll, and what is written on it. Pure data and arithmetic, so the server
 * can render any moment of it and the browser can play it.
 *
 * The world is a 1440 × 900 room. p runs from 0 (the opening shot) to 1 (HMRC's
 * receipt), and each actor has a pose at a few values of p; between them it
 * eases from one pose to the next.
 */

export interface Pose { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number; o: number; d: number }
type Key = [number, Partial<Pose>];

export const WORLD = { w: 1440, h: 900, focus: { x: 1010, y: 450 }, depth: 1900 };

export const SIZES: Record<ActorName, { w: number; h: number }> = {
  accounts: { w: 380, h: 500 },
  computation: { w: 380, h: 500 },
  ct600: { w: 380, h: 500 },
  approval: { w: 380, h: 500 },
  ch: { w: 400, h: 330 },
  receipt: { w: 400, h: 220 },
};
export type ActorName = "accounts" | "computation" | "ct600" | "approval" | "ch" | "receipt";
/** Back to front, so later actors are drawn over earlier ones. */
export const ACTORS: ActorName[] = ["approval", "accounts", "computation", "ct600", "ch", "receipt"];

/** When each part of the story happens. */
export const SCENES = {
  hero: [0, 0.08],
  ch1: [0.17, 0.33],
  ch2: [0.41, 0.57],
  ch3: [0.65, 0.77],
  ch4: [0.85, 1],
} as const;
/** Where the step rail jumps to: the middle of each chapter, once its animation has played. */
export const CHAPTER_AT = [0.3, 0.55, 0.75, 0.99];
const CHAPTER_SPANS: [number, number][] = [[0.13, 0.37], [0.37, 0.61], [0.61, 0.81], [0.81, 1]];

const K = (...keys: Key[]) => keys;
const KEYS: Record<ActorName, Key[]> = {
  ct600: K(
    [0, { x: 1150, y: 440, z: 60, rx: 6, ry: -22, rz: 3, s: 1, o: 1, d: 0 }],
    [0.08, {}],
    [0.17, { x: 1185, y: 470, z: -420, ry: -26, rz: 4, d: 0.62 }],
    [0.33, {}],
    [0.41, { x: 1010, y: 452, z: 150, rx: 2, ry: -8, rz: 0, s: 1.05, d: 0 }],
    [0.57, {}],
    [0.65, { x: 1050, y: 455, z: 40, rx: 4, ry: -6, rz: 1, s: 0.82 }],
    [0.77, {}],
    [0.85, { x: 1030, y: 470, z: 60, rx: 8, ry: -14, rz: -1, s: 0.92 }],
    [1, {}],
  ),
  computation: K(
    [0, { x: 1010, y: 456, z: -110, rx: 7, ry: -26, rz: -1.5, s: 1, o: 1, d: 0.12 }],
    [0.08, {}],
    [0.17, { x: 1050, y: 482, z: -520, ry: -30, d: 0.72 }],
    [0.33, {}],
    [0.41, { x: 800, y: 470, z: -260, rx: 4, ry: 14, rz: -3, d: 0.55 }],
    [0.57, {}],
    [0.65, { x: 905, y: 460, z: 0, rx: 4, ry: 10, rz: -1.5, s: 0.82, d: 0 }],
    [0.77, {}],
    [0.85, { x: 1020, y: 478, z: 40, rx: 8, ry: -14, rz: -2.5, s: 0.92, d: 0.12 }],
    [1, {}],
  ),
  accounts: K(
    [0, { x: 872, y: 476, z: -260, rx: 8, ry: -30, rz: -6, s: 1, o: 1, d: 0.26 }],
    [0.08, {}],
    [0.17, { x: 930, y: 500, z: -620, d: 0.78 }],
    [0.33, {}],
    [0.41, { x: 690, y: 490, z: -420, rx: 4, ry: 20, rz: -6, d: 0.72 }],
    [0.57, {}],
    [0.65, { x: 762, y: 468, z: -60, rx: 4, ry: 18, rz: -4, s: 0.82, d: 0 }],
    [0.77, {}],
    [0.85, { x: 1010, y: 486, z: 20, rx: 8, ry: -14, rz: -4, s: 0.92, d: 0.2 }],
    [1, {}],
  ),
  approval: K(
    [0, { x: 1300, y: 462, z: -300, rx: 4, ry: -24, rz: 3, s: 0.86, o: 0, d: 0 }],
    [0.57, {}],
    [0.65, { x: 1200, y: 462, z: -40, ry: -22, s: 0.82, o: 1 }],
    [0.77, {}],
    [0.85, { x: 1000, y: 494, z: 0, rx: 8, ry: -14, rz: -5.5, s: 0.92, d: 0.28 }],
    [1, {}],
  ),
  ch: K(
    [0, { x: 1040, y: 540, z: -200, rx: 10, ry: -14, rz: 0, s: 0.9, o: 0, d: 0 }],
    [0.1, {}],
    [0.17, { x: 1035, y: 440, z: 190, rx: 4, ry: -10, s: 1, o: 1 }],
    [0.33, {}],
    [0.41, { x: 1035, y: 290, z: 320, rx: -10, s: 0.96, o: 0 }],
    [1, {}],
  ),
  receipt: K(
    [0, { x: 1160, y: 720, z: 200, rx: 12, ry: -10, rz: 0, s: 0.94, o: 0, d: 0 }],
    [0.9, {}],
    [0.95, { x: 1185, y: 676, z: 250, rx: 4, ry: -10, s: 1, o: 1 }],
    [1, {}],
  ),
};

/** Every key filled in from the one before, so each names a whole pose. */
const FULL: Record<ActorName, [number, Pose][]> = Object.fromEntries(
  (Object.keys(KEYS) as ActorName[]).map((name) => {
    let last: Pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, o: 1, d: 0 };
    return [name, KEYS[name].map(([p, part]) => { last = { ...last, ...part }; return [p, last] as [number, Pose]; })];
  }),
) as Record<ActorName, [number, Pose][]>;

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const span = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const ease = (p: number, a: number, b: number) => smooth(span(p, a, b));

export function poseAt(name: ActorName, p: number): Pose {
  const keys = FULL[name];
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [p0, a] = keys[i], [p1, b] = keys[i + 1];
    if (p <= p1) {
      const t = smooth(span(p, p0, p1));
      const out = {} as Pose;
      for (const k of Object.keys(a) as (keyof Pose)[]) out[k] = a[k] + (b[k] - a[k]) * t;
      return out;
    }
  }
  return keys[keys.length - 1][1];
}

/** The CSS transform that puts an actor at its pose (x and y are its centre). */
export function poseCss(name: ActorName, q: Pose): string {
  const { w, h } = SIZES[name];
  return `translate3d(${(q.x - w / 2).toFixed(1)}px,${(q.y - h / 2).toFixed(1)}px,${q.z.toFixed(1)}px) rotateX(${q.rx.toFixed(2)}deg) rotateY(${q.ry.toFixed(2)}deg) rotateZ(${q.rz.toFixed(2)}deg) scale(${q.s.toFixed(3)})`;
}

/** The example company's CT600, box by box. Box numbers are HMRC's. */
export const CT_ROWS: { box: string; label: string; text?: string; v?: number; pence?: boolean; sum?: boolean }[] = [
  { box: "1", label: "Company name", text: "Brightshelf Trading Ltd" },
  { box: "30", label: "Period from", text: "1 April 2024" },
  { box: "35", label: "Period to", text: "31 March 2025" },
  { box: "145", label: "Turnover", v: 182400 },
  { box: "155", label: "Trading profits", v: 26690 },
  { box: "170", label: "Bank interest", v: 140 },
  { box: "235", label: "Profits before deductions", v: 26830 },
  { box: "315", label: "Profits chargeable", v: 26830 },
  { box: "345", label: "Tax at 19%", v: 5097.7, pence: true },
  { box: "430", label: "Corporation Tax", v: 5097.7, pence: true },
  { box: "475", label: "Net liability", v: 5097.7, pence: true },
  { box: "510", label: "Tax chargeable", v: 5097.7, pence: true, sum: true },
];
export const NUMERIC_ROWS = CT_ROWS.map((r, i) => (r.v != null ? i : -1)).filter((i) => i >= 0);

export const SEARCH = "Brightshelf";
export const CH_ROWS: [string, string][] = [
  ["Incorporated", "1 April 2019"],
  ["Year end", "31 March"],
  ["Accounts due", "31 December 2025"],
  ["Return due", "31 March 2026"],
  ["Registered office", "12 High Street, Leeds LS1 4AB"],
];

export const money = (v: number, pence = false) =>
  v.toLocaleString("en-GB", { minimumFractionDigits: pence ? 2 : 0, maximumFractionDigits: pence ? 2 : 0 });

/** Everything that changes on the stage, at one moment. */
export interface Frame {
  p: number;
  scene: number;
  actors: Record<ActorName, Pose>;
  /** How far each numeric CT600 box has filled, 0 to 1, in NUMERIC_ROWS order. */
  fills: number[];
  typed: number;
  hit: number;
  chRows: number[];
  sign: number;
  seal: { s: number; o: number };
  copy: { o: number; y: number }[];
  rail: { fill: number[]; current: number };
  cue: number;
}

export function frameAt(p: number): Frame {
  const actors = Object.fromEntries(ACTORS.map((a) => [a, poseAt(a, p)])) as Record<ActorName, Pose>;
  // The CT600 is shown complete in the opening shot, blank while Companies House
  // is consulted, and fills box by box in chapter two.
  const ch2 = span(p, SCENES.ch2[0], SCENES.ch2[1] - 0.02);
  const fills = NUMERIC_ROWS.map((_, n) => {
    if (p < 0.15) return 1;
    if (p < SCENES.ch2[0]) return 0;
    return smooth(span(ch2, n * 0.08, n * 0.08 + 0.3));
  });
  const ch1 = span(p, SCENES.ch1[0], SCENES.ch1[1] - 0.02);
  const typed = Math.round(span(ch1, 0, 0.35) * SEARCH.length);
  const hit = ease(ch1, 0.38, 0.48);
  const chRows = CH_ROWS.map((_, n) => ease(ch1, 0.5 + n * 0.09, 0.58 + n * 0.09));
  const sign = p >= SCENES.ch3[1] ? 1 : smooth(span(p, SCENES.ch3[0] + 0.01, SCENES.ch3[1] - 0.01));
  const stamp = span(p, 0.86, 0.895);
  const seal = { s: 1.9 - 0.9 * smooth(stamp), o: smooth(span(stamp, 0, 0.5)) };
  const scene = p < 0.13 ? 0 : p < 0.37 ? 1 : p < 0.61 ? 2 : p < 0.81 ? 3 : 4;

  const fade = (inA: number, inB: number, outA: number, outB: number) => {
    const i = ease(p, inA, inB), o = 1 - ease(p, outA, outB);
    const v = Math.min(i, o);
    return { o: v, y: (1 - i) * 26 - (1 - o) * 26 };
  };
  const copy = [
    { o: 1 - ease(p, 0.07, 0.13), y: -ease(p, 0.07, 0.13) * 30 },
    fade(0.14, 0.18, 0.33, 0.37),
    fade(0.38, 0.42, 0.57, 0.61),
    fade(0.62, 0.66, 0.77, 0.81),
    fade(0.82, 0.86, 2, 3),
  ];
  const fill = CHAPTER_SPANS.map(([a, b]) => span(p, a, b));
  const current = CHAPTER_SPANS.reduce((c, [a], i) => (p >= a ? i : c), -1);
  return { p, scene, actors, fills, typed, hit, chRows, sign, seal, copy, rail: { fill, current }, cue: 1 - ease(p, 0.015, 0.06) };
}

/** Where each still picture of the film is framed: centre and width of the view, in world units. */
export const STILLS: { p: number; cx: number; cy: number; w: number }[] = [
  { p: 0, cx: 1012, cy: 462, w: 760 },
  { p: 0.32, cx: 1040, cy: 448, w: 700 },
  { p: 0.57, cx: 930, cy: 462, w: 780 },
  { p: 0.77, cx: 985, cy: 466, w: 900 },
  { p: 1, cx: 1100, cy: 560, w: 780 },
];
