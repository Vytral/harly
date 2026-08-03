import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import {
  account,
  candidates,
  candidatePortalMagicLinks,
  createDatabaseClient,
  emailOutbox,
  jobStages,
  jobs,
  member,
  organization,
  user,
  workspaceSettings,
} from "@harly/db";

import {
  E2E_DATABASE_URL,
  E2E_SMTP_PORT,
  FIXTURE,
  STAGE_IDS,
  STAGE_NAMES,
} from "./constants";

const applicationConfig = {
  resumeRequired: false,
  profileLinks: {
    linkedin: { enabled: false, required: false },
    github: { enabled: false, required: false },
    website: { enabled: false, required: false },
  },
  sections: {
    personal: {
      phone: { visibility: "disabled" },
      address: { visibility: "disabled" },
      photo: { visibility: "disabled" },
      headline: { visibility: "disabled" },
    },
    profile: {
      resume: { visibility: "disabled" },
      linkedinUrl: { visibility: "disabled" },
      githubUrl: { visibility: "disabled" },
      websiteUrl: { visibility: "disabled" },
      education: { visibility: "disabled" },
      experience: { visibility: "disabled" },
    },
    details: {
      coverLetter: { visibility: "optional" },
    },
  },
  questions: [],
} as const;

export async function provisionE2EFixture() {
  const { db, sql } = createDatabaseClient(E2E_DATABASE_URL);
  const now = new Date();

  try {
    // The cleanup predicates are fixture-specific. In particular, this never
    // deletes the normal `harly` database or another workspace's data.
    await db
      .delete(jobs)
      .where(
        and(
          eq(jobs.workspaceId, FIXTURE.workspaceId),
          eq(jobs.slug, FIXTURE.jobSlug),
        ),
      );
    await db
      .delete(candidates)
      .where(
        and(
          eq(candidates.workspaceId, FIXTURE.workspaceId),
          eq(candidates.email, FIXTURE.candidateEmail),
        ),
      );
    await db
      .delete(candidatePortalMagicLinks)
      .where(eq(candidatePortalMagicLinks.workspaceId, FIXTURE.workspaceId));
    await db
      .delete(emailOutbox)
      .where(eq(emailOutbox.workspaceId, FIXTURE.workspaceId));

    await db
      .insert(organization)
      .values({
        id: FIXTURE.workspaceId,
        name: FIXTURE.workspaceName,
        slug: FIXTURE.workspaceSlug,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: organization.id,
        set: {
          name: FIXTURE.workspaceName,
          slug: FIXTURE.workspaceSlug,
        },
      });

    const password = await hashPassword(FIXTURE.recruiterPassword);
    await db
      .insert(user)
      .values({
        id: FIXTURE.recruiterId,
        name: "Harly E2E Recruiter",
        email: FIXTURE.recruiterEmail,
        emailVerified: true,
        onboardingCompletedAt: now,
        mustChangePassword: false,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: user.id,
        set: {
          name: "Harly E2E Recruiter",
          email: FIXTURE.recruiterEmail,
          emailVerified: true,
          onboardingCompletedAt: now,
          mustChangePassword: false,
          updatedAt: now,
        },
      });

    await db
      .insert(account)
      .values({
        id: "e2e-hiring-recruiter-credential",
        accountId: FIXTURE.recruiterId,
        providerId: "credential",
        userId: FIXTURE.recruiterId,
        password,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: account.id,
        set: {
          accountId: FIXTURE.recruiterId,
          providerId: "credential",
          userId: FIXTURE.recruiterId,
          password,
          updatedAt: now,
        },
      });

    await db
      .insert(member)
      .values({
        id: "e2e-hiring-recruiter-membership",
        organizationId: FIXTURE.workspaceId,
        userId: FIXTURE.recruiterId,
        role: "owner",
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: member.id,
        set: {
          organizationId: FIXTURE.workspaceId,
          userId: FIXTURE.recruiterId,
          role: "owner",
          status: "active",
          updatedAt: now,
        },
      });

    await db
      .insert(workspaceSettings)
      .values({
        organizationId: FIXTURE.workspaceId,
        legalEntityName: "Harly E2E SpA",
        legalEntityEmail: "privacy@harly-e2e.test",
        legalJurisdiction: "cl",
        consentCheckboxText: "I agree to the Harly E2E privacy terms.",
        legalPages: {
          privacyPolicy: "Harly E2E privacy policy",
          termsOfService: "Harly E2E terms of service",
        },
        legalConfigured: true,
        candidatePortalEnabled: true,
        portalShowApplicationStatus: true,
        emailEnabled: true,
        emailProvider: "smtp",
        emailFrom: "harly-e2e@harly-e2e.test",
        emailSmtpHost: "127.0.0.1",
        emailSmtpPort: E2E_SMTP_PORT,
        emailSmtpSecure: false,
        nativeSignEnabled: true,
        remoteSignEnabled: false,
        signatureSecurityMode: "link_only",
        offerSignatureChannel: "native",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: {
          legalEntityName: "Harly E2E SpA",
          legalEntityEmail: "privacy@harly-e2e.test",
          legalJurisdiction: "cl",
          consentCheckboxText: "I agree to the Harly E2E privacy terms.",
          legalPages: {
            privacyPolicy: "Harly E2E privacy policy",
            termsOfService: "Harly E2E terms of service",
          },
          legalConfigured: true,
          candidatePortalEnabled: true,
          portalShowApplicationStatus: true,
          emailEnabled: true,
          emailProvider: "smtp",
          emailFrom: "harly-e2e@harly-e2e.test",
          emailSmtpHost: "127.0.0.1",
          emailSmtpPort: E2E_SMTP_PORT,
          emailSmtpSecure: false,
          nativeSignEnabled: true,
          remoteSignEnabled: false,
          signatureSecurityMode: "link_only",
          offerSignatureChannel: "native",
          updatedAt: now,
        },
      });

    await db.insert(jobs).values({
      id: FIXTURE.jobId,
      workspaceId: FIXTURE.workspaceId,
      title: "Product Engineer",
      slug: FIXTURE.jobSlug,
      department: "Engineering",
      location: "Remote",
      employmentType: "full_time",
      workplaceType: "remote",
      description: "Build thoughtful product experiences with Harly.",
      requirements: "Product engineering experience.",
      applicationConfig,
      boardConfig: { brandName: FIXTURE.workspaceName, accentColor: "#c8f560" },
      status: "open",
      publishedAt: now,
      createdById: FIXTURE.recruiterId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(jobStages).values(
      STAGE_IDS.map((id, order) => ({
        id,
        workspaceId: FIXTURE.workspaceId,
        jobId: FIXTURE.jobId,
        name: STAGE_NAMES[order],
        order,
        color: order === 4 ? "#4ade80" : "#c8f560",
        createdAt: now,
        updatedAt: now,
      })),
    );

    return {
      ...FIXTURE,
      jobUrl: `/apply/${FIXTURE.jobSlug}`,
    };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

if (process.argv[1]?.endsWith("provision.ts")) {
  provisionE2EFixture()
    .then((fixture) => {
      console.log(`Provisioned isolated E2E fixture in ${E2E_DATABASE_URL}`);
      console.log(`Job: ${fixture.jobUrl}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
