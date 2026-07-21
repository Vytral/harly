# Hosts Configuration — Form Builder

DocuSeal runs in three environments. Load `builder.js` from the matching CDN and — for EU Cloud and self-hosted — set the `host`/`data-host` attribute so `<docuseal-builder>` talks to the right backend. The `data-token` value is a JWT signed on your backend (see [form-builder-jwt-token.md](form-builder-jwt-token.md)).

## Global Cloud (default)

- App URL: `https://docuseal.com`
- CDN: `https://cdn.docuseal.com`
- `host` attribute is **not** required.

```html
<script src="https://cdn.docuseal.com/js/builder.js"></script>

<docuseal-builder
  data-token="<JWT_FROM_BACKEND>">
</docuseal-builder>
```

## EU Cloud

- App URL: `https://docuseal.eu`
- CDN: `https://cdn.docuseal.eu`
- `host`/`data-host` is **required**.

```html
<script src="https://cdn.docuseal.eu/js/builder.js"></script>

<docuseal-builder
  data-host="cdn.docuseal.eu"
  data-token="<JWT_FROM_BACKEND>">
</docuseal-builder>
```

## Self-hosted / On-premises

- App URL: `https://docuseal.yourdomain.com`
- CDN: `https://docuseal.yourdomain.com`
- `host`/`data-host` is **required**.
- Serve `form.js` / `builder.js` from the same host as your DocuSeal instance.

```html
<script src="https://docuseal.yourdomain.com/js/builder.js"></script>

<docuseal-builder
  data-host="docuseal.yourdomain.com"
  data-token="<JWT_FROM_BACKEND>">
</docuseal-builder>
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
import { DocusealBuilder } from '@docuseal/react'

export default function App({ token }) {
  return (
    <DocusealBuilder
      host="cdn.docuseal.eu"
      token={token}
    />
  )
}
```
