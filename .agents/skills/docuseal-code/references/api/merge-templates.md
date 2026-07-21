# Merge templates

`POST /templates/merge`
**Pro / Cloud Sandbox plan required.**

The API endpoint allows you to merge multiple templates with documents and fields into a new combined template.


## Request Body

| Property | Type | Required | Description |
|---|---|---|---|
| `template_ids` | `array[]` | yes | An array of template ids to merge into a new template. Example: `[321, 432]` |
| `name` | `string` | no | Template name. Existing name with (Merged) suffix will be used if not specified. Example: `Merged Template` |
| `folder_name` | `string` | no | The name of the folder in which the merged template should be placed. |
| `external_id` | `string` | no | Your application-specific unique string key to identify this template within your app. |
| `shared_link` | `boolean` | no | Set to `true` to make the template available via a shared link. This will allow anyone with the link to create a submission from this template. Default: `true` |
| `roles` | `array[]` | no | An array of submitter role names to be used in the merged template. Example: `["Agent", "Customer"]` |

## Code Examples

### cURL

```curl
curl --request POST \
  --url https://api.docuseal.com/templates/merge \
  --header 'X-Auth-Token: API_KEY' \
  --header 'content-type: application/json' \
  --data '{"template_ids":[321,432],"name":"Merged Template"}'
```
### CLI

```shell
docuseal templates merge --name "Merged Template" \
  -d "template_ids[0]=321" \
  -d "template_ids[1]=432"
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/templates/merge", {
  method: "POST",
  headers: {
    "X-Auth-Token": "API_KEY"
  },
  body: JSON.stringify({
    template_ids: [
      321,
      432
    ],
    name: "Merged Template"
  })
});

const template = await resp.json();
```
### JavaScript SDK

```javascript
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const template = await docuseal.mergeTemplates({
  template_ids: [
    321,
    432
  ],
  name: "Merged Template"
});
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const template = await docuseal.mergeTemplates({
  template_ids: [
    321,
    432
  ],
  name: "Merged Template"
});
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.merge_templates({
  "template_ids": [
    321,
    432
  ],
  "name": "Merged Template"
})
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.merge_templates({
  template_ids: [
    321,
    432
  ],
  name: "Merged Template"
})
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->mergeTemplates([
  'template_ids' => [
    321,
    432
  ],
  'name' => 'Merged Template'
]);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

template, err := ds.MergeTemplate(context.Background(), &docuseal.MergeTemplateParams{
	TemplateIDs: []int{321, 432},
	Name: "Merged Template",
})
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var template = await client.MergeTemplateAsync(new MergeTemplateParams
{
    TemplateIds = [321, 432],
    Name = "Merged Template"
});
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var template = client.mergeTemplate(MergeTemplateParams.builder()
    .templateIds(List.of(321, 432))
    .name("Merged Template")
    .build());
```

## Response Example

```json
{
  "id": 6,
  "slug": "Xc7opTqwwV9P7x",
  "name": "Merged Template",
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
