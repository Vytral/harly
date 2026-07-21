# Create a template from PDF

`POST /templates/pdf`
**Pro / Cloud Sandbox plan required.**

The API endpoint provides the functionality to create a fillable document template for a PDF file. Use `{{Field Name;role=Signer1;type=date}}` text tags to define fillable fields in the document. See [https://www.docuseal.com/examples/fieldtags.pdf](https://www.docuseal.com/examples/fieldtags.pdf) for more text tag formats. Or specify the exact pixel coordinates of the document fields using `fields` param.


## Request Body

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | no | Name of the template. Example: `Test PDF` |
| `folder_name` | `string` | no | The folder's name in which the template should be created. |
| `external_id` | `string` | no | Your application-specific unique string key to identify this template within your app. Existing template with specified `external_id` will be updated with a new PDF. Example: `unique-key` |
| `shared_link` | `boolean` | no | Set to `true` to make the template available via a shared link. This will allow anyone with the link to create a submission from this template. Default: `true` |
| `documents` | `array[]` | yes | An array of PDF documents to create a template. |
| `documents[].name` | `string` | yes | Name of the document. |
| `documents[].file` | `string` | yes | Base64-encoded content of the PDF file or downloadable file URL. Example: `base64` |
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
| `flatten` | `boolean` | no | Remove PDF form fields from the documents. Default: `false` |
| `remove_tags` | `boolean` | no | Pass `false` to disable the removal of {{text}} tags from the PDF. This can be used along with transparent text tags for faster and more robust PDF processing. Default: `true` |

## Code Examples

### cURL

```curl
curl --request POST \
  --url https://api.docuseal.com/templates/pdf \
  --header 'X-Auth-Token: API_KEY' \
  --header 'content-type: application/json' \
  --data '{"name":"Test PDF","documents":[{"name":"string","file":"base64","fields":[{"name":"string","areas":[{"x":0,"y":0,"w":0,"h":0,"page":1}]}]}]}'
```
### CLI

```shell
docuseal templates create-pdf --name "Test PDF" \
  -d "documents[0][name]=string" \
  -d "documents[0][file]=/path/to/file" \
  -d "documents[0][fields][0][name]=string" \
  -d "documents[0][fields][0][areas][0][x]=0" \
  -d "documents[0][fields][0][areas][0][y]=0" \
  -d "documents[0][fields][0][areas][0][w]=0" \
  -d "documents[0][fields][0][areas][0][h]=0" \
  -d "documents[0][fields][0][areas][0][page]=1"
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/templates/pdf", {
  method: "POST",
  headers: {
    "X-Auth-Token": "API_KEY"
  },
  body: JSON.stringify({
    name: "Test PDF",
    documents: [
      {
        name: "string",
        file: "base64",
        fields: [
          {
            name: "string",
            areas: [
              {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                page: 1
              }
            ]
          }
        ]
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

const template = await docuseal.createTemplateFromPdf({
  name: "Test PDF",
  documents: [
    {
      name: "string",
      file: "base64",
      fields: [
        {
          name: "string",
          areas: [
            {
              x: 0,
              y: 0,
              w: 0,
              h: 0,
              page: 1
            }
          ]
        }
      ]
    }
  ]
});
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const template = await docuseal.createTemplateFromPdf({
  name: "Test PDF",
  documents: [
    {
      name: "string",
      file: "base64",
      fields: [
        {
          name: "string",
          areas: [
            {
              x: 0,
              y: 0,
              w: 0,
              h: 0,
              page: 1
            }
          ]
        }
      ]
    }
  ]
});
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.create_template_from_pdf({
  "name": "Test PDF",
  "documents": [
    {
      "name": "string",
      "file": "base64",
      "fields": [
        {
          "name": "string",
          "areas": [
            {
              "x": 0,
              "y": 0,
              "w": 0,
              "h": 0,
              "page": 1
            }
          ]
        }
      ]
    }
  ]
})
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.create_template_from_pdf({
  name: "Test PDF",
  documents: [
    {
      name: "string",
      file: "base64",
      fields: [
        {
          name: "string",
          areas: [
            {
              x: 0,
              y: 0,
              w: 0,
              h: 0,
              page: 1
            }
          ]
        }
      ]
    }
  ]
})
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->createTemplateFromPdf([
  'name' => 'Test PDF',
  'documents' => [
    [
      'name' => 'string',
      'file' => 'base64',
      'fields' => [
        [
          'name' => 'string',
          'areas' => [
            [
              'x' => 0,
              'y' => 0,
              'w' => 0,
              'h' => 0,
              'page' => 1
            ]
          ]
        ]
      ]
    ]
  ]
]);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

template, err := ds.CreateTemplateFromPdf(context.Background(), &docuseal.CreateTemplateFromPdfParams{
	Name: "Test PDF",
	Documents: []*docuseal.CreateTemplateFromPdfDocumentParams{
		{
			Name: "string",
			File: "base64",
			Fields: []*docuseal.CreateTemplateDocumentFieldParams{
				{
					Name: "string",
					Areas: []*docuseal.CreateTemplateDocumentFieldAreaParams{
						{
							X: 0,
							Y: 0,
							W: 0,
							H: 0,
							Page: 1,
						},
					},
				},
			},
		},
	},
})
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var template = await client.CreateTemplateFromPdfAsync(new CreateTemplateFromPdfParams
{
    Name = "Test PDF",
    Documents = [
        new CreateTemplateFromPdfDocumentParams
        {
            Name = "string",
            File = "base64",
            Fields = [
                new CreateTemplateDocumentFieldParams
                {
                    Name = "string",
                    Areas = [
                        new CreateTemplateDocumentFieldAreaParams
                        {
                            X = 0,
                            Y = 0,
                            W = 0,
                            H = 0,
                            Page = 1
                        },
                    ]
                },
            ]
        },
    ]
});
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var template = client.createTemplateFromPdf(CreateTemplateFromPdfParams.builder()
    .documents(List.of(
      CreateTemplateFromPdfDocumentParams.builder()
        .name("string")
        .file("base64")
        .fields(List.of(
          CreateTemplateDocumentFieldParams.builder()
            .name("string")
            .areas(List.of(
              CreateTemplateDocumentFieldAreaParams.builder()
                .x(0)
                .y(0)
                .w(0)
                .h(0)
                .page(1)
                .build()))
            .build()))
        .build()))
    .name("Test PDF")
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
      "url": "https://docuseal.com/file/hash/Demo%20PDF.pdf"
    }
  ]
}
```

## Related Guides

- [Use embedded text field tags in the PDF to create a fillable form](use-embedded-text-field-tags-in-the-pdf-to-create-a-fillable-form.md)
