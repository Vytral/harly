# Create submissions from emails

`POST /submissions/emails`
This API endpoint allows you to create submissions for a document template and send them to the specified email addresses. This is a simplified version of the POST /submissions API to be used with Zapier or other automation tools.


## Request Body

| Property | Type | Required | Description |
|---|---|---|---|
| `template_id` | `integer` | yes | The unique identifier of the template. Example: `1000001` |
| `emails` | `string` | yes | A comma-separated list of email addresses to send the submission to. Example: `hi@docuseal.com, example@docuseal.com` |
| `send_email` | `boolean` | no | Set `false` to disable signature request emails sending. Default: `true` |
| `message` | `object` | no | Custom signature request email message. |
| `message.subject` | `string` | no | Custom signature request email subject. |
| `message.body` | `string` | no | Custom signature request email body. Can include variables such as {{template.name}}, {{submission.name}}, {{submitter.link}}, {{account.name}}. |

## Code Examples

### cURL

```curl
curl --request POST \
  --url https://api.docuseal.com/submissions/emails \
  --header 'X-Auth-Token: API_KEY' \
  --header 'content-type: application/json' \
  --data '{"template_id":1000001,"emails":"hi@docuseal.com, example@docuseal.com"}'
```
### CLI

```shell
docuseal submissions create --template-id 1000001 --emails hi@docuseal.com, example@docuseal.com
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/submissions/emails", {
  method: "POST",
  headers: {
    "X-Auth-Token": "API_KEY"
  },
  body: JSON.stringify({
    template_id: 1000001,
    emails: "hi@docuseal.com, example@docuseal.com"
  })
});

const submitters = await resp.json();
```
### JavaScript SDK

```javascript
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submission = await docuseal.createSubmissionFromEmails({
  template_id: 1000001,
  emails: "hi@docuseal.com, example@docuseal.com"
});
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submission = await docuseal.createSubmissionFromEmails({
  template_id: 1000001,
  emails: "hi@docuseal.com, example@docuseal.com"
});
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.create_submission_from_emails({
  "template_id": 1000001,
  "emails": "hi@docuseal.com, example@docuseal.com"
})
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.create_submission_from_emails({
  template_id: 1000001,
  emails: "hi@docuseal.com, example@docuseal.com"
})
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->createSubmissionFromEmails([
  'template_id' => 1000001,
  'emails' => 'hi@docuseal.com, example@docuseal.com'
]);
```

## Response Example

```json
[
  {
    "id": 1,
    "submission_id": 1,
    "uuid": "884d545b-3396-49f1-8c07-05b8b2a78755",
    "email": "john.doe@example.com",
    "slug": "pAMimKcyrLjqVt",
    "sent_at": "2023-12-13T23:04:04.252Z",
    "opened_at": null,
    "completed_at": null,
    "declined_at": null,
    "created_at": "2023-12-14T15:50:21.799Z",
    "updated_at": "2023-12-14T15:50:21.799Z",
    "name": "string",
    "phone": "+1234567890",
    "external_id": "2321",
    "metadata": {
      "customData": "custom value"
    },
    "status": "sent",
    "values": [
      {
        "field": "Full Name",
        "value": "John Doe"
      }
    ],
    "preferences": {
      "send_email": true,
      "send_sms": false
    },
    "role": "First Party",
    "embed_src": "https://docuseal.com/s/pAMimKcyrLjqVt"
  },
  {
    "id": 2,
    "submission_id": 1,
    "uuid": "884d545b-3396-49f1-8c07-05b8b2a78755",
    "email": "alan.smith@example.com",
    "slug": "SEwc65vHNDH3QS",
    "sent_at": "2023-12-13T23:04:04.252Z",
    "opened_at": null,
    "completed_at": null,
    "declined_at": null,
    "created_at": "2023-12-14T15:50:21.799Z",
    "updated_at": "2023-12-14T15:50:21.799Z",
    "name": "string",
    "phone": "+1234567890",
    "external_id": "2321",
    "metadata": {
      "customData": "custom value"
    },
    "status": "sent",
    "values": [
      {
        "field": "Full Name",
        "value": "Roe Moe"
      }
    ],
    "preferences": {
      "send_email": true,
      "send_sms": false
    },
    "role": "First Party",
    "embed_src": "SEwc65vHNDH3QS"
  }
]
```
