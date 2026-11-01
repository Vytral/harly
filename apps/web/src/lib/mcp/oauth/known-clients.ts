import { isLoopbackHost } from "./redirect";

/**
 * Clients we recognise on sight. Recognition needs evidence we can check:
 * the HTTPS redirect host, a private-use scheme or (for CIMD) the client_id
 * host. The self-reported name alone only counts for loopback-only clients,
 * because a loopback redirect can only reach the user's own device.
 */
type KnownClient = {
  label: string;
  hosts: string[];
  schemes: string[];
  /** Names of local-only apps (CLI / desktop) that redirect to loopback. */
  localNames: string[];
};

const KNOWN: KnownClient[] = [
  { label: "Claude", hosts: ["claude.ai", "claude.com", "anthropic.com"], schemes: ["claude:"], localNames: ["claude code", "claude desktop", "claude"] },
  { label: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com", "openai.com"], schemes: [], localNames: ["codex", "chatgpt"] },
  { label: "Gemini", hosts: ["gemini.google.com", "aistudio.google.com"], schemes: [], localNames: ["gemini", "gemini cli"] },
  { label: "Grok", hosts: ["grok.com", "x.ai", "x.com"], schemes: [], localNames: ["grok"] },
  { label: "Cursor", hosts: ["cursor.com", "cursor.sh"], schemes: ["cursor:"], localNames: ["cursor"] },
  { label: "VS Code", hosts: ["vscode.dev", "insiders.vscode.dev", "code.visualstudio.com"], schemes: ["vscode:", "vscode-insiders:"], localNames: ["visual studio code", "vs code", "vscode"] },
  { label: "Windsurf", hosts: ["windsurf.com", "codeium.com"], schemes: ["windsurf:"], localNames: ["windsurf"] },
  { label: "Perplexity", hosts: ["perplexity.ai"], schemes: [], localNames: [] },
  { label: "Mistral Le Chat", hosts: ["mistral.ai"], schemes: [], localNames: [] },
  { label: "Zed", hosts: ["zed.dev"], schemes: ["zed:"], localNames: ["zed"] },
  { label: "Raycast", hosts: ["raycast.com"], schemes: ["raycast:"], localNames: [] },
];

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

export type KnownClientMatch = { label: string } | null;

export function matchKnownClient(input: {
  clientId: string;
  name: string;
  redirectUris: readonly string[];
}): KnownClientMatch {
  const hosts: string[] = [];
  const schemes: string[] = [];
  let allLoopback = input.redirectUris.length > 0;
  for (const raw of input.redirectUris) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:") {
        hosts.push(url.hostname.toLowerCase());
        allLoopback = false;
      } else if (url.protocol === "http:" && isLoopbackHost(url.hostname)) {
        // loopback: handled below
      } else {
        schemes.push(url.protocol);
        allLoopback = false;
      }
    } catch {
      return null;
    }
  }
  // A CIMD client_id is an https URL whose host is controlled by the client.
  if (input.clientId.startsWith("https://")) {
    try {
      hosts.push(new URL(input.clientId).hostname.toLowerCase());
    } catch {
      return null;
    }
  }

  const name = input.name.trim().toLowerCase();
  for (const known of KNOWN) {
    const hostOk = hosts.length > 0 && hosts.every((h) => known.hosts.some((d) => hostMatches(h, d)));
    const schemeOk = schemes.length > 0 && schemes.every((s) => known.schemes.includes(s));
    // Every redirect must point at the same vendor: mixed targets are not "known".
    const redirectsOk =
      (hostOk || schemeOk) &&
      input.redirectUris.every((raw) => {
        const url = new URL(raw);
        if (url.protocol === "https:") return known.hosts.some((d) => hostMatches(url.hostname.toLowerCase(), d));
        if (url.protocol === "http:") return isLoopbackHost(url.hostname);
        return known.schemes.includes(url.protocol);
      });
    if (redirectsOk) return { label: known.label };
    if (allLoopback && known.localNames.includes(name) && !input.clientId.startsWith("https://")) {
      return { label: known.label };
    }
  }
  return null;
}
