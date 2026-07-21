# JWT Token Generation — Form Builder

JWT (HS256) signed with your DocuSeal API key. **Required** for `<docuseal-builder>`.

> Always generate JWT on the **backend**. Never expose your API key to the browser.

Get your API key: https://console.docuseal.com/api

## Payload

| Property | Type | Required | Description |
|---|---|---|---|
| `user_email` | `string` | yes | Email of the owner of the API signing key - admin user email. |
| `integration_email` | `string` | no | Email of the user to create a template for. Example: `signer@example.com` |
| `template_id` | `number` | no | ID of the template to open in the form builder. Optional when `document_urls` are specified. |
| `external_id` | `string` | no | Your application-specific unique string key to identify this template within your app. |
| `folder_name` | `string` | no | The folder name in which the template should be created. |
| `document_urls` | `array` | no | An Array of URLs with PDF files to open in the form builder. Optional when `template_id` is specified. Example: `['https://www.irs.gov/pub/irs-pdf/fw9.pdf']` |
| `name` | `string` | no | New template name when creating a template with document\_urls specified. Example: `Integration W-9 Test Form` |
| `extract_fields` | `boolean` | no | Pass `false` to disable automatic PDF form fields extraction. PDF fields are automatically added by default. |

## Backend code examples

### Node.js

```javascript
const jwt = require('jsonwebtoken');

const API_KEY = process.env.DOCUSEAL_API_KEY; // Obtain from DocuSeal Console

const token = jwt.sign({
  user_email: 'admin@company.com',
  integration_email: 'saas-user@company.com',
  external_id: 'TestForm123',
  name: 'Integration W-9 Test Form',
  document_urls: ['https://www.irs.gov/pub/irs-pdf/fw9.pdf'],
}, API_KEY);
```

### TypeScript

```typescript
import jwt from 'jsonwebtoken';

const API_KEY = process.env.DOCUSEAL_API_KEY; // Obtain from DocuSeal Console

interface JwtPayload {
  user_email: string;
  integration_email: string;
  external_id: string;
  name: string;
  document_urls: string[];
}

const payload: JwtPayload = {
  user_email: 'admin@company.com',
  integration_email: 'saas-user@company.com',
  external_id: 'TestForm123',
  name: 'Integration W-9 Test Form',
  document_urls: ['https://www.irs.gov/pub/irs-pdf/fw9.pdf'],
};

const token = jwt.sign(payload, API_KEY);
```

### PHP

```php
use Firebase\JWT\JWT;

$apiToken = getenv('DOCUSEAL_API_KEY'); // Obtain from DocuSeal Console

$payload = [
  'user_email' => 'admin@company.com',
  'integration_email' => 'saas-user@company.com',
  'external_id' => 'TestForm123',
  'name' => 'Integration W-9 Test Form',
  'document_urls' => ['https://www.irs.gov/pub/irs-pdf/fw9.pdf'],
];

$token = JWT::encode($payload, $apiToken, 'HS256'); // Encode the payload into a JWT
```

### Python

```python
import jwt
import os

api_key = os.getenv('DOCUSEAL_API_KEY') # Obtain from DocuSeal Console

payload = {
  'user_email': 'admin@company.com',
  'integration_email': 'saas-user@company.com',
  'external_id': 'TestForm123',
  'name': 'Integration W-9 Test Form',
  'document_urls': ['https://www.irs.gov/pub/irs-pdf/fw9.pdf']
}

token = jwt.encode(payload, api_key, algorithm='HS256') # Encode the payload into a JWT
```

### Ruby

```ruby
require 'jwt'

api_key = ENV['DOCUSEAL_API_KEY'] # Obtain from DocuSeal Console

payload = {
  user_email: 'admin@company.com',
  integration_email: 'saas-user@company.com',
  external_id: 'TestForm123',
  name: 'Integration W-9 Test Form',
  document_urls: ['https://www.irs.gov/pub/irs-pdf/fw9.pdf']
}

token = JWT.encode(payload, api_key) # Encode the payload into a JWT
```

### Java

```java
import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;

import java.util.Arrays;

public class JwtGenerator {
    public static void main(String[] args) {
        String apiKey = System.getenv("DOCUSEAL_API_KEY"); // Obtain from DocuSeal Console

        Algorithm algorithm = Algorithm.HMAC256(apiKey);

        String token = JWT.create()
                .withClaim("user_email", "admin@company.com")
                .withClaim("integration_email", "saas-user@company.com")
                .withClaim("external_id", "TestForm123")
                .withClaim("name", "Integration W-9 Test Form")
                .withClaim("document_urls", Arrays.asList("https://www.irs.gov/pub/irs-pdf/fw9.pdf"))
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
        ""user_email"": ""admin@company.com"",
        ""integration_email"": ""saas-user@company.com"",
        ""external_id"": ""TestForm123"",
        ""name"": ""Integration W-9 Test Form"",
        ""document_urls"": [
            ""https://www.irs.gov/pub/irs-pdf/fw9.pdf""
        ]
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
  "time"
  "github.com/golang-jwt/jwt/v5"
)

func main() {
  // Obtain from DocuSeal Console
  apiKey := os.Getenv("DOCUSEAL_API_KEY")

  claims := jwt.MapClaims{
    "user_email":       "admin@company.com",
    "integration_email": "saas-user@company.com",
    "external_id":      "TestForm123",
    "name":             "Integration W-9 Test Form",
    "document_urls":    []string{"https://www.irs.gov/pub/irs-pdf/fw9.pdf"},
    "exp":              time.Now().Add(time.Hour * 24).Unix(),
  }

  token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

  signedToken, err := token.SignedString([]byte(apiKey))

  fmt.Printf("Generated JWT: %s", signedToken)
}
```

## Pass the token to the component

```html
<script src="https://cdn.docuseal.com/js/builder.js"></script>

<docuseal-builder data-token="<JWT_FROM_BACKEND>"></docuseal-builder>
```

```jsx
import { DocusealBuilder } from '@docuseal/react'

export default function App({ token }) {
  return <DocusealBuilder token={token} />
}
```
