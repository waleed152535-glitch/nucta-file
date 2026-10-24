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

export default function Mark({ size = 24, tone = "dark" }: { size?: number; tone?: keyof typeof TONES }) {
  const c = TONES[tone];
  return (
    <svg className="s-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <rect x="8" y="7" width="10" height="34" rx="2" fill={c.stem} />
      <polygon points="8,7 18,7 40,41 30,41" fill={c.fold} />
      <rect x="30" y="7" width="10" height="34" rx="2" fill={c.stem} />
    </svg>
  );
}
