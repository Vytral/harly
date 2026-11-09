# Authentication text inventory

Candidate strings extracted from authentication-related TSX files. Line numbers identify source locations on the current branch. Entries include JSX text, user-facing attributes, and message-like strings in expressions. Review the surrounding code before extraction: expressions may contain identifiers or fragments, while errors supplied by servers or authentication providers need separate tracing.

Brand and identity provider names are usually proper names. Email addresses and numeric examples are placeholders. Do not translate URLs, CSS classes, field names or data supplied by the user.

## apps/web/src/app/(auth)/_components/auth-shell.tsx

- 64 (alt): "Harly"

## apps/web/src/app/(auth)/forgot-password/_components/forgot-password-form.tsx

- 20 (error or notice): "Enter your email address."
- 43 (text): "If an account exists for"
- 44 (text): ", we&apos;ve sent a password reset link. Check your inbox."
- 48 (text): "Didn&apos;t get it? Check spam, or"
- 54 (text): "try again"
- 69 (text): "Email address"
- 97 (text): "Sending…"
- 100 (text): "Send reset link"

## apps/web/src/app/(auth)/forgot-password/page.tsx

- 24 (text): "Back to sign in"
- 29 (title): "Forgot password"
- 37 (text): "Remembered it?"
- 39 (text): "Sign in"
- 48 (text): "This workspace has no email delivery configured, so Harly cannot send a reset link. Sign in with another method (single sign-on or a passkey), or ask a workspace administrator to set a new password for you from the members settings."

## apps/web/src/app/(auth)/login/_components/login-form.tsx

- 63 (message): "Google"
- 64 (message): "LinkedIn"
- 65 (message): "Microsoft"
- 66 (message): "GitHub"
- 116 (error or notice): "Invalid email or password."
- 131 (error or notice): "Invalid email or password."
- 152 (error or notice): "Enter your email before requesting a magic link."
- 163 (error or notice): "Unable to send magic link. Check the email and try again."
- 179 (dynamic message): "`Unable to continue with ${SOCIAL_META[provider].label}.`"
- 184 (dynamic message): "`Unable to continue with ${SOCIAL_META[provider].label}.`"
- 194 (error or notice): "Enter your work email to continue with SSO."
- 206 (error or notice): "We couldn't find single sign-on for that email domain."
- 210 (error or notice): "Unable to start enterprise SSO."
- 228 (error or notice): "Unable to start passkey authentication."
- 263 (error or notice): "Passkey authentication was cancelled."
- 296 (error or notice): "Passkey verification failed."
- 302 (error or notice): "No passkey was selected or the request was cancelled. For an older passkey, choose ‘Use an older passkey’ and enter your email."
- 304 (error or notice): "Passkey authentication failed."
- 315 (error or notice): "Enter your email to use an older passkey."
- 335 (message): "Company SSO"
- 344 (message): "Magic link"
- 357 (text): "No sign-in methods are currently enabled for this workspace. Contact your workspace administrator."
- 372 (text): "Email address"
- 392 (text): "Password"
- 398 (text): "Forgot password?"
- 409 (placeholder): "Your password"
- 416 (aria-label): "Hide password"
- 416 (aria-label): "Show password"
- 426 (text): "Check your email for a sign-in link."
- 441 (text): "Work email"
- 454 (text): "Sign in with your organization&apos;s single sign-on."
- 459 (label): "Continue with SSO"
- 477 (text): "Check your email for a sign-in link."
- 489 (expression): "passkey"
- 490 (text): "Continue with passkey"
- 498 (text): "Use an older passkey"
- 503 (text): "Email used with your account"
- 515 (text): "This is for passkeys registered before discoverable sign-in was required."
- 522 (expression): "passkey"
- 523 (text): "Continue with older passkey"
- 564 (text): "Signing in…"
- 577 (text): "or"

## apps/web/src/app/(auth)/login/page.tsx

- 23 (title): "Sign in"

## apps/web/src/app/(auth)/reset-password/_components/reset-password-form.tsx

- 31 (error or notice): "Password must be at least 8 characters."
- 35 (error or notice): "Passwords don't match."
- 50 (error or notice): "This reset link is invalid or has expired. Request a new one."
- 55 (error or notice): "Password updated. Sign in with your new password."
- 66 (text): "This password reset link is invalid or has expired."
- 72 (text): "Request a new reset link"
- 85 (text): "New password"
- 97 (placeholder): "At least 8 characters"
- 107 (text): "Confirm password"
- 119 (placeholder): "Repeat your new password"
- 135 (text): "Updating…"
- 138 (text): "Update password"

## apps/web/src/app/(auth)/reset-password/page.tsx

- 27 (text): "Back to sign in"
- 32 (title): "Reset password"

## apps/web/src/app/(auth)/signup/_components/signup-form.tsx

- 36 (error or notice): "Full name is required."
- 37 (error or notice): "Email is required."
- 38 (error or notice): "Password must be at least 8 characters."
- 39 (error or notice): "Passwords do not match."
- 49 (error or notice): "Unable to create account."
- 70 (error or notice): "Unable to continue with Google."
- 74 (error or notice): "Unable to continue with Google."
- 84 (label): "Full name"
- 89 (placeholder): "Ada Lovelace"
- 95 (label): "Email address"
- 108 (text): "Password"
- 118 (placeholder): "At least 8 characters"
- 125 (aria-label): "Hide password"
- 125 (aria-label): "Show password"
- 137 (text): "Confirm password"
- 147 (placeholder): "Repeat your password"
- 154 (aria-label): "Hide password"
- 154 (aria-label): "Show password"
- 169 (expression): "email"
- 172 (text): "Creating account…"
- 175 (text): "Continue"
- 184 (text): "or"

## apps/web/src/app/(auth)/signup/page.tsx

- 31 (text): "Sign in"
- 36 (title): "Create your account"
- 40 (text): "Already have an account?"
- 42 (text): "Sign in"
- 50 (text): "Signups are invite-only."
- 53 (text): "This Harly workspace is already set up. Ask an admin to invite you — your invite link drops you straight into the right role."

## apps/web/src/app/change-password/_components/change-password-form.tsx

- 27 (error or notice): "Couldn't change password."
- 30 (error or notice): "Password updated."
- 39 (text): "New password"
- 49 (text): "Use at least 8 characters."
- 53 (text): "Confirm password"
- 63 (text): "Passwords do not match."
- 73 (text): "Set new password"

## apps/web/src/app/change-password/page.tsx

- 40 (text): "Action required"
- 43 (text): "Choose a new password"
- 46 (text): "Your account was set up with a temporary password. Pick a new one to continue."

## apps/web/src/app/invite/[invitationId]/page.tsx

- 38 (text): "Harly"
- 44 (text): "Sign in"
- 64 (text): "Invitation"
- 67 (text): "Join"
- 70 (text): "You were invited as"
- 74 (text): "using"
- 99 (text): "Invited by"
- 108 (expression): "pending"
- 110 (text): "This invitation is"
- 114 (text): "This invitation has expired."
- 123 (text): "Sign in to accept"
- 126 (text): "Sign in with"
- 130 (text): "to accept this invitation."
- 141 (text): "You are signed in as"
- 141 (text): ". This invitation belongs to"

## apps/web/src/app/join/[token]/page.tsx

- 28 (text): "Harly"
- 35 (text): "Sign in"
- 56 (text): "Invitation"
- 59 (text): "Join"
- 62 (text): "You&apos;ll join as"
- 76 (text): "Sign in to join"
- 79 (text): "Sign in or create an account to join this workspace."

## apps/web/src/app/no-workspace/page.tsx

- 35 (text): "Harly"
- 47 (text): "You need an invitation"
- 50 (text): "This Harly workspace is already set up. Ask an admin to invite"
- 54 (text): ", your invite link drops you straight into the right role."
- 59 (text): "Signed in as"

## apps/web/src/app/oauth/consent/page.tsx

- 33 (message): "The application's request was not valid."
- 35 (message): "This application is not registered or its metadata could not be verified."
- 36 (message): "The application's request is incomplete, or its redirect address does not match its registration."
- 40 (message): "The application did not say who it is (client_id is missing)."
- 42 (message): "This application is not registered with this Harly instance. In the app, remove the Harly connection and add it again so it registers itself. If it keeps failing, check that Settings > AI agents > Allow automatic app registration is on."
- 43 (message): "This application's registration expired. In the app, remove the Harly connection and add it again."
- 44 (message): "An administrator has blocked this application."
- 45 (message): "This application's client metadata document could not be fetched or verified."
- 46 (message): "The application did not say where to return after sign-in (redirect_uri is missing)."
- 48 (message): "The address this application wants to return to does not match the one it registered. Remove the Harly connection in the app and add it again."
- 61 (title): "This request can't be completed"
- 74 (title): "This request can't be completed"
- 166 (text): "Known app"
- 170 (text): "Unverified app"
- 174 (text): "Returns to"
- 179 (text): "Allow"
- 179 (text): "to use"
- 182 (text): "Signed in as"
- 182 (text): ". The app acts as you and can only do what your role in Harly allows."
- 187 (title): "Unverified app"
- 188 (text): "Harly doesn&apos;t recognise this app. Only continue if you started this connection yourself and trust"
- 189 (text): "with your hiring data."
- 201 (text): "Anything the app reads is sent to"
- 201 (text): ", which handles it under its own terms. You can disconnect it at any time in Settings &gt; AI agents."
- 211 (text): "Deny"
- 214 (text): "Allow access"
- 264 (text): "Continue to security setup"
- 268 (text): "Change password"

## apps/web/src/app/setup-2fa/_components/setup-2fa-form.tsx

- 48 (error or notice): "Invalid password"
- 67 (error or notice): "Invalid code , try again"
- 77 (error or notice): "Backup codes copied"
- 104 (text): "2FA is now active"
- 106 (text): "Store your backup codes in a safe place , each works once if you lose access to your authenticator."
- 120 (text): "Continue to dashboard"
- 132 (text): "Password"
- 137 (text): "Forgot password?"
- 150 (placeholder): "Enter your password"
- 157 (aria-label): "Hide password"
- 157 (aria-label): "Show password"
- 163 (text): "Confirm your password to generate an authenticator QR code."
- 173 (text): "Continue"
- 183 (text): "Scan this QR code with your authenticator app (Authy, Google Authenticator, 1Password…), then enter the 6-digit code to confirm."
- 200 (text): "Backup codes"
- 217 (text): "Copy"
- 226 (text): "Download"
- 234 (text): "Enter code from app"
- 257 (text): "Verify & Enable"

## apps/web/src/app/setup-2fa/page.tsx

- 61 (text): "Harly"
- 71 (alt): "Workspace"
- 80 (text): "Security required"
- 83 (text): "Set up two-factor authentication"
- 86 (text): "Your workspace requires 2FA. Set it up below to continue to the dashboard."

## Placeholders and dynamic copy

- `(auth)/login/_components/login-form.tsx`: `you@company.com` appears in the email and SSO fields.
- `(auth)/signup/_components/signup-form.tsx` and `(auth)/forgot-password/_components/forgot-password-form.tsx`: `you@company.com` is an example email.
- Invitation, join, sign-in and OAuth consent sentences combine text with names, email addresses, roles or provider labels. Review each complete sentence and retain the variable semantics.

## Additional review

- Authentication library and server responses can reach the UI directly. Trace provider error messages, OAuth consent errors, passkey responses, CAPTCHA errors and validation failures before marking this flow complete.
- Dynamic fragments and JSX expressions must be reviewed as complete messages, with variables and plural forms preserved.
- Include every keyboard, screen-reader, loading, retry, success and failure state when validating translations.
- The portal login, public setup, transactional emails and shared form components are outside this file list and require their own inventories.
