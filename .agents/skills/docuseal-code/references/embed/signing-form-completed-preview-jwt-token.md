# JWT Token Generation — Signing Form (Completed / Preview)

JWT (HS256) signed with your DocuSeal API key. **Optional** for `<docuseal-form>` — use it for preview mode, displaying a completed document, `external_id`, pre-filled values, etc.

> Always generate JWT on the **backend**. Never expose your API key to the browser.

Get your API key: https://console.docuseal.com/api

## Payload

| Property | Type | Required | Description |
|---|---|---|---|
| `slug` | `string` | yes | Template or Submitter slug. When Submitter slug is used no need to pass additional email param. |
| `email` | `string` | no | Email address of the signer. Additional email form step will be displayed if the email attribute is not specified with Template slug. |
| `external_id` | `string` | no | Your application-specific unique string key to identify signer within your app. |
| `preview` | `boolean` | no | Show form in preview mode without ability to submit it. |

## Backend code examples

### Node.js

```javascript
const jwt = require('jsonwebtoken');

const API_KEY = process.env.DOCUSEAL_API_KEY; // Obtain from DocuSeal Console

const token = jwt.sign({
  slug: 'TEMPLATE_SLUG',
  email: 'signer@example.com',
  preview: true,
}, API_KEY);
```

### TypeScript

```typescript
import jwt from 'jsonwebtoken';

const API_KEY = process.env.DOCUSEAL_API_KEY; // Obtain from DocuSeal Console

interface JwtPayload {
  slug: string;
  email?: string;
  external_id?: string;
  preview?: boolean;
}

const payload: JwtPayload = {
  slug: 'TEMPLATE_SLUG',
  email: 'signer@example.com',
  preview: true,
};

const token = jwt.sign(payload, API_KEY);
```

### PHP

```php
use Firebase\JWT\JWT;

$apiToken = getenv('DOCUSEAL_API_KEY'); // Obtain from DocuSeal Console

$payload = [
  'slug' => 'TEMPLATE_SLUG',
  'email' => 'signer@example.com',
  'preview' => true,
];

$token = JWT::encode($payload, $apiToken, 'HS256');
```

### Python

```python
import jwt
import os

api_key = os.getenv('DOCUSEAL_API_KEY') # Obtain from DocuSeal Console

payload = {
  'slug': 'TEMPLATE_SLUG',
  'email': 'signer@example.com',
  'preview': True
}

token = jwt.encode(payload, api_key, algorithm='HS256')
```

### Ruby

```ruby
require 'jwt'

api_key = ENV['DOCUSEAL_API_KEY'] # Obtain from DocuSeal Console

payload = {
  slug: 'TEMPLATE_SLUG',
  email: 'signer@example.com',
  preview: true
}

token = JWT.encode(payload, api_key)
```

### Java

```java
import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;

public class JwtGenerator {
    public static void main(String[] args) {
        String apiKey = System.getenv("DOCUSEAL_API_KEY"); // Obtain from DocuSeal Console

        Algorithm algorithm = Algorithm.HMAC256(apiKey);

        String token = JWT.create()
                .withClaim("slug", "TEMPLATE_SLUG")
                .withClaim("email", "signer@example.com")
                .withClaim("preview", true)
                .sign(algorithm);

        System.out.println("Generated JWT: " + token);
    }
}
```

### C#

```csharp
using System;
using System.Security.Cryptography;
using System.Text;

class Program
{
  static void Main()
  {
    var secretKey = Encoding.UTF8.GetBytes("DOCUSEAL_API_KEY"); // Obtain from DocuSeal Console

    var token = GenerateJwt(secretKey);

    Console.WriteLine(token);
  }

  static string GenerateJwt(byte[] secretKey)
  {
    var payload = @"{
        ""slug"": ""TEMPLATE_SLUG"",
        ""email"": ""signer@example.com"",
        ""preview"": true
    }";
    var header = Base64UrlEncode(Encoding.UTF8.GetBytes("{\"alg\":\"HS256\",\"typ\":\"JWT\"}"));

    var payloadJson = Base64UrlEncode(Encoding.UTF8.GetBytes(payload));

    var headerPayload = $"{header}.{payloadJson}";

    using (var hmac = new HMACSHA256(secretKey))
    {
      var signatureBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(headerPayload));
      var signature = Base64UrlEncode(signatureBytes);

      return $"{headerPayload}.{signature}";
    }
  }

  static string Base64UrlEncode(byte[] data)
  {
    var base64 = Convert.ToBase64String(data);
    return base64.TrimEnd('=').Replace('+', '-').Replace('/', '_');
  }
}
```

### Go

```go
package main

import (
  "fmt"
  "log"
  "os"
  "github.com/golang-jwt/jwt/v5"
)

func main() {
  apiKey := os.Getenv("DOCUSEAL_API_KEY")

  claims := jwt.MapClaims{
    "slug":    "TEMPLATE_SLUG",
    "email":   "signer@example.com",
    "preview": true,
  }

  token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

  signedToken, err := token.SignedString([]byte(apiKey))
  if err != nil {
    log.Fatalf("Failed to sign token: %v", err)
  }

  fmt.Printf("Generated JWT: %s", signedToken)
}
```

## Pass the token to the component

The JWT payload carries `slug` (and optionally `preview`, `email`, `external_id`) — the component only needs `data-token`.

```html
<script src="https://cdn.docuseal.com/js/form.js"></script>

<docuseal-form data-token="<JWT_FROM_BACKEND>"></docuseal-form>
```

```jsx
import { DocusealForm } from '@docuseal/react'

export default function App({ token }) {
  return <DocusealForm token={token} />
}
```
