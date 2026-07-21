# Signing Form - Security Recommendations

## Embedding page URL must not be enumerable

DocuSeal's own signing URLs are random and non-enumerable:

- `/d/{slug}` - template signing URL. Example: `/d/A2b3L6J4H3N3`.
- `/s/{slug}` - per-signer URL returned by `POST /submissions`. Example: `/s/a7K4n8H3L1u`.

The page in **your** application that embeds `<docuseal-form>` must not undo this guarantee. If you serve the embedding page at a URL like `https://yourapp.com/contracts/123/sign`, an attacker can iterate the integer ID (`/contracts/124/sign`, `/contracts/125/sign`, ...) and reach other users' signing forms even though the DocuSeal slug inside is random.

Common approaches:

- Put the DocuSeal slug in your own URL: `https://yourapp.com/sign/{docuseal_slug}`.
- Use your own non-enumerable identifier (UUID, random token) instead of the database integer.
- Require authentication on the embedding page and verify the current user owns the contract before rendering `<docuseal-form>`. This is the strongest defense and the only one that helps when the document must be tied to a specific user.

These can be combined for defense in depth.

## Authorize before exposing a signing URL

`/d/{slug}` and `/s/{slug}` are bearer URLs. Anyone with the link can open the form. To restrict a signing flow to a specific authenticated user:

- Create a per-signer URL via `POST /submissions` (returns `/s/{slug}`) instead of sharing the template URL.
- Set `send_email: false` if you want to control delivery.
- Require login on the page that embeds `<docuseal-form>`.
- Set `external_id` to bind the submitter to your internal user, and verify it on webhook events.
- Disable the shared template link on the template (`shared_link: false` / "Shared link" off in the dashboard) when you only want per-signer `/s/{slug}` URLs.

## Per-submitter 2FA

When creating the signer through `POST /submissions` or `POST /submitters`, pass `require_email_2fa: true` or `require_phone_2fa: true` on the submitter. Code verification happens before the embedded `<docuseal-form>` exposes the document.

## Client-supplied field values

`data-values` pre-fills fields in the browser. A signer can open devtools and change them before submitting.

If a field value must be immutable, mark the field as readonly server-side. Common ways:

- `POST /submissions` (or `POST /submitters`) with `fields[].default_value` and `readonly: true` on that field.
- `POST /submissions` (or `POST /submitters`) with the field name listed in `readonly_fields`.
- Mark the field as readonly directly in the template.

DocuSeal enforces immutability only when the field is marked readonly server-side; client-side component attributes can't achieve that.

## Token authentication for completed document preview

`<docuseal-form>` in `preview` mode for a completed submission requires a `data-token` JWT by default. Always issue this token from your backend - do not rely on a public preview link to gate access to signed PDFs.

`data-token` is a JWT (HS256) signed with your DocuSeal API key.

- Sign tokens only on the backend. Never ship the API key to the browser.
- The `X-Auth-Token` API key and the JWT signing secret are the same value. Leaking either compromises both.

Use a token to carry parameters that the client must not be able to forge: `preview: true`, the bound `slug`, `external_id`, and `email`. The token authenticates that those values came from your backend.

See [signing-form-completed-preview-jwt-token.md](signing-form-completed-preview-jwt-token.md) for backend code examples.

## Do not trust client completion events by default

`completed` and `declined` browser events fire in the user's browser and can be forged. You can keep using these JS callbacks, but never treat them as proof that a document was signed. Before any state change (DB writes, fulfillment, charging), confirm the real status with an authoritative source.

Two ways to get that authoritative status:

- Revalidate via the API. When a client event fires, call the respective endpoint (for example `GET /submissions/{id}` or `GET /submitters/{id}`) and act only on the status it returns.
- Or use webhooks. Drive state changes from `form.completed` and `form.declined` webhook events, and verify the HMAC signature on every webhook.

Either way, treat client events as UI hints only.
