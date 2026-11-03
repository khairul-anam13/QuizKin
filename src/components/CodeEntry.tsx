"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const LENGTH = 6;

export function CodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [going, setGoing] = useState(false);

  const go = (value: string) => {
    if (value.length !== LENGTH) return;
    setGoing(true);
    router.push(`/${value}`);
  };

  return (
    <form
      className="code-entry"
      onSubmit={(e) => {
        e.preventDefault();
        go(code);
      }}
    >
      <label className="code-cells">
        <span className="sr-only">Kode ruangan, 6 angka</span>
        <input
          className="code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={LENGTH}
          value={code}
          autoFocus
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(0, LENGTH);
            setCode(next);
            if (next.length === LENGTH) go(next);
          }}
        />
        {Array.from({ length: LENGTH }, (_, i) => (
          <span key={i} className="code-cell" data-filled={i < code.length} data-caret={i === code.length}>
            {code[i] ?? ""}
          </span>
        ))}
      </label>
      <button className="btn btn-primary btn-block" disabled={code.length !== LENGTH || going}>
        {going ? "Membuka ruangan…" : "Masuk"}
      </button>
    </form>
  );
}
