# Get a submission

`GET /submissions/{id}`
The API endpoint provides the functionality to retrieve information about a submission.


## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `integer` | yes | The unique identifier of the submission. |

## Code Examples

### cURL

```curl
curl --request GET \
  --url https://api.docuseal.com/submissions/1001 \
  --header 'X-Auth-Token: API_KEY'
```
### CLI

```shell
docuseal submissions retrieve 1001
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/submissions/1001", {
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

const submission = await docuseal.getSubmission(1001);
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submission = await docuseal.getSubmission(1001);
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.get_submission(1001)
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.get_submission(1001)
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->getSubmission(1001);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

submission, err := ds.GetSubmission(context.Background(), 1001)
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submission = await client.GetSubmissionAsync(1001);
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submission = client.getSubmission(1001);
```

## Response Example

```json
{
  "id": 1,
  "name": null,
  "source": "link",
  "submitters_order": "random",
  "slug": "VyL4szTwYoSvXq",
  "audit_log_url": "https://docuseal.com/blobs/proxy/hash/example.pdf",
  "combined_document_url": null,
  "completed_at": "2023-12-14T15:49:21.701Z",
  "expire_at": null,
  "created_at": "2023-12-10T15:48:17.166Z",
  "updated_at": "2023-12-10T15:49:21.895Z",
  "archived_at": null,
  "submitters": [
    {
      "id": 1,
      "submission_id": 1,
      "uuid": "0954d146-db8c-4772-aafe-2effc7c0e0c0",
      "email": "submitter@example.com",
      "slug": "dsEeWrhRD8yDXT",
      "sent_at": "2023-12-14T15:45:49.011Z",
      "opened_at": "2023-12-14T15:48:23.011Z",
      "completed_at": "2023-12-14T15:49:21.701Z",
      "declined_at": null,
      "created_at": "2023-12-14T15:48:17.173Z",
      "updated_at": "2023-12-14T15:50:21.799Z",
      "name": "John Doe",
      "phone": "+1234567890",
      "external_id": null,
      "status": "completed",
      "metadata": {},
      "values": [
        {
          "field": "Full Name",
          "value": "John Doe"
        }
      ],
      "documents": [
        {
          "name": "example",
          "url": "https://docuseal.com/blobs/proxy/hash/example.pdf"
        }
      ],
      "role": "First Party"
    }
  ],
  "template": {
    "id": 1,
    "name": "Example Template",
    "external_id": "Temp123",
    "folder_name": "Default",
    "created_at": "2023-12-14T15:50:21.799Z",
    "updated_at": "2023-12-14T15:50:21.799Z"
  },
  "created_by_user": {
    "id": 1,
    "first_name": "Bob",
    "last_name": "Smith",
    "email": "bob.smith@example.com"
  },
  "submission_events": [
    {
      "id": 1,
      "submitter_id": 2,
      "event_type": "view_form",
      "event_timestamp": "2023-12-14T15:47:24.566Z",
      "data": {}
    }
  ],
  "documents": [
    {
      "name": "example",
      "url": "https://docuseal.com/file/hash/example.pdf"
    }
  ],
  "status": "completed"
}
```
