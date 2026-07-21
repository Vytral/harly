# Create a template from Word DOCX

`POST /templates/docx`
**Pro / Cloud Sandbox plan required.**

The API endpoint provides the functionality to create a fillable document template for an existing Microsoft Word document. Use `{{Field Name;role=Signer1;type=date}}` text tags to define fillable fields in the document. See [https://www.docuseal.com/examples/fieldtags.docx](https://www.docuseal.com/examples/fieldtags.docx) for more text tag formats. Or specify the exact pixel coordinates of the document fields using `fields` param.


## Request Body

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | no | Name of the template. Example: `Test DOCX` |
| `external_id` | `string` | no | Your application-specific unique string key to identify this template within your app. Existing template with specified `external_id` will be updated with a new document. Example: `unique-key` |
| `folder_name` | `string` | no | The folder's name in which the template should be created. |
| `shared_link` | `boolean` | no | Set to `true` to make the template available via a shared link. This will allow anyone with the link to create a submission from this template. Default: `true` |
| `documents` | `array[]` | yes | An array of DOCX documents to create a template. |
| `documents[].name` | `string` | yes | Name of the document. |
| `documents[].file` | `string` | yes | Base64-encoded content of the DOCX file or downloadable file URL. Example: `base64` |
| `documents[].dynamic` | `boolean` | no | Set to `true` to make the document dynamic. When enabled, the DOCX document content can be edited or use [[variables]] in the template editor. Default: `false` |
| `documents[].fields` | `array[]` | no | Fields are optional if you use {{...}} text tags to define fields in the document. |
| `documents[].fields[].name` | `string` | no | Name of the field. |
| `documents[].fields[].type` | `string` | no | Type of the field (e.g., text, signature, date, initials). Values: `heading`, `text`, `signature`, `initials`, `date`, `number`, `image`, `checkbox`, `multiple`, `file`, `radio`, `select`, `cells`, `stamp`, `payment`, `phone`, `verification`, `kba`, `strikethrough`. |
| `documents[].fields[].role` | `string` | no | Role name of the signer. |
| `documents[].fields[].required` | `boolean` | no | Indicates if the field is required. |
| `documents[].fields[].title` | `string` | no | Field title displayed to the user instead of the name, shown on the signing form. Supports Markdown. |
| `documents[].fields[].description` | `string` | no | Field description displayed on the signing form. Supports Markdown. |
| `documents[].fields[].areas` | `array[]` | no | List of areas where the field is located in the document. |
| `documents[].fields[].options` | `array[]` | no | An array of option values for 'select' field type. Example: `["Option A", "Option B"]` |
| `documents[].fields[].validation` | `object` | no | Field validation rules. |
| `documents[].fields[].preferences` | `object` | no | Field display preferences. |

## Code Examples

### cURL

```curl
curl --request POST \
  --url https://api.docuseal.com/templates/docx \
  --header 'X-Auth-Token: API_KEY' \
  --header 'content-type: application/json' \
  --data '{"name":"Test DOCX","documents":[{"name":"string","file":"base64"}]}'
```
### CLI

```shell
docuseal templates create-docx --name "Test DOCX" \
  -d "documents[0][name]=string" \
  -d "documents[0][file]=/path/to/file"
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/templates/docx", {
  method: "POST",
  headers: {
    "X-Auth-Token": "API_KEY"
  },
  body: JSON.stringify({
    name: "Test DOCX",
    documents: [
      {
        name: "string",
        file: "base64"
      }
    ]
  })
});

const template = await resp.json();
```
### JavaScript SDK

```javascript
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const template = await docuseal.createTemplateFromDocx({
  name: "Test DOCX",
  documents: [
    {
      name: "string",
      file: "base64"
    }
  ]
});
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const template = await docuseal.createTemplateFromDocx({
  name: "Test DOCX",
  documents: [
    {
      name: "string",
      file: "base64"
    }
  ]
});
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.create_template_from_docx({
  "name": "Test DOCX",
  "documents": [
    {
      "name": "string",
      "file": "base64"
    }
  ]
})
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.create_template_from_docx({
  name: "Test DOCX",
  documents: [
    {
      name: "string",
      file: "base64"
    }
  ]
})
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->createTemplateFromDocx([
  'name' => 'Test DOCX',
  'documents' => [
    [
      'name' => 'string',
      'file' => 'base64'
    ]
  ]
]);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

template, err := ds.CreateTemplateFromDocx(context.Background(), &docuseal.CreateTemplateFromDocxParams{
	Name: "Test DOCX",
	Documents: []*docuseal.CreateTemplateFromDocxDocumentParams{
		{
			Name: "string",
			File: "base64",
		},
	},
})
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var template = await client.CreateTemplateFromDocxAsync(new CreateTemplateFromDocxParams
{
    Name = "Test DOCX",
    Documents = [
        new CreateTemplateFromDocxDocumentParams
        {
            Name = "string",
            File = "base64"
        },
    ]
});
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var template = client.createTemplateFromDocx(CreateTemplateFromDocxParams.builder()
    .documents(List.of(
      CreateTemplateFromDocxDocumentParams.builder()
        .name("string")
        .file("base64")
        .build()))
    .name("Test DOCX")
    .build());
```

## Response Example

```json
{
  "id": 5,
  "slug": "s3ff992CoPjvaX",
  "name": "Demo PDF",
  "schema": [
    {
      "name": "Demo PDF",
      "attachment_uuid": "48d2998f-266b-47e4-beb2-250ab7ccebdf"
    }
  ],
  "fields": [
    {
      "name": "Name",
      "type": "text",
      "required": true,
      "uuid": "d0bf3c0c-1928-40c8-80f9-d9f3c6ad4eff",
      "submitter_uuid": "0b0bff58-bc9a-475d-b4a9-2f3e5323faf7",
      "areas": [
        {
          "page": 1,
          "attachment_uuid": "48d2998f-266b-47e4-beb2-250ab7ccebdf",
          "x": 0.403158189124654,
          "y": 0.04211750189825361,
          "w": 0.100684625476058,
          "h": 0.01423690205011389
        }
      ]
    }
  ],
  "submitters": [
    {
      "name": "Submitter",
      "uuid": "0b0bff58-bc9a-475d-b4a9-2f3e5323faf7"
    }
  ],
  "author_id": 1,
  "archived_at": null,
  "created_at": "2023-12-14T15:50:21.799Z",
  "updated_at": "2023-12-14T15:50:21.799Z",
  "source": "api",
  "folder_id": 1,
  "folder_name": "Default",
  "external_id": "c248ffba-ef81-48b7-8e17-e3cecda1c1c5",
  "shared_link": true,
  "author": {
    "id": 1,
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com"
  },
  "documents": [
    {
      "id": 7,
      "uuid": "48d2998f-266b-47e4-beb2-250ab7ccebdf",
      "url": "https://docuseal.com/hash/DemoPDF.pdf"
    }
  ]
}
```

## Related Guides

- [Use embedded text field tags in the PDF to create a fillable form](use-embedded-text-field-tags-in-the-pdf-to-create-a-fillable-form.md)
