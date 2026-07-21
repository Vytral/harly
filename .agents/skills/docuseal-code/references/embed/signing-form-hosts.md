# Hosts Configuration — Signing Form

DocuSeal runs in three environments. Pick the correct `src` URL and — for EU Cloud and self-hosted — set the `host`/`data-host` attribute so `<docuseal-form>` talks to the right backend.

## Global Cloud (default)

- App URL: `https://docuseal.com`
- CDN: `https://cdn.docuseal.com`
- `host` attribute is **not** required.

```html
<script src="https://cdn.docuseal.com/js/form.js"></script>

<docuseal-form
  data-src="https://docuseal.com/d/TEMPLATE_SLUG"
  data-email="signer@example.com">
</docuseal-form>
```

## EU Cloud

- App URL: `https://docuseal.eu`
- CDN: `https://cdn.docuseal.eu`
- `host`/`data-host` is **required**.

```html
<script src="https://cdn.docuseal.eu/js/form.js"></script>

<docuseal-form
  data-host="cdn.docuseal.eu"
  data-src="https://docuseal.eu/d/TEMPLATE_SLUG"
  data-email="signer@example.com">
</docuseal-form>
```

## Self-hosted / On-premises

- App URL: `https://docuseal.yourdomain.com`
- CDN: `https://docuseal.yourdomain.com`
- `host`/`data-host` is **required**.
- Serve `form.js` / `builder.js` from the same host as your DocuSeal instance.

```html
<script src="https://docuseal.yourdomain.com/js/form.js"></script>

<docuseal-form
  data-host="docuseal.yourdomain.com"
  data-src="https://docuseal.yourdomain.com/d/TEMPLATE_SLUG"
  data-email="signer@example.com">
</docuseal-form>
```

## API base URL (backend SDKs)

| Environment | `api.*` base URL |
|---|---|
| Global Cloud | `https://api.docuseal.com` |
| EU Cloud | `https://api.docuseal.eu` |
| Self-hosted | `https://docuseal.yourdomain.com/api` |

## React / Vue / Angular

Pass the `host` prop in the same way. Example (React, EU Cloud):

```jsx
import { DocusealForm } from '@docuseal/react'

export default function App() {
  return (
    <DocusealForm
      host="cdn.docuseal.eu"
      src="https://docuseal.eu/d/TEMPLATE_SLUG"
      email="signer@example.com"
    />
  )
}
```
