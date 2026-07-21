# Update template documents

`PUT /templates/{id}/documents`
**Pro / Cloud Sandbox plan required.**

The API endpoint allows you to add, remove or replace documents in the template with provided PDF/DOCX file or HTML content.


## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `integer` | yes | The unique identifier of the document template. |

## Request Body

| Property | Type | Required | Description |
|---|---|---|---|
| `documents` | `array[]` | no | The list of documents to add or replace in the template. |
| `documents[].name` | `string` | no | Document name. Random uuid will be assigned when not specified. Example: `Test Template` |
| `documents[].file` | `string` | no | Base64-encoded content of the PDF or DOCX file or downloadable file URL. Leave it empty if you create a new document using HTML param. |
| `documents[].html` | `string` | no | HTML template with field tags. Leave it empty if you add a document via PDF or DOCX base64 encoded file param or URL. |
| `documents[].position` | `integer` | no | Position of the document. By default will be added as the last document in the template. Example: `0` |
| `documents[].replace` | `boolean` | no | Set to `true` to replace existing document with a new file at `position`. Existing document fields will be transferred to the new document if it doesn't contain any fields. Default: `false` |
| `documents[].remove` | `boolean` | no | Set to `true` to remove existing document at given `position` or with given `name`. Default: `false` |
| `merge` | `boolean` | no | Set to `true` to merge all existing and new documents into a single PDF document in the template. Default: `false` |

## Code Examples

### cURL

```curl
curl --request PUT \
  --url https://api.docuseal.com/templates/1000001/documents \
  --header 'X-Auth-Token: API_KEY' \
  --header 'content-type: application/json' \
  --data '{"documents":[{"file":"string"}]}'
```
### CLI

```shell
docuseal templates update-documents 1000001 \
  -d "documents[0][file]=/path/to/file"
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/templates/1000001/documents", {
  method: "PUT",
  headers: {
    "X-Auth-Token": "API_KEY"
  },
  body: JSON.stringify({
    documents: [
      {
        file: "string"
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

const template = await docuseal.updateTemplateDocuments(1000001, {
  documents: [
    {
      file: "string"
    }
  ]
});
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const template = await docuseal.updateTemplateDocuments(1000001, {
  documents: [
    {
      file: "string"
    }
  ]
});
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.update_template_documents(1000001, {
  "documents": [
    {
      "file": "string"
    }
  ]
})
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.update_template_documents(1000001, {
  documents: [
    {
      file: "string"
    }
  ]
})
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->updateTemplateDocuments(1000001, [
  'documents' => [
    [
      'file' => 'string'
    ]
  ]
]);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

template, err := ds.UpdateTemplateDocuments(context.Background(), 1000001, &docuseal.UpdateTemplateDocumentsParams{
	Documents: []*docuseal.UpdateTemplateDocumentsDocumentParams{
		{
			File: "string",
		},
	},
})
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var template = await client.UpdateTemplateDocumentsAsync(1000001, new UpdateTemplateDocumentsParams
{
    Documents = [
        new UpdateTemplateDocumentsDocumentParams
        {
            File = "string"
        },
    ]
});
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var template = client.updateTemplateDocuments(1000001, UpdateTemplateDocumentsParams.builder()
    .documents(List.of(
      UpdateTemplateDocumentsDocumentParams.builder()
        .file("string")
        .build()))
    .build());
```

## Response Example

```json
{
  "id": 3,
  "slug": "ZQpF222rFBv71q",
  "name": "Demo Template",
  "schema": [
    {
      "name": "Demo Template",
      "attachment_uuid": "09a8bc73-a7a9-4fd9-8173-95752bdf0af5"
    }
  ],
  "fields": [
    {
      "name": "Name",
      "required": false,
      "type": "text",
      "uuid": "a06c49f6-4b20-4442-ac7f-c1040d2cf1ac",
      "submitter_uuid": "93ba628c-5913-4456-a1e9-1a81ad7444b3",
      "areas": [
        {
          "page": 0,
          "attachment_uuid": "09a8bc73-a7a9-4fd9-8173-95752bdf0af5",
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
      "uuid": "93ba628c-5913-4456-a1e9-1a81ad7444b3"
    }
  ],
  "author_id": 1,
  "archived_at": null,
  "created_at": "2023-12-14T15:50:21.799Z",
  "updated_at": "2023-12-14T15:50:21.799Z",
  "source": "api",
  "folder_id": 1,
  "folder_name": "Default",
  "external_id": "f0b4714f-e44b-4993-905b-68b4451eef8c",
  "author": {
    "id": 1,
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com"
  },
  "documents": [
    {
      "id": 3,
      "uuid": "09a8bc73-a7a9-4fd9-8173-95752bdf0af5",
      "url": "https://docuseal.com/file/hash/Test%20Template.pdf"
    }
  ]
}
```
