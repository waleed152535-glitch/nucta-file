"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTables } from "./actions";

/** One button that sets up the log's tables through the app's own connection. */
export default function CreateTables() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  return (
    <div style={{ marginTop: 10 }}>
      <button
        className="btn"
        disabled={pending}
        onClick={() => start(async () => {
          const r = await createTables();
          setResult(r);
          if (r.ok) router.refresh();
        })}
      >
        {pending ? "Creating…" : "Create tables in this database"}
      </button>
      {result && (
        <div style={{ marginTop: 6, fontSize: 12.5 }}>{result.ok ? "✓ " : "✗ "}{result.message}</div>
      )}
    </div>
  );
}
