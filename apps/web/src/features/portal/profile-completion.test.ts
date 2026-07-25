import { describe, expect, it } from "vitest";

import { getPortalProfileCompletion } from "./profile-completion";

const emptyProfile = {
  firstName: "Ada",
  lastName: "Lovelace",
  headline: null,
  phone: null,
  location: null,
  avatarUrl: null,
  linkedinUrl: null,
  githubUrl: null,
  websiteUrl: null,
};

describe("getPortalProfileCompletion", () => {
  it("suggests the missing profile fields", () => {
    expect(getPortalProfileCompletion(emptyProfile)).toMatchObject({
      percentage: 14,
      completed: 1,
      total: 7,
      missing: [
        "Professional headline",
        "Phone",
        "Location",
        "Profile photo",
        "LinkedIn",
        "GitHub or website",
      ],
    });
  });

  it("counts GitHub and website as one online profile requirement", () => {
    expect(
      getPortalProfileCompletion({
        ...emptyProfile,
        headline: "Engineer",
        phone: "+56 9 1234 5678",
        location: "Santiago",
        githubUrl: "https://github.com/ada",
      }),
    ).toMatchObject({
      percentage: 71,
      completed: 5,
      missing: ["Profile photo", "LinkedIn"],
    });
  });
});
