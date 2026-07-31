import { describe, expect, it } from "vitest";

import { getHarlyCapabilities } from "./capabilities";

describe("Harly capability registry", () => {
  it("distinguishes LinkedIn link sharing from native job publishing", () => {
    const capabilities = getHarlyCapabilities();
    const share = capabilities.find(
      (item) => item.id === "jobs.share_linkedin_link",
    );
    const nativeJob = capabilities.find(
      (item) => item.id === "jobs.publish_linkedin_native_job",
    );

    expect(share?.status).toBe("available");
    expect(share?.mode).toBe("external_flow");
    expect(share?.createsNativeJob).toBe(false);
    expect(share?.syncsCandidates).toBe(false);
    expect(share?.limitation).toContain(
      "does not create a native LinkedIn Job",
    );
    expect(nativeJob?.status).toBe("unsupported");
    expect(nativeJob?.mode).toBe("unsupported");
    expect(nativeJob?.reason).toContain("No LinkedIn Jobs");
  });

  it("returns independent catalog objects", () => {
    const first = getHarlyCapabilities();
    first[0].name = "tampered";
    expect(getHarlyCapabilities()[0].name).not.toBe("tampered");
  });
});
