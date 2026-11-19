"use client";

/** Brings back the getting-started guide on the dashboard after it was hidden. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ShowGuide() {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem("nf_getting_started_hidden") === "1"); } catch { /* nothing to bring back */ } }, []);
  if (!hidden) return null;
  return (
    <button type="button" className="linkish" onClick={() => { try { localStorage.removeItem("nf_getting_started_hidden"); } catch { /* shown anyway */ } router.push("/dashboard"); }}>
      Show the getting-started guide again
    </button>
  );
}
