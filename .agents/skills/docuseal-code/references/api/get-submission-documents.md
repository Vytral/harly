# Get submission documents

`GET /submissions/{id}/documents`
This endpoint returns a list of partially filled documents for a submission. If the submission has been completed, the final signed documents are returned.


## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `integer` | yes | The unique identifier of the submission. |
| `merge` | query | `boolean` | no | When `true`, merges all documents into a single PDF. |

## Code Examples

### cURL

```curl
curl --request GET \
  --url https://api.docuseal.com/submissions/1001/documents \
  --header 'X-Auth-Token: API_KEY'
```
### CLI

```shell
docuseal submissions documents 1001
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/submissions/1001/documents", {
  method: "GET",
  headers: {
    "X-Auth-Token": "API_KEY"
  }
});

const submission = await resp.json();
```
### JavaScript SDK

```javascript
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submission = await docuseal.getSubmissionDocuments(1001);
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submission = await docuseal.getSubmissionDocuments(1001);
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.get_submission_documents(1001)
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.get_submission_documents(1001)
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->getSubmissionDocuments(1001);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

submission, err := ds.GetSubmissionDocuments(context.Background(), 1001, nil)
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submission = await client.GetSubmissionDocumentsAsync(1001);
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submission = client.getSubmissionDocuments(1001);
```

## Response Example

```json
{
  "id": 1,
  "documents": [
    {
      "name": "example",
      "url": "https://docuseal.com/file/hash/example.pdf"
    }
  ]
}
```
