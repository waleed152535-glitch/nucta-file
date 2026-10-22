/** Nucta File's mark: a page with its corner turned, in Nucta red. */
export default function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg className="s-mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M5.5 1.5h8.6l6.4 6.4v12.6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-17a2 2 0 0 1 2-2z" fill="#FC3C17" />
      <path d="M14.1 1.5v4.4a2 2 0 0 0 2 2h4.4z" fill="#FFB4A3" />
      <rect x="6.6" y="11.2" width="8.6" height="1.8" rx=".9" fill="#fff" />
      <rect x="6.6" y="15.2" width="5.4" height="1.8" rx=".9" fill="#fff" opacity=".85" />
    </svg>
  );
}
