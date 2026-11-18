/**
 * Placeholder legal pages for the public demo (Syntrix Inc. is fictional).
 * `data.ts` falls back to these only in demo mode and only for pages the
 * workspace has not authored, so a real workspace never ships this text.
 * All addresses and contacts are fictional and use the reserved
 * `.example` domain.
 */
const NOTE =
  "<p><em>Demo content: Syntrix Inc. is a fictional company and this page is a sample, not legal advice. Replace it with text reviewed by your own counsel before publishing a real careers site.</em></p>";

const UPDATED = "<p><strong>Last updated:</strong> 1 March 2026</p>";

const CONTACT_BLOCK =
  "<p>Syntrix Inc.<br>Attn: Legal Department<br>100 Example Street, Suite 400<br>Springfield, ST 00000</p>";

export const DEMO_LEGAL_PAGES: Record<string, string> = {
  termsOfService: `${NOTE}
${UPDATED}
<p>These Terms of Service ("Terms") govern your use of the Syntrix careers site, the candidate portal and any related services we provide to job applicants (together, the "Site"). The Site is operated by Syntrix Inc. ("Syntrix", "we", "us"). By accessing the Site or submitting an application, you agree to these Terms. If you do not agree, please do not use the Site.</p>
<h2>1. Eligibility and accounts</h2>
<p>You must be at least 16 years old, or the minimum working age in your country if higher, to use the Site. If you create a candidate portal account, you are responsible for keeping your sign-in link and credentials confidential and for all activity under your account. Tell us promptly at <a href="mailto:legal@syntrix.example">legal@syntrix.example</a> if you suspect unauthorised access.</p>
<h2>2. Your application</h2>
<ul>
<li>You may apply only on your own behalf. Recruitment agencies must have a signed agreement with Syntrix before submitting candidates.</li>
<li>Information you provide must be accurate, complete and not misleading. We may withdraw an application or offer if we find that material information was false.</li>
<li>Submitting an application does not create an employment relationship, a contract or a guarantee of an interview or response.</li>
<li>Job postings describe roles as we understand them at the time of publication. We may change, pause or close a role at any time.</li>
</ul>
<h2>3. Assessments and interviews</h2>
<p>Some roles include interviews, exercises or assessments. Materials we share with you during the process are confidential and provided only so you can take part. Work you produce in an exercise remains yours; we use it solely to evaluate your application and do not use it in our products.</p>
<h2>4. Acceptable use</h2>
<p>When using the Site you agree not to:</p>
<ul>
<li>disrupt, overload or attempt to gain unauthorised access to the Site or its systems;</li>
<li>scrape, harvest or copy content at scale, or use automated means to submit applications;</li>
<li>upload files containing malware, or content that is unlawful, discriminatory or that you do not have the right to share;</li>
<li>impersonate another person or misrepresent your affiliation with anyone.</li>
</ul>
<h2>5. Intellectual property</h2>
<p>The Site, including its design, text, graphics, logos and job descriptions, is owned by Syntrix or its licensors and protected by intellectual property laws. You may view and print pages for your personal, non-commercial use. Documents you upload, such as your resume, remain yours; you grant Syntrix a limited licence to store, copy and share them internally for the purpose of evaluating your application, as described in our Privacy Policy.</p>
<h2>6. Third-party services</h2>
<p>The Site may link to or integrate third-party services, such as video-conferencing or scheduling tools. Those services are governed by their own terms, and Syntrix is not responsible for their content or practices.</p>
<h2>7. Disclaimers and limitation of liability</h2>
<p>The Site is provided "as is" and "as available". To the fullest extent permitted by law, Syntrix disclaims all warranties, express or implied, and is not liable for indirect, incidental or consequential damages arising from your use of the Site. Nothing in these Terms limits liability that cannot be limited under applicable law.</p>
<h2>8. Changes to these Terms</h2>
<p>We may update these Terms from time to time. We will post the new version on this page and change the "Last updated" date. Continuing to use the Site after a change means you accept the updated Terms.</p>
<h2>9. Governing law</h2>
<p>These Terms are governed by the laws of the jurisdiction in which Syntrix Inc. is incorporated, without regard to conflict-of-law rules. Mandatory consumer and employment protections in your country of residence continue to apply.</p>
<h2>10. Contact</h2>
<p>Questions about these Terms can be sent to <a href="mailto:legal@syntrix.example">legal@syntrix.example</a> or by post to:</p>
${CONTACT_BLOCK}`,

  privacyPolicy: `${NOTE}
${UPDATED}
<p>This Privacy Policy explains how Syntrix Inc. ("Syntrix", "we", "us") collects, uses and protects personal data when you visit our careers site, apply for a role or take part in our hiring process. Syntrix is the controller of this data. You can reach our Data Protection Officer at <a href="mailto:privacy@syntrix.example">privacy@syntrix.example</a>.</p>
<h2>1. Data we collect</h2>
<ul>
<li><strong>Information you give us:</strong> name, contact details, resume or CV, cover letter, portfolio links, work history, education, answers to screening questions, salary expectations, and anything you write in messages to us.</li>
<li><strong>Information from the process:</strong> interview notes, scorecards, assessment results and the outcome of your application.</li>
<li><strong>Information from others:</strong> referrals from Syntrix employees, references you authorise us to contact, and, where lawful and only for specific roles, background checks you consent to.</li>
<li><strong>Technical data:</strong> IP address, browser type, device information and pages visited, collected to keep the Site secure and working.</li>
</ul>
<p>We do not ask for sensitive data such as health information, religion or political opinions. Where the law permits and you choose to provide equal-opportunity information, we store it separately and use it only in aggregate to monitor the fairness of our hiring.</p>
<h2>2. How we use your data</h2>
<ul>
<li>to assess your skills, experience and suitability for the role you applied for;</li>
<li>to communicate with you and schedule interviews;</li>
<li>to make and administer an offer of employment, if you are successful;</li>
<li>to consider you for future roles, if you agree to be kept in our talent pool;</li>
<li>to keep our hiring process fair, secure and compliant with the law.</li>
</ul>
<h2>3. Legal bases</h2>
<p>We process your data because it is necessary to take steps at your request before entering into an employment contract, because we have a legitimate interest in recruiting the right people, to comply with legal obligations, and, where we ask for it, on the basis of your consent. You can withdraw consent at any time without affecting earlier processing.</p>
<h2>4. Automated tools</h2>
<p>We may use software to help organise applications, for example to match skills against a job's requirements or to suggest interview times. These tools support our recruiters; they do not make hiring decisions. Every decision about your application is made by a person.</p>
<h2>5. Who we share data with</h2>
<p>Your application is visible only to the recruiters, hiring managers and interviewers involved in the role. We also share data with service providers that host our systems, send email or provide video interviews, under written agreements that require them to protect it and use it only on our instructions. We never sell personal data.</p>
<h2>6. International transfers</h2>
<p>Syntrix operates in several countries, so your data may be accessed from outside the country where you live. When we transfer data internationally we use appropriate safeguards, such as standard contractual clauses.</p>
<h2>7. Retention</h2>
<p>If your application is unsuccessful, we keep it for 12 months after the role closes so we can respond to questions and consider you for similar roles, then delete or anonymise it. If you join our talent pool we keep your profile for up to 24 months, and we will ask before extending that. If you are hired, your application becomes part of your employee record.</p>
<h2>8. Security</h2>
<p>We protect your data with encryption in transit and at rest, role-based access controls, audit logging and regular security reviews.</p>
<h2>9. Your rights</h2>
<p>Depending on where you live, you may have the right to access, correct, export or delete your data, to object to or restrict certain processing, and to withdraw consent. To exercise these rights, write to <a href="mailto:privacy@syntrix.example">privacy@syntrix.example</a>; we respond within 30 days. You also have the right to complain to your local data protection authority.</p>
<h2>10. Changes</h2>
<p>We will post any changes to this policy on this page and update the date above. Significant changes will be communicated to active candidates by email.</p>`,

  cookiePolicy: `${NOTE}
${UPDATED}
<p>This Cookie Policy explains how the Syntrix careers site uses cookies and similar technologies.</p>
<h2>What cookies are</h2>
<p>Cookies are small text files a website stores in your browser. They help the site remember information between pages or visits.</p>
<h2>Cookies we use</h2>
<ul>
<li><strong>Strictly necessary:</strong> keep your application session and candidate portal sign-in working, protect forms against abuse and remember your cookie choices. These cannot be switched off.</li>
<li><strong>Preferences:</strong> remember settings such as light or dark theme and your preferred language.</li>
</ul>
<p>We do not use advertising or cross-site tracking cookies, and we do not sell information collected through cookies.</p>
<h2>How long they last</h2>
<p>Session cookies are deleted when you close your browser. Preference cookies last up to 12 months.</p>
<h2>Managing cookies</h2>
<p>You can block or delete cookies through your browser settings. If you block strictly necessary cookies, parts of the Site, such as the application form, may stop working.</p>
<h2>Contact</h2>
<p>Questions about cookies: <a href="mailto:privacy@syntrix.example">privacy@syntrix.example</a>.</p>`,

  candidateNotice: `${NOTE}
${UPDATED}
<h2>Candidate privacy notice</h2>
<p>This notice summarises how Syntrix Inc. handles your personal data as a job applicant. Our full Privacy Policy has more detail.</p>
<h2>Who is responsible</h2>
<p>Syntrix Inc. is the controller of the personal data you submit as a candidate. Our Data Protection Officer can be reached at <a href="mailto:privacy@syntrix.example">privacy@syntrix.example</a>.</p>
<h2>What we do with your data</h2>
<p>We use your application, interview feedback and assessment results to evaluate your suitability for the role you applied for and, if you agree, for future roles. We rely on steps taken at your request before a contract, our legitimate interest in hiring, and your consent where we ask for it.</p>
<h2>Who can see it</h2>
<p>Only the recruiters and interviewers involved in the role, and service providers who host our systems under confidentiality agreements.</p>
<h2>Fair decisions</h2>
<p>Software may help us organise applications, but every hiring decision is made by a person. You can ask for a human review of any step in the process.</p>
<h2>How long we keep it</h2>
<p>Unsuccessful applications are deleted or anonymised 12 months after the role closes; talent pool profiles after 24 months unless you renew your consent.</p>
<h2>Your rights</h2>
<p>You can request access to, correction, export or deletion of your data, object to processing, or withdraw consent at any time by contacting <a href="mailto:privacy@syntrix.example">privacy@syntrix.example</a>. You may also complain to your local data protection authority.</p>`,
};
