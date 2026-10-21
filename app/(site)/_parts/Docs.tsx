/**
 * The documents in the film, as they look at one moment (a Frame). The live
 * stage renders them once and then updates the marked parts (data-*) on every
 * frame; the still pictures render them at their moment and leave them.
 *
 * Everything here describes an example company, Brightshelf Trading Ltd.
 */
import { CH_ROWS, CT_ROWS, NUMERIC_ROWS, SEARCH, money, type Frame } from "./film-model";

const Foot = ({ right }: { right: string }) => <div className="foot"><span>Example</span><span>{right}</span></div>;

export function Accounts() {
  const rows: [string, string, string?][] = [
    ["Fixed assets", "5,550"],
    ["Current assets", "38,410"],
    ["Creditors due within one year", "(14,960)"],
    ["Net current assets", "23,450"],
    ["Net assets", "29,000", "sum"],
    ["Called up share capital", "100", "gap"],
    ["Profit and loss account", "28,900"],
    ["Shareholders' funds", "29,000", "sum"],
  ];
  return (
    <div className="sheet">
      <div className="kind">Micro-entity accounts</div>
      <div className="title">Brightshelf Trading Ltd</div>
      <div className="sub">Balance sheet at 31 March 2025. Company number 15123456</div>
      <div className="rule" />
      {rows.map(([l, a, k]) => (
        <div key={l} className={`row${k ? ` ${k}` : ""}`}><span>{l}</span><span className="amt tag">{a}</span></div>
      ))}
      <div className="lines">
        <i style={{ width: "96%" }} /><i style={{ width: "88%" }} /><i style={{ width: "92%" }} /><i style={{ width: "54%" }} />
      </div>
      <Foot right="Page 2" />
    </div>
  );
}

export function Computation() {
  const rows: [string, string, string?][] = [
    ["Profit before tax", "27,400"],
    ["Add back depreciation", "900"],
    ["Add back entertaining", "380"],
    ["Less bank interest", "(140)"],
    ["Less capital allowances", "(1,850)"],
    ["Trading profit", "26,690", "sum"],
    ["Bank interest", "140", "gap"],
    ["Profits chargeable", "26,830", "sum"],
  ];
  return (
    <div className="sheet">
      <div className="kind">Tax computation</div>
      <div className="title">Corporation Tax computation</div>
      <div className="sub">Year ended 31 March 2025</div>
      <div className="rule" />
      {rows.map(([l, a, k]) => (
        <div key={l} className={`row${k ? ` ${k}` : ""}`}><span>{l}</span><span className="amt tag">{a}</span></div>
      ))}
      <div className="row gap"><span><span className="hl">Corporation Tax at 19%</span></span><span className="amt tag">5,097.70</span></div>
      <div className="lines"><i style={{ width: "90%" }} /><i style={{ width: "70%" }} /></div>
      <Foot right="Page 1" />
    </div>
  );
}

export function Seal({ f }: { f: Frame }) {
  return (
    <div className="seal" data-seal style={{ position: "absolute", right: 14, top: 14, opacity: f.seal.o, transform: `scale(${f.seal.s}) rotate(-12deg)` }}>
      <svg viewBox="0 0 132 132">
        <defs><path id="sealring" d="M66 66 m-46 0 a46 46 0 1 1 92 0 a46 46 0 1 1 -92 0" /></defs>
        <circle cx="66" cy="66" r="62" fill="rgba(252,60,23,.08)" stroke="#FC3C17" strokeWidth="2.5" />
        <circle cx="66" cy="66" r="34" fill="none" stroke="#FC3C17" strokeWidth="1.5" />
        <text fill="#D9300D" fontSize="10.5" fontWeight="700" letterSpacing="1.6" fontFamily="Public Sans, sans-serif">
          <textPath href="#sealring" startOffset="0">SIGNED FOR HMRC WITH AN IRMARK</textPath>
        </text>
        <text x="66" y="63" textAnchor="middle" fill="#D9300D" fontSize="15" fontWeight="800" fontFamily="Public Sans, sans-serif">IRmark</text>
        <text x="66" y="79" textAnchor="middle" fill="#D9300D" fontSize="9.5" fontWeight="600" fontFamily="Public Sans, sans-serif">sealed</text>
      </svg>
    </div>
  );
}

export function Ct600({ f }: { f: Frame }) {
  return (
    <div className="sheet">
      <div className="kind">Company Tax Return</div>
      <div className="title">CT600 (2024) Version 3</div>
      <div className="sub">Brightshelf Trading Ltd. Company number 15123456</div>
      <div className="rule" />
      {CT_ROWS.map((r, i) => {
        const n = NUMERIC_ROWS.indexOf(i);
        return (
          <div key={r.box} className={`row box${r.sum ? " sum" : ""}`}>
            <span className="bx">{r.box}</span>
            <span>{r.label}</span>
            <span className="amt" data-amt={n >= 0 ? n : undefined}>{r.text ?? money((r.v ?? 0) * (f.fills[n] ?? 1), r.pence)}</span>
          </div>
        );
      })}
      <Seal f={f} />
      <Foot right="Page 1 of 1" />
    </div>
  );
}

export function Approval({ f }: { f: Frame }) {
  return (
    <div className="sheet">
      <div className="kind">Approval pack</div>
      <div className="title">For the directors of Brightshelf Trading Ltd</div>
      <div className="sub">Read the accounts and the return, then sign below.</div>
      <div className="due">
        <div><b>£5,097.70</b><span>Corporation Tax</span></div>
        <div><b>1 Jan 2026</b><span>Pay by</span></div>
      </div>
      <div className="row gap"><span>Return due</span><span className="amt">31 March 2026</span></div>
      <div className="row"><span>Accounts to Companies House</span><span className="amt">31 Dec 2025</span></div>
      <div className="lines"><i style={{ width: "94%" }} /><i style={{ width: "86%" }} /><i style={{ width: "62%" }} /></div>
      <div className="sign">
        <svg viewBox="0 0 220 46" aria-hidden>
          <path data-sig pathLength={1} strokeDasharray="1" strokeDashoffset={1 - f.sign}
            d="M8 32 C 16 8, 26 40, 34 24 S 46 10, 52 28 S 64 40, 72 20 C 76 10, 84 36, 94 28 S 112 12, 120 30 C 126 42, 138 16, 150 24 S 170 30, 182 20 L 206 22" />
        </svg>
        <div className="who"><span>Priya Shah, Director</span><span>Date</span></div>
      </div>
      <Foot right="Page 1 of 9" />
    </div>
  );
}

export function CompaniesHouse({ f }: { f: Frame }) {
  return (
    <div className="card3d" style={{ width: 400, height: 330, boxSizing: "border-box" }}>
      <div className="top">Companies House search</div>
      <div className="search"><span data-typed>{SEARCH.slice(0, f.typed)}</span><span className="caret" /></div>
      <div className="hit" data-hit style={{ opacity: f.hit }}>
        <b>BRIGHTSHELF TRADING LTD</b>
        <span>15123456, active</span>
      </div>
      <dl>
        {CH_ROWS.map(([k, v], n) => (
          <div key={k} data-chrow={n} style={{ display: "contents" }}>
            <dt style={{ opacity: f.chRows[n] }}>{k}</dt>
            <dd style={{ opacity: f.chRows[n] }}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Receipt() {
  return (
    <div className="card3d receipt" style={{ width: 400, height: 220, boxSizing: "border-box" }}>
      <div className="accepted"><i aria-hidden />Accepted by HMRC</div>
      <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Example receipt, kept with the return</div>
      <dl>
        <dt>Correlation ID</dt><dd>C91E5A0B2D4F47E8A6B3D1F0E9C2A754</dd>
        <dt>IRmark</dt><dd>kd8+Qe1VvL9m0Zs3hTq7RcWx2Yo=</dd>
        <dt>Received</dt><dd>14:32, 18 March 2026</dd>
      </dl>
    </div>
  );
}
