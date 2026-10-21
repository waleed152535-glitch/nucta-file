/**
 * A practice's dashboard as it looks in Nucta File, with example clients.
 * A picture, not the real thing: it isn't interactive.
 */
const ROWS: { co: string; what: string; when: string; state: "late" | "soon" | "wait" | "done"; label: string }[] = [
  { co: "Kestrel Logistics Ltd", what: "Accounts to Companies House", when: "30 Sep 2026", state: "late", label: "21 days overdue" },
  { co: "Larkspur Home Ltd", what: "Corporation Tax to pay", when: "1 Nov 2026", state: "soon", label: "Due in 11 days" },
  { co: "Fernhill Studio Ltd", what: "Company Tax Return", when: "30 Nov 2026", state: "soon", label: "Due in 40 days" },
  { co: "Oakmere Holdings Ltd", what: "Dormant accounts", when: "28 Feb 2027", state: "wait", label: "Not started" },
  { co: "Brightshelf Trading Ltd", what: "Company Tax Return", when: "31 Mar 2026", state: "done", label: "Filed with HMRC" },
  { co: "Marlow and Finch Ltd", what: "Company Tax Return", when: "31 Jan 2027", state: "wait", label: "Draft" },
];

export default function DashPreview() {
  return (
    <div className="dash-wrap" role="img" aria-label="Nucta File's dashboard for a practice: six example clients, one overdue, two due soon, one filed.">
      <div className="dash" aria-hidden>
        <div className="bar"><i /><i /><i /></div>
        <div className="body">
          <div className="d-side">
            <b>Nucta File</b>
            <span className="on">Dashboard</span>
            <span>Companies and returns</span>
            <span>Your account</span>
          </div>
          <div className="d-main">
            <div className="d-stats">
              <div><small>Companies</small><b>62</b></div>
              <div className="bad"><small>Overdue</small><b>1</b></div>
              <div><small>Due in 30 days</small><b>7</b></div>
            </div>
            {ROWS.map((r) => (
              <div className="row" key={r.co + r.what}>
                <span className="co">{r.co}<small>{r.what}</small></span>
                <span className="when">{r.when}</span>
                <span className={`pill ${r.state}`}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
