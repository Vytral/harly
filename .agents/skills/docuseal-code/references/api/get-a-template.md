# Get a template

`GET /templates/{id}`
The API endpoint provides the functionality to retrieve information about a document template.


## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `integer` | yes | The unique identifier of the document template. |

## Code Examples

### cURL

```curl
curl --request GET \
  --url https://api.docuseal.com/templates/1000001 \
  --header 'X-Auth-Token: API_KEY'
```
### CLI

```shell
docuseal templates retrieve 1000001
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/templates/1000001", {
  method: "GET",
  headers: {
    "X-Auth-Token": "API_KEY"
  }
});

const template = await resp.json();
```
### JavaScript SDK

```javascript
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const template = await docuseal.getTemplate(1000001);
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const template = await docuseal.getTemplate(1000001);
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.get_template(1000001)
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.get_template(1000001)
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->getTemplate(1000001);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

template, err := ds.GetTemplate(context.Background(), 1000001)
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var template = await client.GetTemplateAsync(1000001);
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var template = client.getTemplate(1000001);
```

## Response Example

```json
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
```
