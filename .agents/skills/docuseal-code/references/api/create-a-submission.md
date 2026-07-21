# Create a submission

`POST /submissions`
This API endpoint allows you to create signature requests (submissions) for a document template and send them to the specified submitters (signers).


## Request Body

| Property | Type | Required | Description |
|---|---|---|---|
| `template_id` | `integer` | yes | The unique identifier of the template. Document template forms can be created via the Web UI, [PDF and DOCX API](https://www.docuseal.com/guides/use-embedded-text-field-tags-in-the-pdf-to-create-a-fillable-form), or [HTML API](https://www.docuseal.com/guides/create-pdf-document-fillable-form-with-html-api). Example: `1000001` |
| `send_email` | `boolean` | no | Set `false` to disable signature request emails sending. Default: `true` |
| `send_sms` | `boolean` | no | Set `true` to send signature request via phone number and SMS. Default: `false` |
| `order` | `string` | no | Pass 'random' to send signature request emails to all parties right away. The order is 'preserved' by default so the second party will receive a signature request email only after the document is signed by the first party. Default: `preserved` Values: `random`, `preserved`. |
| `completed_redirect_url` | `string` | no | Specify URL to redirect to after the submission completion. |
| `bcc_completed` | `string` | no | Specify BCC address to send signed documents to after the completion. |
| `reply_to` | `string` | no | Specify Reply-To address to use in the notification emails. |
| `expire_at` | `string` | no | Specify the expiration date and time after which the submission becomes unavailable for signature. Example: `2024-09-01 12:00:00 UTC` |
| `variables` | `object` | no | Dynamic content variables object. Variable values can be strings, numbers, arrays, objects, or HTML content used to generate styled text, paragraphs, and tables in dynamic template documents. Example: `{variable_name: "value"}` |
| `message` | `object` | no | Custom signature request email message. |
| `message.subject` | `string` | no | Custom signature request email subject. |
| `message.body` | `string` | no | Custom signature request email body. Can include variables such as {{template.name}}, {{submission.name}}, {{submitter.link}}, {{account.name}}. |
| `submitters` | `array[]` | yes | The list of submitters for the submission. |
| `submitters[].name` | `string` | no | The name of the submitter. |
| `submitters[].role` | `string` | no | The role name or title of the submitter. Example: `First Party` |
| `submitters[].email` | `string` | no | The email address of the submitter. Example: `john.doe@example.com` |
| `submitters[].phone` | `string` | no | The phone number of the submitter, formatted according to the E.164 standard. Example: `+1234567890` |
| `submitters[].values` | `object` | no | An object with pre-filled values for the submission. Use field names for keys of the object. For more configurations see `fields` param. |
| `submitters[].external_id` | `string` | no | Your application-specific unique string key to identify this submitter within your app. |
| `submitters[].completed` | `boolean` | no | Pass `true` to mark submitter as completed and auto-signed via API. |
| `submitters[].metadata` | `object` | no | Metadata object with additional submitter information. Example: `{ "customField": "value" }` |
| `submitters[].send_email` | `boolean` | no | Set `false` to disable signature request emails sending only for this submitter. Default: `true` |
| `submitters[].send_sms` | `boolean` | no | Set `true` to send signature request via phone number and SMS. Default: `false` |
| `submitters[].reply_to` | `string` | no | Specify Reply-To address to use in the notification emails for this submitter. |
| `submitters[].completed_redirect_url` | `string` | no | Submitter specific URL to redirect to after the submission completion. |
| `submitters[].order` | `integer` | no | The order of the submitter in the workflow (e.g., 0 for the first signer, 1 for the second, etc.). Use the same order number to create order groups. By default, submitters are ordered as in the submitters array. |
| `submitters[].require_phone_2fa` | `boolean` | no | Set to `true` to require phone 2FA verification via a one-time code sent to the phone number in order to access the documents. Default: `false` |
| `submitters[].require_email_2fa` | `boolean` | no | Set to `true` to require email 2FA verification via a one-time code sent to the email address in order to access the documents. Default: `false` |
| `submitters[].invite_by` | `string` | no | Set the role name of the previous party that should invite this party via email. |
| `submitters[].message` | `object` | no | Custom signature request email message for the submitter. |
| `submitters[].message.subject` | `string` | no | Custom signature request email subject for the submitter. |
| `submitters[].message.body` | `string` | no | Custom signature request email body for the submitter. Can include variables such as {{template.name}}, {{submission.name}}, {{submitter.link}}, {{account.name}}. |
| `submitters[].fields` | `array[]` | no | A list of configurations for template document form fields. |
| `submitters[].fields[].name` | `string` | yes | Document template field name. Example: `First Name` |
| `submitters[].fields[].default_value` | `string / integer / number / boolean / array` | no | Default value of the field. Use base64 encoded file or a public URL to the image file to set default signature or image fields. Example: `Acme` |
| `submitters[].fields[].readonly` | `boolean` | no | Set `true` to make it impossible for the submitter to edit predefined field value. Default: `false` |
| `submitters[].fields[].required` | `boolean` | no | Set `true` to make the field required. |
| `submitters[].fields[].title` | `string` | no | Field title displayed to the user instead of the name, shown on the signing form. Supports Markdown. |
| `submitters[].fields[].description` | `string` | no | Field description displayed on the signing form. Supports Markdown. |
| `submitters[].fields[].validation` | `object` | no | Field validation rules. |
| `submitters[].fields[].preferences` | `object` | no | Field display preferences. |
| `submitters[].roles` | `array[]` | no | A list of roles for the submitter. Use this param to merge multiple roles into one submitter. |

## Code Examples

### cURL

```curl
curl --request POST \
  --url https://api.docuseal.com/submissions \
  --header 'X-Auth-Token: API_KEY' \
  --header 'content-type: application/json' \
  --data '{"template_id":1000001,"send_email":true,"submitters":[{"role":"First Party","email":"john.doe@example.com"}]}'
```
### CLI

```shell
docuseal submissions create --template-id 1000001 --send-email \
  -d "submitters[0][role]=First Party" \
  -d "submitters[0][email]=john.doe@example.com"
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/submissions", {
  method: "POST",
  headers: {
    "X-Auth-Token": "API_KEY"
  },
  body: JSON.stringify({
    template_id: 1000001,
    send_email: true,
    submitters: [
      {
        role: "First Party",
        email: "john.doe@example.com"
      }
    ]
  })
});

const submitters = await resp.json();
```
### JavaScript SDK

```javascript
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submission = await docuseal.createSubmission({
  template_id: 1000001,
  send_email: true,
  submitters: [
    {
      role: "First Party",
      email: "john.doe@example.com"
    }
  ]
});
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submission = await docuseal.createSubmission({
  template_id: 1000001,
  send_email: true,
  submitters: [
    {
      role: "First Party",
      email: "john.doe@example.com"
    }
  ]
});
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.create_submission({
  "template_id": 1000001,
  "send_email": True,
  "submitters": [
    {
      "role": "First Party",
      "email": "john.doe@example.com"
    }
  ]
})
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.create_submission({
  template_id: 1000001,
  send_email: true,
  submitters: [
    {
      role: "First Party",
      email: "john.doe@example.com"
    }
  ]
})
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->createSubmission([
  'template_id' => 1000001,
  'send_email' => true,
  'submitters' => [
    [
      'role' => 'First Party',
      'email' => 'john.doe@example.com'
    ]
  ]
]);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

submission, err := ds.CreateSubmission(context.Background(), &docuseal.CreateSubmissionParams{
	TemplateID: 1000001,
	SendEmail: docuseal.Bool(true),
	Submitters: []*docuseal.CreateSubmissionSubmitterParams{
		{
			Role: "First Party",
			Email: "john.doe@example.com",
		},
	},
})
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submission = await client.CreateSubmissionAsync(new CreateSubmissionParams
{
    TemplateId = 1000001,
    SendEmail = true,
    Submitters = [
        new CreateSubmissionSubmitterParams
        {
            Role = "First Party",
            Email = "john.doe@example.com"
        },
    ]
});
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submission = client.createSubmission(CreateSubmissionParams.builder()
    .templateId(1000001)
    .submitters(List.of(
      CreateSubmissionSubmitterParams.builder()
        .role("First Party")
        .email("john.doe@example.com")
        .build()))
    .sendEmail(true)
    .build());
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
  }
]
```

## Related Guides

- [Send documents for signature via API](send-documents-for-signature-via-api.md)
- [Pre-fill PDF document form fields with API](pre-fill-pdf-document-form-fields-with-api.md)
