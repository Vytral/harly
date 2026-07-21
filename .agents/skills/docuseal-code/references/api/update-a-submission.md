# Update a submission

`PUT /submissions/{id}`
The API endpoint allows you to update a submission: change its name, expiration date, and archive or unarchive it.


## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `integer` | yes | The unique identifier of the submission. |

## Request Body

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | no | The name of the submission. Example: `New Submission Name` |
| `expire_at` | `string` | no | The date and time when the submission will expire and no longer be available. Pass `null` to remove the expiration. Example: `2024-09-01 12:00:00 UTC` |
| `archived` | `boolean` | no | Set `true` to archive the submission or `false` to unarchive it. |

## Code Examples

### cURL

```curl
curl --request PUT \
  --url https://api.docuseal.com/submissions/1001 \
  --header 'X-Auth-Token: API_KEY' \
  --header 'content-type: application/json' \
  --data '{"name":"New Submission Name","expire_at":"2024-09-01 12:00:00 UTC","archived":true}'
```
### CLI

```shell
docuseal submissions update 1001 --name "New Submission Name" --expire-at "2024-09-01 12:00:00 UTC" \
  -d "archived=true"
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/submissions/1001", {
  method: "PUT",
  headers: {
    "X-Auth-Token": "API_KEY"
  },
  body: JSON.stringify({
    name: "New Submission Name",
    expire_at: "2024-09-01 12:00:00 UTC",
    archived: true
  })
});

const submission = await resp.json();
```
### JavaScript SDK

```javascript
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submission = await docuseal.updateSubmission(1001, {
  name: "New Submission Name",
  expire_at: "2024-09-01 12:00:00 UTC",
  archived: true
});
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submission = await docuseal.updateSubmission(1001, {
  name: "New Submission Name",
  expire_at: "2024-09-01 12:00:00 UTC",
  archived: true
});
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.update_submission(1001, {
  "name": "New Submission Name",
  "expire_at": "2024-09-01 12:00:00 UTC",
  "archived": True
})
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.update_submission(1001, {
  name: "New Submission Name",
  expire_at: "2024-09-01 12:00:00 UTC",
  archived: true
})
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->updateSubmission(1001, [
  'name' => 'New Submission Name',
  'expire_at' => '2024-09-01 12:00:00 UTC',
  'archived' => true
]);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

submission, err := ds.UpdateSubmission(context.Background(), 1001, &docuseal.UpdateSubmissionParams{
	Name: "New Submission Name",
	ExpireAt: "2024-09-01 12:00:00 UTC",
	Archived: docuseal.Bool(true),
})
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submission = await client.UpdateSubmissionAsync(1001, new UpdateSubmissionParams
{
    Name = "New Submission Name",
    ExpireAt = "2024-09-01 12:00:00 UTC",
    Archived = true
});
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submission = client.updateSubmission(1001, UpdateSubmissionParams.builder()
    .name("New Submission Name")
    .expireAt("2024-09-01 12:00:00 UTC")
    .archived(true)
    .build());
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
  "documents": [
    {
      "name": "example",
      "url": "https://docuseal.com/file/hash/example.pdf"
    }
  ],
  "status": "completed"
}
```
