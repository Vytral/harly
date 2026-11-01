import { describe, expect, it } from "vitest";

import { matchKnownClient } from "./known-clients";

describe("matchKnownClient", () => {
  it("recognises vendors by redirect host", () => {
    expect(matchKnownClient({ clientId: "hmc_x", name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] })?.label).toBe("Claude");
    expect(matchKnownClient({ clientId: "hmc_x", name: "ChatGPT", redirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"] })?.label).toBe("ChatGPT");
  });

  it("recognises native apps by private-use scheme", () => {
    expect(matchKnownClient({ clientId: "hmc_x", name: "Cursor", redirectUris: ["cursor://anysphere.cursor-retrieval/oauth/callback"] })?.label).toBe("Cursor");
    expect(matchKnownClient({ clientId: "hmc_x", name: "VS Code", redirectUris: ["vscode://x/y", "http://127.0.0.1:33418"] })?.label).toBe("VS Code");
  });

  it("trusts a loopback-only client's name (it can only reach this device)", () => {
    expect(matchKnownClient({ clientId: "hmc_x", name: "Claude Code", redirectUris: ["http://localhost:3118/callback"] })?.label).toBe("Claude");
  });

  it("does not trust a spoofed name with a remote redirect", () => {
    expect(matchKnownClient({ clientId: "hmc_x", name: "Claude", redirectUris: ["https://evil.example/cb"] })).toBeNull();
    expect(matchKnownClient({ clientId: "hmc_x", name: "Claude", redirectUris: ["https://claude.ai.evil.example/cb"] })).toBeNull();
    expect(matchKnownClient({ clientId: "hmc_x", name: "Claude", redirectUris: ["https://claude.ai/cb", "https://evil.example/cb"] })).toBeNull();
  });

  it("does not trust a CIMD client_id on an unrelated host that borrows a vendor name", () => {
    expect(
      matchKnownClient({ clientId: "https://evil.example/c.json", name: "Claude", redirectUris: ["http://localhost:1/cb"] }),
    ).toBeNull();
  });
});
