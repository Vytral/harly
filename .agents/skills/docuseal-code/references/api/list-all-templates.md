# List all templates

`GET /templates`
The API endpoint provides the ability to retrieve a list of available document templates.


## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `q` | query | `string` | no | Filter templates based on the name partial match. |
| `slug` | query | `string` | no | Filter templates by unique slug. |
| `external_id` | query | `string` | no | The unique application-specific identifier provided for the template via API or Embedded template form builder. It allows you to receive only templates with your specified external ID. |
| `folder` | query | `string` | no | Filter templates by folder name. |
| `archived` | query | `boolean` | no | List only archived templates instead of active ones. |
| `shared` | query | `boolean` | no | List templates shared with test mode. |
| `limit` | query | `integer` | no | The number of templates to return. Default value is 10. Maximum value is 100. |
| `after` | query | `integer` | no | The unique identifier of the template to start the list from. It allows you to receive only templates with an ID greater than the specified value. Pass ID value from the `pagination.next` response to load the next batch of templates. |
| `before` | query | `integer` | no | The unique identifier of the template to end the list with. It allows you to receive only templates with an ID less than the specified value. |

## Code Examples

### cURL

```curl
curl --request GET \
  --url https://api.docuseal.com/templates \
  --header 'X-Auth-Token: API_KEY'
```
### CLI

```shell
docuseal templates list --limit 10
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/templates", {
  method: "GET",
  headers: {
    "X-Auth-Token": "API_KEY"
  }
});

const { data, pagination } = await resp.json();
```
### JavaScript SDK

```javascript
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const { data, pagination } = await docuseal.listTemplates({ limit: 10 });
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const { data, pagination } = await docuseal.listTemplates({ limit: 10 });
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.list_submissions({ "limit": 10 })
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.list_templates(limit: 10)
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->listTemplates(['limit' => 10]);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

templates, err := ds.GetTemplates(context.Background(), &docuseal.GetTemplatesParams{Limit: docuseal.Int(10)})
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var templates = await client.GetTemplatesAsync(new GetTemplatesParams { Limit = 10 });
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var templates = client.getTemplates(GetTemplatesParams.builder().limit(10).build());
```

## Response Example

```json
{
  "data": [
    {
      "id": 1,
      "slug": "iRgjDX7WDK6BRo",
      "name": "Example Template",
      "preferences": {},
      "schema": [
        {
          "attachment_uuid": "d94e615f-76e3-46d5-8f98-36bdacb8664a",
          "name": "example-document"
        }
      ],
      "fields": [
        {
          "uuid": "594bdf04-d941-4ca6-aa73-93e61d625c02",
          "submitter_uuid": "0954d146-db8c-4772-aafe-2effc7c0e0c0",
          "name": "Full Name",
          "type": "text",
          "required": true,
          "preferences": {},
          "areas": [
            {
              "x": 0.2638888888888889,
              "y": 0.168958742632613,
              "w": 0.325,
              "h": 0.04616895874263263,
              "attachment_uuid": "d94e615f-76e3-46d5-8f98-36bdacb8664a",
              "page": 0
            }
          ]
        }
      ],
      "submitters": [
        {
          "name": "First Party",
          "uuid": "0954d146-db8c-4772-aafe-2effc7c0e0c0"
        }
      ],
      "author_id": 1,
      "archived_at": null,
      "created_at": "2023-12-14T15:21:57.375Z",
      "updated_at": "2023-12-14T15:22:55.094Z",
      "source": "native",
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
          "id": 5,
          "uuid": "d94e615f-76e3-46d5-8f98-36bdacb8664a",
          "url": "https://docuseal.com/file/hash/sample-document.pdf",
          "preview_image_url": "https://docuseal.com/file/hash/0.jpg",
          "filename": "example-document.pdf"
        }
      ]
    }
  ],
  "pagination": {
    "count": 1,
    "next": 1,
    "prev": 2
  }
}
```
