# Archive a submission

`DELETE /submissions/{id}`
The API endpoint allows you to archive a submission.


## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `integer` | yes | The unique identifier of the submission. |

## Code Examples

### cURL

```curl
curl --request DELETE \
  --url https://api.docuseal.com/submissions/1001 \
  --header 'X-Auth-Token: API_KEY'
```
### CLI

```shell
docuseal submissions archive 1001
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/submissions/1001", {
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

await docuseal.archiveSubmission(1001);
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

await docuseal.archiveSubmission(1001);
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.archive_submission(1001)
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.archive_submission(1001)
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->archiveSubmission(1001);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

_, err := ds.ArchiveSubmission(context.Background(), 1001)
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

await client.ArchiveSubmissionAsync(1001);
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

client.archiveSubmission(1001);
```

## Response Example

```json
{
  "id": 1,
  "archived_at": "2023-12-14T15:50:21.799Z"
}
```
