/**
 * Nucta File's mark: the N of Nucta made from one folded strip of paper —
 * two red stems, and the fold between them showing the paper's lighter back.
 *
 * `tone="light"` is for light backgrounds (emails, printed pages): a deeper
 * red and fold, so the diagonal still shows on white.
 */
const TONES = {
  dark: { stem: "#FC3C17", fold: "#FFB4A3" },
  light: { stem: "#E2340F", fold: "#FF9F87" },
} as const;

/**
 * `tone="theme"` follows the software's theme: the colours come from
 * --mark-stem and --mark-fold, which the light theme changes.
 */
export default function Mark({ size = 24, tone = "dark" }: { size?: number; tone?: keyof typeof TONES | "theme" }) {
  const c = tone === "theme" ? { stem: "var(--mark-stem)", fold: "var(--mark-fold)" } : TONES[tone];
  // Plain colours go in fill, which works everywhere; theme colours need style, as fill can't read a CSS variable.
  const paint = (v: string) => (tone === "theme" ? { style: { fill: v } } : { fill: v });
  return (
    <svg className="s-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <rect x="8" y="7" width="10" height="34" rx="2" {...paint(c.stem)} />
      <polygon points="8,7 18,7 40,41 30,41" {...paint(c.fold)} />
      <rect x="30" y="7" width="10" height="34" rx="2" {...paint(c.stem)} />
    </svg>
  );
}
