import React from "react";

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { render } from "@react-email/render";
import { emailLocales, resolveEmailLocale } from "../src/i18n";
import { ResetPasswordEmail, getResetPasswordSubject, resetPasswordSubject } from "../src/templates/ResetPassword";
import { InterviewCanceled, interviewCanceledSubject } from "../src/templates/InterviewCanceled";
import { OfferExtended, offerExtendedSubject } from "../src/templates/OfferExtended";
import { OfferWithdrawn, offerWithdrawnSubject } from "../src/templates/OfferWithdrawn";
import { ApplicationReceivedCandidate, applicationReceivedCandidateSubject } from "../src/templates/ApplicationReceivedCandidate";
import { ApplicationReceivedRecruiter, applicationReceivedRecruiterSubject } from "../src/templates/ApplicationReceivedRecruiter";
import { CandidateStageUpdate, candidateStageUpdateSubject } from "../src/templates/CandidateStageUpdate";
import { CandidateRejected, candidateRejectedSubject } from "../src/templates/CandidateRejected";
import { WelcomeEmail, getWelcomeEmailSubject } from "../src/templates/WelcomeEmail";
import { WorkspaceInvitation, workspaceInvitationSubject } from "../src/templates/WorkspaceInvitation";
import { PortalMagicLinkEmail, portalMagicLinkSubject } from "../src/templates/PortalMagicLink";
import { StaffMagicLinkEmail, staffMagicLinkSubject } from "../src/templates/StaffMagicLink";
import { PortalPasswordResetEmail, portalPasswordResetSubject } from "../src/templates/PortalPasswordReset";
import { VerifyEmail, getVerifyEmailSubject, verifyEmailSubject } from "../src/templates/VerifyEmail";
import { SignatureInvitation, signatureInvitationSubject } from "../src/templates/SignatureInvitation";
import { SignatureNotice } from "../src/templates/SignatureNotice";
import { CustomTemplateEmail } from "../src/templates/CustomTemplateEmail";

test("recipient locale uses a supported exact tag or English", () => {
  assert.equal(resolveEmailLocale("PT-br"), "pt-BR");
  assert.equal(resolveEmailLocale("pt-PT"), "en");
  assert.equal(resolveEmailLocale(undefined), "en");
  assert.equal(getResetPasswordSubject(), resetPasswordSubject);
  assert.equal(getVerifyEmailSubject(), verifyEmailSubject);
});

for (const locale of emailLocales) {
  test(`localized email templates render in ${locale}`, async () => {
    const resetUrl = "https://example.com/reset?token=abc";
    const verifyUrl = "https://example.com/verify?token=abc";
    const reset = await render(<ResetPasswordEmail locale={locale} userName="Ava" resetUrl={resetUrl} />);
    const verify = await render(<VerifyEmail locale={locale} userName="Ava" verifyUrl={verifyUrl} />);
    assert.match(reset, new RegExp(`<html[^>]*lang="${locale}"`));
    assert.match(verify, new RegExp(`<html[^>]*lang="${locale}"`));
    assert.ok(reset.includes(resetUrl));
    assert.ok(verify.includes(verifyUrl));
    assert.ok(verify.includes("Ava"));
    assert.ok(getResetPasswordSubject(locale).length > 0);
    assert.ok(getVerifyEmailSubject(locale).length > 0);
    assert.ok(!reset.includes("reset.heading"));
    assert.ok(!verify.includes("verify.greeting"));
    const portal = await render(<PortalMagicLinkEmail locale={locale} candidateName="Ava" loginUrl={verifyUrl} />);
    const staff = await render(<StaffMagicLinkEmail locale={locale} loginUrl={verifyUrl} />);
    const portalReset = await render(<PortalPasswordResetEmail locale={locale} candidateName="Ava" loginUrl={verifyUrl} />);
    for (const html of [portal, staff, portalReset]) {
      assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
      assert.ok(html.includes(verifyUrl));
      assert.ok(!html.includes("common.signIn"));
    }
    assert.ok(portal.includes("Ava"));
    assert.ok(portalReset.includes("Ava"));
    assert.ok(portalMagicLinkSubject(locale));
    assert.ok(staffMagicLinkSubject(locale));
    assert.ok(portalPasswordResetSubject(locale));
    const welcome = await render(<WelcomeEmail locale={locale} userName="Ava" workspaceName="Acme" dashboardUrl={verifyUrl} />);
    const invitation = await render(<WorkspaceInvitation locale={locale} inviteeName="Ava" inviterName="Sam" workspaceName="Acme" role="unknown-role" acceptUrl={verifyUrl} />);
    for (const html of [welcome, invitation]) {
      assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
      assert.ok(html.includes("Ava"));
      assert.ok(html.includes("Acme"));
      assert.ok(html.includes(verifyUrl));
      assert.ok(!html.includes("invitation.roles"));
    }
    const rejection = await render(<CandidateRejected locale={locale} candidateName="Ava" companyName="Acme" jobTitle="Engineer" customMessage="CUSTOM-MESSAGE" portalUrl={verifyUrl} />);
    assert.match(rejection, new RegExp(`<html[^>]*lang="${locale}"`));
    assert.ok(rejection.includes("CUSTOM-MESSAGE"));
    assert.ok(rejection.includes(verifyUrl));
    assert.ok(candidateRejectedSubject({ locale, jobTitle: "Engineer", companyName: "Acme" }).includes("Acme"));
    const stage = await render(<CandidateStageUpdate locale={locale} candidateName="Ava" companyName="Acme" jobTitle="Engineer" stageName="Review" nextStepMessage="CUSTOM-STEP" portalUrl={verifyUrl} />);
    assert.match(stage, new RegExp(`<html[^>]*lang="${locale}"`));
    assert.ok(stage.includes("CUSTOM-STEP"));
    assert.ok(stage.includes("Review"));
    assert.ok(candidateStageUpdateSubject({ locale, jobTitle: "Engineer", stageName: "Review" }).includes("Review"));
    const candidate = await render(<ApplicationReceivedCandidate locale={locale} candidateName="Ava" companyName="Acme" jobTitle="Engineer" portalUrl={verifyUrl} profileUrl={verifyUrl} jobBoardUrl={verifyUrl} />);
    const recruiter = await render(<ApplicationReceivedRecruiter locale={locale} candidateName="Ava" candidateEmail="ava@example.com" jobTitle="Engineer" dashboardUrl={verifyUrl} />);
    for (const html of [candidate, recruiter]) {
      assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
      assert.ok(html.includes("Engineer"));
      assert.ok(html.includes(verifyUrl));
    }
    assert.ok(applicationReceivedCandidateSubject({ locale, jobTitle: "Engineer", companyName: "Acme" }).includes("Acme"));
    assert.ok(applicationReceivedRecruiterSubject({ locale, jobTitle: "Engineer", candidateName: "Ava" }).includes("Ava"));
    const offer = await render(<OfferExtended locale={locale} candidateName="Ava" companyName="Acme" jobTitle="Engineer" salary="SALARY" startDate="DATE" expiresAt="EXPIRY" equity="EQUITY" offerUrl={verifyUrl} />);
    const withdrawn = await render(<OfferWithdrawn locale={locale} candidateName="Ava" companyName="Acme" jobTitle="Engineer" reason="CUSTOM-REASON" />);
    assert.match(offer, new RegExp(`<html[^>]*lang="${locale}"`));
    assert.ok(offer.includes("SALARY"));
    assert.ok(offer.includes("DATE"));
    assert.ok(offer.includes(verifyUrl));
    assert.ok(withdrawn.includes("CUSTOM-REASON"));
    assert.ok(offerExtendedSubject({ locale, jobTitle: "Engineer", companyName: "Acme" }).includes("Acme"));
    assert.ok(offerWithdrawnSubject({ locale, jobTitle: "Engineer", companyName: "Acme" }).includes("Acme"));
    for (const when of [undefined, "DATE"]) {
      const canceled = await render(<InterviewCanceled locale={locale} candidateName="Ava" companyName="Acme" jobTitle="Engineer" interviewType="Interview" when={when} reason="CUSTOM-REASON" />);
      assert.match(canceled, new RegExp(`<html[^>]*lang="${locale}"`));
      assert.ok(canceled.includes("CUSTOM-REASON"));
      if (when) assert.ok(canceled.includes(when));
    }
    assert.ok(interviewCanceledSubject({ locale, jobTitle: "Engineer", companyName: "Acme" }).includes("Acme"));
    assert.ok(getWelcomeEmailSubject(locale));
    assert.ok(workspaceInvitationSubject({ locale, inviterName: "Sam", workspaceName: "Acme" }).includes("Acme"));
    const signature = await render(<SignatureInvitation locale={locale} recipientName="Ava" companyName="Acme" documentName="Employment agreement" requestedBy="Sam" message="USER-WRITTEN-NOTE" expiresOn="USER-FORMATTED-DATE" signerPosition={{ order: 1, total: 2 }} signUrl={verifyUrl} />);
    assert.match(signature, new RegExp(`<html[^>]*lang="${locale}"`));
    for (const userValue of ["Ava", "Acme", "Employment agreement", "Sam", "USER-WRITTEN-NOTE", "USER-FORMATTED-DATE", verifyUrl]) {
      assert.ok(signature.includes(userValue), `signature invitation in ${locale} retains ${userValue}`);
    }
    assert.ok(signatureInvitationSubject({ locale, companyName: "Acme", documentName: "Contract" }).includes("Acme"));
    assert.ok(signatureInvitationSubject({ locale, companyName: "Acme", documentName: "Contract", reminder: true }).length > 0);
    const plainSignature = await render(<SignatureInvitation locale={locale} recipientName="Ava" companyName="Acme" documentName="Employment agreement" expiresOn="USER-FORMATTED-DATE" signUrl={verifyUrl} />, { plainText: true });
    assert.ok(plainSignature.includes("Employment agreement"));
    assert.ok(plainSignature.includes(verifyUrl));
    const signatureNotice = await render(<SignatureNotice locale={locale} recipientName="Ava" companyName="Acme" heading="USER-HEADING" paragraphs={["USER-PARAGRAPH"]} cta={{ label: "USER-BUTTON", url: verifyUrl }} />);
    const custom = await render(<CustomTemplateEmail locale={locale} companyName="Acme" bodyHtml="<p>USER-AUTHORED-COPY</p>" />);
    for (const html of [signatureNotice, custom]) assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
    for (const userValue of ["USER-HEADING", "USER-PARAGRAPH", "USER-BUTTON", "USER-AUTHORED-COPY"]) {
      assert.ok(signatureNotice.includes(userValue) || custom.includes(userValue));
    }
  });
}
