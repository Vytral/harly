# Archive a template

`DELETE /templates/{id}`
The API endpoint allows you to archive a document template.


## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `integer` | yes | The unique identifier of the document template. |

## Code Examples

### cURL

```curl
curl --request DELETE \
  --url https://api.docuseal.com/templates/1000001 \
  --header 'X-Auth-Token: API_KEY'
```
### CLI

```shell
docuseal templates archive 1000001
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/templates/1000001", {
  method: "DELETE",
  headers: {
    "X-Auth-Token": "API_KEY"
  }
});

await resp.json();
```
### JavaScript SDK

```javascript
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

await docuseal.archiveTemplate(1000001);
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

await docuseal.archiveTemplate(1000001);
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.archive_template(1000001)
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.archive_template(1000001)
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->archiveTemplate(1000001);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

_, err := ds.ArchiveTemplate(context.Background(), 1000001)
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

await client.ArchiveTemplateAsync(1000001);
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

client.archiveTemplate(1000001);
```

## Response Example

```json
{
  "id": 1,
  "archived_at": "2023-12-14T15:50:21.799Z"
}
```
