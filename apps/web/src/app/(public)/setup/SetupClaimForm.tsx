"use client";

import { useState } from "react";

export function SetupClaimForm() {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
        return;
      }
      window.location.replace("/signup");
    } catch {
      setError("Setup could not be authorized.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-8 space-y-4 text-left" onSubmit={submit}>
      <div>
        <label htmlFor="setup-token" className="text-sm font-medium text-foreground">
          Setup token
        </label>
        <input
          id="setup-token"
          type="password"
          autoComplete="one-time-code"
          value={token}
          onChange={(event) => {
            setToken(event.target.value);
            setError(null);
          }}
          className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-3 text-sm outline-none focus:border-ring"
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button
        type="submit"
        disabled={pending || !token}
        className="w-full rounded-lg bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Authorizing…" : "Authorize setup"}
      </button>
    </form>
  );
}
