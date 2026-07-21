# Get a submitter

`GET /submitters/{id}`
The API endpoint provides functionality to retrieve information about a submitter, along with the submitter documents and field values.


## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `integer` | yes | The unique identifier of the submitter. |

## Code Examples

### cURL

```curl
curl --request GET \
  --url https://api.docuseal.com/submitters/500001 \
  --header 'X-Auth-Token: API_KEY'
```
### CLI

```shell
docuseal submitters retrieve 500001
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/submitters/500001", {
  method: "GET",
  headers: {
    "X-Auth-Token": "API_KEY"
  }
});

const submitter = await resp.json();
```
### JavaScript SDK

```javascript
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submitter = await docuseal.getSubmitter(500001);
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submitter = await docuseal.getSubmitter(500001);
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.get_submitter(500001)
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.get_submitter(500001)
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->getSubmitter(500001);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

submitter, err := ds.GetSubmitter(context.Background(), 500001)
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submitter = await client.GetSubmitterAsync(500001);
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submitter = client.getSubmitter(500001);
```

## Response Example

```json
{
  "id": 7,
  "submission_id": 3,
  "uuid": "0954d146-db8c-4772-aafe-2effc7c0e0c0",
  "email": "submitter@example.com",
  "slug": "dsEeWrhRD8yDXT",
  "sent_at": "2023-12-14T15:45:49.011Z",
  "opened_at": "2023-12-14T15:48:23.011Z",
  "completed_at": "2023-12-10T15:49:21.701Z",
  "declined_at": null,
  "created_at": "2023-12-14T15:48:17.173Z",
  "updated_at": "2023-12-14T15:50:21.799Z",
  "name": "John Doe",
  "phone": "+1234567890",
  "status": "completed",
  "external_id": null,
  "metadata": {},
  "preferences": {},
  "template": {
    "id": 2,
    "name": "Example Template",
    "created_at": "2023-12-14T15:50:21.799Z",
    "updated_at": "2023-12-14T15:50:21.799Z"
  },
  "submission_events": [
    {
      "id": 12,
      "submitter_id": 7,
      "event_type": "view_form",
      "event_timestamp": "2023-12-14T15:47:17.351Z",
      "data": {}
    }
  ],
  "values": [
    {
      "field": "Full Name",
      "value": "John Doe"
    }
  ],
  "documents": [
    {
      "name": "sample-document",
      "url": "https://docuseal.com/file/hash/sample-document.pdf"
    }
  ],
  "role": "First Party"
}
```
