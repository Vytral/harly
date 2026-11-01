/**
 * Placeholder legal pages for the public demo (Syntrix Inc. is fictional).
 * `data.ts` falls back to these only in demo mode and only for pages the
 * workspace has not authored, so a real workspace never ships this text.
 */
const NOTE =
  "<p><em>Demo content: Syntrix Inc. is a fictional company and this page is a sample, not legal advice.</em></p>";

export const DEMO_LEGAL_PAGES: Record<string, string> = {
  termsOfService: `${NOTE}
<h2>1. Using this site</h2>
<p>By browsing Syntrix's careers site or submitting an application you agree to these terms. Please provide accurate information and only apply on your own behalf.</p>
<h2>2. Your application</h2>
<p>Submitting an application does not create an employment relationship or guarantee a response. We may close roles at any time without notice.</p>
<h2>3. Acceptable use</h2>
<p>Do not attempt to disrupt the site, scrape it at scale, or upload files that contain malware or content you do not have the right to share.</p>
<h2>4. Intellectual property</h2>
<p>Site content, branding and job descriptions belong to Syntrix Inc. Documents you upload remain yours; you grant us permission to use them to evaluate your application.</p>
<h2>5. Liability</h2>
<p>The site is provided "as is". To the extent the law allows, Syntrix Inc. is not liable for indirect damages arising from its use.</p>
<h2>6. Contact</h2>
<p>Questions about these terms: <a href="mailto:legal@syntrix.com">legal@syntrix.com</a>.</p>`,

  privacyPolicy: `${NOTE}
<h2>What we collect</h2>
<p>When you apply we collect the details you give us: name, email, phone, resume, answers to screening questions, and anything you add in messages. We also record basic technical data such as browser type and approximate region.</p>
<h2>How we use it</h2>
<p>We use your information to review your application, contact you about it, and keep our hiring process fair and auditable. We do not sell personal data.</p>
<h2>Who sees it</h2>
<p>Your application is visible to the Syntrix hiring team and to service providers that host our systems under confidentiality terms.</p>
<h2>Retention</h2>
<p>We keep your application while the role is open and for future roles you may fit. You can ask us at any time to anonymize your data.</p>
<h2>Your rights</h2>
<p>You can request access, correction, export or deletion of your data at any time by writing to <a href="mailto:privacy@syntrix.com">privacy@syntrix.com</a>.</p>`,

  cookiePolicy: `${NOTE}
<h2>Cookies we use</h2>
<p>The careers site uses only essential cookies, for example to remember your theme and keep your application session working. We do not use advertising cookies.</p>
<h2>Managing cookies</h2>
<p>You can block or clear cookies in your browser settings; parts of the site may stop working as a result.</p>`,

  candidateNotice: `${NOTE}
<h2>Candidate privacy notice</h2>
<p>Syntrix Inc. is the controller of the personal data you submit as a candidate. We process it to evaluate your suitability for open roles, based on your consent and our legitimate interest in hiring.</p>
<p>Recruiters and interviewers involved in the role can access your application. Decisions are made by people, not solely by automated tools.</p>
<p>To exercise your rights or withdraw consent, contact <a href="mailto:privacy@syntrix.com">privacy@syntrix.com</a>.</p>`,
};
