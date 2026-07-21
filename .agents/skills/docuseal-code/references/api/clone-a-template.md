# Clone a template

`POST /templates/{id}/clone`
The API endpoint allows you to clone an existing template into a new template.


## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `integer` | yes | The unique identifier of the document template. |

## Request Body

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | no | Template name. Existing name with (Clone) suffix will be used if not specified. Example: `Cloned Template` |
| `folder_name` | `string` | no | The folder's name to which the template should be cloned. |
| `external_id` | `string` | no | Your application-specific unique string key to identify this template within your app. |

## Code Examples

### cURL

```curl
curl --request POST \
  --url https://api.docuseal.com/templates/1000001/clone \
  --header 'X-Auth-Token: API_KEY' \
  --header 'content-type: application/json' \
  --data '{"name":"Cloned Template"}'
```
### CLI

```shell
docuseal templates clone 1000001 --name "Cloned Template"
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/templates/1000001/clone", {
  method: "POST",
  headers: {
    "X-Auth-Token": "API_KEY"
  },
  body: JSON.stringify({
    name: "Cloned Template"
  })
});

const template = await resp.json();
```
### JavaScript SDK

```javascript
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const template = await docuseal.cloneTemplate(1000001, {
  name: "Cloned Template"
});
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const template = await docuseal.cloneTemplate(1000001, {
  name: "Cloned Template"
});
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.clone_template(1000001, {
  "name": "Cloned Template"
})
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.clone_template(1000001, {
  name: "Cloned Template"
})
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->cloneTemplate(1000001, [
  'name' => 'Cloned Template'
]);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

template, err := ds.CloneTemplate(context.Background(), 1000001, &docuseal.CloneTemplateParams{
	Name: "Cloned Template",
})
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var template = await client.CloneTemplateAsync(1000001, new CloneTemplateParams
{
    Name = "Cloned Template"
});
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var template = client.cloneTemplate(1000001, CloneTemplateParams.builder()
    .name("Cloned Template")
    .build());
```

## Response Example

```json
{
  "id": 6,
  "slug": "Xc7opTqwwV9P7x",
  "name": "Cloned Template",
  "schema": [
    {
      "attachment_uuid": "68aa0716-61f0-4535-9ba4-6c00f835b080",
      "name": "sample-document"
    }
  ],
  "fields": [
    {
      "uuid": "93c7065b-1b19-4551-b67b-9946bf1c11c9",
      "submitter_uuid": "ad128012-756d-4d17-b728-6f6b1d482bb5",
      "name": "Name",
      "type": "text",
      "required": true,
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
      "name": "First Party",
      "uuid": "ad128012-756d-4d17-b728-6f6b1d482bb5"
    }
  ],
  "author_id": 1,
  "archived_at": null,
  "created_at": "2023-12-14T15:50:21.799Z",
  "updated_at": "2023-12-14T15:50:21.799Z",
  "source": "api",
  "folder_id": 2,
  "folder_name": "Default",
  "external_id": null,
  "shared_link": true,
  "author": {
    "id": 1,
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com"
  },
  "documents": [
    {
      "id": 9,
      "uuid": "ded62277-9705-4fac-b5dc-58325d4102eb",
      "url": "https://docuseal.com/file/hash/sample-document.pdf",
      "filename": "sample-document.pdf"
    }
  ]
}
```
