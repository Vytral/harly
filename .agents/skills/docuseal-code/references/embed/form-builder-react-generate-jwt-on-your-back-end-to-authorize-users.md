## Generate JWT on your back-end to authorize users

**Prerequisites:**

**Sign Up and Obtain API Key:** Visit [DocuSeal API Console](https://console.docuseal.com/api) to obtain your API key.

JWT (JSON Web Token) serves as a secure means to authorize your individual SaaS users with the DocuSeal document form builder. The token is generated with JWT payload parameters to grant access only for your specific SaaS user and only for a specific document:

- `user_email`: Email address of the DocuSeal admin user that provided the API\_KEY for JWT signing. 
- `integration_email`: Email address of your SaaS user that opens the document form builder. 
- `external_id`: Unique string to tag the opened document within the DocuSeal platform and to be able to reopen the form using this unique key. 
- `documents_urls[]`: An array with public and downloadable document URLs to be opened in the form builder. Pass empty array to allow users to upload their files. 
- `template_id`: ID of the existing template to open in the form builder - leave empty if `documents_urls[]` is specified. Templates can be created via the [HTML API](https://www.docuseal.com/guides/create-pdf-document-fillable-form-with-html-api) or [PDF export API](https://www.docuseal.com/guides/use-embedded-text-field-tags-in-the-pdf-to-create-a-fillable-form). 

Ensure you never expose API\_KEY on your client side, only generated and signed JWT should be passed to your front-end app.

#### Javascript

```
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

#### Typescript

```
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

#### Php

```
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

#### Python

```
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

#### Ruby

```
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

#### Java

```
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

#### Csharp

```
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

#### Go

```
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
    "user_email": "admin@company.com",
    "integration_email": "saas-user@company.com",
    "external_id": "TestForm123",
    "name": "Integration W-9 Test Form",
    "document_urls": []string{"https://www.irs.gov/pub/irs-pdf/fw9.pdf"},
    "exp": time.Now().Add(time.Hour * 24).Unix(),
  }

  token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

  signedToken, err := token.SignedString([]byte(apiKey))

  fmt.Printf("Generated JWT: %s", signedToken)
}
```
