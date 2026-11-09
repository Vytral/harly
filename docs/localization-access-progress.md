# Access localization progress

This is a working record, not an assertion that the access domain is complete. Message files are integrated separately into `apps/web/messages`.

| Area | Files reviewed | State |
| --- | --- | --- |
| Sign in | `(auth)/login/page.tsx`, `(auth)/login/_components/login-form.tsx` | UI and client fallback messages migrated. Organization activation and passkey API error text can still originate from backend responses. |
| Sign up | `(auth)/signup/page.tsx`, `(auth)/signup/_components/signup-form.tsx` | UI and client fallback messages migrated. Better Auth error messages need code-based localization. |
| Forgot password | `(auth)/forgot-password/page.tsx`, `(auth)/forgot-password/_components/forgot-password-form.tsx` | Previously migrated. Better Auth error messages need review. |
| Reset password | `(auth)/reset-password/page.tsx`, `(auth)/reset-password/_components/reset-password-form.tsx` | UI, validation and fallback messages migrated. Better Auth error messages need code-based localization. |
| Shared auth | `(auth)/layout.tsx`, `(auth)/_components/auth-shell.tsx`, `(auth)/_components/auth-methods.tsx` | Reviewed; remaining literal labels are brands or supplied by callers. |
| Required two-factor setup | `setup-2fa/page.tsx`, `setup-2fa/_components/setup-2fa-form.tsx` | UI, feedback and downloaded backup-code text migrated. Better Auth errors need code-based localization. |
| Required password change | `change-password/page.tsx`, `change-password/_components/change-password-form.tsx` | UI and fallback migrated. Server action error text needs localization. |
| No workspace | `no-workspace/page.tsx`, `(onboarding)/onboarding/_components/OnboardingSignOut.tsx` | Visible copy migrated; sign-out component is shared with onboarding. |
| OAuth consent | `oauth/consent/page.tsx`, `oauth/layout.tsx`, `src/lib/mcp/oauth/consent.ts`, `src/lib/mcp/oauth/scope-labels.ts` | Pending. Includes user-facing protocol errors, security warnings and scope descriptions; protocol response contracts must remain stable. |
| Initial setup | `(public)/setup/page.tsx`, `SetupClaimForm.tsx`, `SetupBrandPanel.tsx` | UI and fallback migrated. The setup claim API returns user-visible error text that needs localization. |
| Demo entry | `(public)/enter/page.tsx`, `_components/demo-enter-form.tsx`, `_components/enter-brand-panel.tsx` | Page, metadata, form and brand panel migrated. Conditional CAPTCHA states require browser verification. |
| Invitations and invite links | `invite/[invitationId]/page.tsx`, `join/[token]/page.tsx`, `features/workspaces/{InviteOnboard,AcceptInvitationButton,JoinWorkspaceButton}.tsx` | UI and built-in roles migrated. Unknown custom roles stay unchanged. Server action and Better Auth error text still needs localization; verify invitation states in the browser. |
| Onboarding | `(onboarding)`, `features/onboarding` and dependencies | Pending complete file and conditional-state review. |

Names, e-mail example values, brands and user-provided content are not translated. Passing lint or parsing catalogs does not verify rendered flows. Browser checks remain pending for all six locales.
