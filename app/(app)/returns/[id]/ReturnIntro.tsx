"use client";

/** A short note on how a return works, shown on a customer's returns until they close it. */
import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "nf_return_intro_seen";

export default function ReturnIntro() {
  const [show, setShow] = useState(false);
  useEffect(() => { try { setShow(localStorage.getItem(KEY) !== "1"); } catch { setShow(false); } }, []);
  if (!show) return null;
  const close = () => { try { localStorage.setItem(KEY, "1"); } catch { /* closed for this visit */ } setShow(false); };
  return (
    <div className="banner info" style={{ alignItems: "flex-start" }}>
      <span>i</span>
      <span style={{ flex: 1 }}>
        <b>How a return works.</b> Go through the nine steps above in order; each one saves as you go and says what&apos;s missing.
        The tax at the top updates as you type. On the last step you get the accounts, the computation and the CT600, and file with HMRC and Companies House.
        {" "}<Link href="/help#return">More about each step</Link>.
      </span>
      <button type="button" className="btn ghost sm" onClick={close}>Got it</button>
    </div>
  );
}
