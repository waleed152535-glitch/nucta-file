/**
 * The company lookup: a plain form that opens the deadline checker, so it
 * works before any script has loaded.
 */
export default function CompanySearch({ q = "", label = "See your company's deadlines", id = "co-q", autoFocus = false }: { q?: string; label?: string; id?: string; autoFocus?: boolean }) {
  return (
    <form className="co-search" action="/check" method="get" role="search">
      <label htmlFor={id}>{label}</label>
      <div className="co-field">
        <svg viewBox="0 0 24 24" aria-hidden><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" /></svg>
        <input id={id} name="q" type="search" defaultValue={q} placeholder="Company name or number" autoComplete="off" spellCheck={false} required minLength={2} maxLength={120} autoFocus={autoFocus} enterKeyHint="search" />
        <button type="submit" className="s-btn">Check</button>
      </div>
    </form>
  );
}
