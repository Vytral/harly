# List all submissions

`GET /submissions`
The API endpoint provides the ability to retrieve a list of available submissions.


## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `template_id` | query | `integer` | no | The template ID allows you to receive only the submissions created from that specific template. |
| `status` | query | `string` | no | Filter submissions by status. |
| `q` | query | `string` | no | Filter submissions based on submitter's name, email or phone partial match. |
| `slug` | query | `string` | no | Filter submissions by unique slug. |
| `template_folder` | query | `string` | no | Filter submissions by template folder name. |
| `archived` | query | `boolean` | no | Returns only archived submissions when `true` and only active submissions when `false`. |
| `limit` | query | `integer` | no | The number of submissions to return. Default value is 10. Maximum value is 100. |
| `after` | query | `integer` | no | The unique identifier of the submission to start the list from. It allows you to receive only submissions with an ID greater than the specified value. Pass ID value from the `pagination.next` response to load the next batch of submissions. |
| `before` | query | `integer` | no | The unique identifier of the submission that marks the end of the list. It allows you to receive only submissions with an ID less than the specified value. |

## Code Examples

### cURL

```curl
curl --request GET \
  --url https://api.docuseal.com/submissions \
  --header 'X-Auth-Token: API_KEY'
```
### CLI

```shell
docuseal submissions list --limit 10
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/submissions", {
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

const { data, pagination } = await docuseal.listSubmissions({ limit: 10 });
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const { data, pagination } = await docuseal.listSubmissions({ limit: 10 });
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

Docuseal.list_submissions(limit: 10)
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->listSubmissions(['limit' => 10]);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

submissions, err := ds.GetSubmissions(context.Background(), &docuseal.GetSubmissionsParams{Limit: docuseal.Int(10)})
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submissions = await client.GetSubmissionsAsync(new GetSubmissionsParams { Limit = 10 });
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submissions = client.getSubmissions(GetSubmissionsParams.builder().limit(10).build());
```

## Response Example

```json
{
  "data": [
    {
      "id": 1,
      "name": null,
      "source": "link",
      "submitters_order": "random",
      "slug": "VyL4szTwYoSvXq",
      "status": "completed",
      "audit_log_url": "https://docuseal.com/file/hash/example.pdf",
      "combined_document_url": null,
      "expire_at": null,
      "completed_at": "2023-12-10T15:49:21.895Z",
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
          "created_at": "2023-12-10T15:48:17.173Z",
          "updated_at": "2023-12-14T15:50:21.799Z",
          "name": "John Doe",
          "phone": "+1234567890",
          "status": "completed",
          "role": "First Party",
          "metadata": {},
          "preferences": {}
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
      }
    }
  ],
  "pagination": {
    "count": 1,
    "next": 1,
    "prev": 1
  }
}
```
