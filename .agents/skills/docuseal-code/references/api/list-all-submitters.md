# List all submitters

`GET /submitters`
The API endpoint provides the ability to retrieve a list of submitters.


## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `submission_id` | query | `integer` | no | The submission ID allows you to receive only the submitters related to that specific submission. |
| `q` | query | `string` | no | Filter submitters on name, email or phone partial match. |
| `slug` | query | `string` | no | Filter submitters by unique slug. |
| `completed_after` | query | `string` | no | The date and time string value to filter submitters that completed the submission after the specified date and time. |
| `completed_before` | query | `string` | no | The date and time string value to filter submitters that completed the submission before the specified date and time. |
| `external_id` | query | `string` | no | The unique application-specific identifier provided for a submitter when initializing a signature request. It allows you to receive only submitters with a specified external ID. |
| `limit` | query | `integer` | no | The number of submitters to return. Default value is 10. Maximum value is 100. |
| `after` | query | `integer` | no | The unique identifier of the submitter to start the list from. It allows you to receive only submitters with an ID greater than the specified value. Pass ID value from the `pagination.next` response to load the next batch of submitters. |
| `before` | query | `integer` | no | The unique identifier of the submitter to end the list with. It allows you to receive only submitters with an ID less than the specified value. |

## Code Examples

### cURL

```curl
curl --request GET \
  --url https://api.docuseal.com/submitters \
  --header 'X-Auth-Token: API_KEY'
```
### CLI

```shell
docuseal submitters list --limit 10
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/submitters", {
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

const { data, pagination } = await docuseal.listSubmitters({ limit: 10 });
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const { data, pagination } = await docuseal.listSubmitters({ limit: 10 });
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

Docuseal.list_submitters(limit: 10)
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->listSubmitters(['limit' => 10]);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

submitters, err := ds.GetSubmitters(context.Background(), &docuseal.GetSubmittersParams{Limit: docuseal.Int(10)})
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submitters = await client.GetSubmittersAsync(new GetSubmittersParams { Limit = 10 });
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submitters = client.getSubmitters(GetSubmittersParams.builder().limit(10).build());
```

## Response Example

```json
{
  "data": [
    {
      "id": 7,
      "submission_id": 3,
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
      "status": "completed",
      "external_id": null,
      "preferences": {},
      "metadata": {},
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
          "event_timestamp": "2023-12-14T15:48:17.351Z",
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
          "url": "https://docuseal.com/file/eyJfcmFpbHMiOnsiIiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--f9758362acced0f3c86cdffad02800e/sample-document.pdf"
        }
      ],
      "role": "First Party"
    }
  ],
  "pagination": {
    "count": 1,
    "next": 1,
    "prev": 1
  }
}
```
