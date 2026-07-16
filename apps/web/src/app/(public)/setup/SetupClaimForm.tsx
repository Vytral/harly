"use client";

import { useState } from "react";

export function SetupClaimForm() {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/setup/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Setup could not be authorized.");
        setPending(false);
        return;
      }
      // Hold the success state briefly so the checkmark reads before we leave.
      setDone(true);
      setTimeout(() => window.location.replace("/signup"), 650);
    } catch {
      setError("Setup could not be authorized.");
      setPending(false);
    }
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={submit}>
      <div>
        <label
          htmlFor="setup-token"
          className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        >
          Setup token
        </label>
        <input
          id="setup-token"
          type="password"
          autoComplete="one-time-code"
          autoFocus
          value={token}
          disabled={done}
          onChange={(event) => {
            setToken(event.target.value);
            setError(null);
          }}
          placeholder="Paste your one-time token"
          className="mt-2 w-full border-0 border-b border-input bg-transparent pb-2.5 font-mono text-sm text-foreground outline-none transition placeholder:font-sans placeholder:text-muted-foreground focus:border-ring disabled:opacity-60"
          required
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !token || done}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-pine-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:active:scale-100 motion-reduce:active:scale-100"
      >
        {done ? (
          <>
            <CheckIcon />
            Authorized
          </>
        ) : pending ? (
          "Authorizing…"
        ) : (
          "Authorize setup"
        )}
      </button>

      <p className="text-xs leading-5 text-muted-foreground">
        Authorization is limited to the owner email configured during{" "}
        <code className="font-mono text-[0.85em] text-foreground">init</code>.
      </p>
    </form>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8.5 6.5 12 13 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="24"
        className="checkmark-anim"
      />
    </svg>
  );
}
