# Create a submission from HTML

`POST /submissions/html`
**Pro / Cloud Sandbox plan required.**

This API endpoint allows you to create a one-off submission request document using the provided HTML content, with special field tags rendered as a fillable and signable form.


## Request Body

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | no | Name of the document submission. Example: `Test Submission Document` |
| `send_email` | `boolean` | no | Set `false` to disable signature request emails sending. Default: `true` |
| `send_sms` | `boolean` | no | Set `true` to send signature request via phone number and SMS. Default: `false` |
| `order` | `string` | no | Pass 'random' to send signature request emails to all parties right away. The order is 'preserved' by default so the second party will receive a signature request email only after the document is signed by the first party. Default: `preserved` Values: `random`, `preserved`. |
| `completed_redirect_url` | `string` | no | Specify URL to redirect to after the submission completion. |
| `bcc_completed` | `string` | no | Specify BCC address to send signed documents to after the completion. |
| `reply_to` | `string` | no | Specify Reply-To address to use in the notification emails. |
| `expire_at` | `string` | no | Specify the expiration date and time after which the submission becomes unavailable for signature. Example: `2024-09-01 12:00:00 UTC` |
| `template_ids` | `array[]` | no | An optional array of template IDs to use in the submission along with the provided documents. This can be used to create multi-document submissions when some of the required documents exist within templates. |
| `documents` | `array[]` | yes | The list of documents built from HTML. Can be used to create a submission with multiple documents. |
| `documents[].name` | `string` | no | Document name. Random uuid will be assigned when not specified. Example: `Test Document` |
| `documents[].html` | `string` | yes | HTML document content with field tags. Example: `<p>Lorem Ipsum is simply dummy text of the <text-field name="Industry" role="First Party" required="false" style="width: 80px; height: 16px; display: inline-block; margin-bottom: -4px"> </text-field> and typesetting industry</p> ` |
| `documents[].html_header` | `string` | no | HTML document content of the header to be displayed on every page. |
| `documents[].html_footer` | `string` | no | HTML document content of the footer to be displayed on every page. |
| `documents[].size` | `string` | no | Page size. Letter 8.5 x 11 will be assigned when not specified. Example: `A4` Default: `Letter` Values: `Letter`, `Legal`, `Tabloid`, `Ledger`, `A0`, `A1`, `A2`, `A3`, `A4`, `A5`, `A6`. |
| `documents[].position` | `integer` | no | Document position in the submission. If not specified, the document will be added in the order it appears in the documents array. |
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
| `message` | `object` | no | Custom signature request email message. |
| `message.subject` | `string` | no | Custom signature request email subject. |
| `message.body` | `string` | no | Custom signature request email body. Can include variables such as {{template.name}}, {{submission.name}}, {{submitter.link}}, {{account.name}}. |
| `merge_documents` | `boolean` | no | Set `true` to merge the documents into a single PDF file. Default: `false` |

## Code Examples

### cURL

```curl
curl --request POST \
  --url https://api.docuseal.com/submissions/html \
  --header 'X-Auth-Token: API_KEY' \
  --header 'content-type: application/json' \
  --data '{"name":"Test Submission Document","documents":[{"name":"Test Document","html":"<p>Lorem Ipsum is simply dummy text of the\n<text-field\n  name=\"Industry\"\n  role=\"First Party\"\n  required=\"false\"\n  style=\"width: 80px; height: 16px; display: inline-block; margin-bottom: -4px\">\n</text-field>\nand typesetting industry</p>\n"}],"submitters":[{"role":"First Party","email":"john.doe@example.com"}]}'
```
### CLI

```shell
docuseal submissions create-html --name "Test Submission Document" \
  -d "documents[0][name]=Test Document" \
  -d "documents[0][html]=<p>Lorem Ipsum is simply dummy text of the <text-f..." \
  -d "submitters[0][role]=First Party" \
  -d "submitters[0][email]=john.doe@example.com"
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/submissions/html", {
  method: "POST",
  headers: {
    "X-Auth-Token": "API_KEY"
  },
  body: JSON.stringify({
    name: "Test Submission Document",
    documents: [
      {
        name: "Test Document",
        html: `<p>Lorem Ipsum is simply dummy text of the
<text-field
  name="Industry"
  role="First Party"
  required="false"
  style="width: 80px; height: 16px; display: inline-block; margin-bottom: -4px">
</text-field>
and typesetting industry</p>
`
      }
    ],
    submitters: [
      {
        role: "First Party",
        email: "john.doe@example.com"
      }
    ]
  })
});

const submission = await resp.json();
```
### JavaScript SDK

```javascript
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submission = await docuseal.createSubmissionFromHtml({
  name: "Test Submission Document",
  documents: [
    {
      name: "Test Document",
      html: `<p>Lorem Ipsum is simply dummy text of the
<text-field
  name="Industry"
  role="First Party"
  required="false"
  style="width: 80px; height: 16px; display: inline-block; margin-bottom: -4px">
</text-field>
and typesetting industry</p>
`
    }
  ],
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

const submission = await docuseal.createSubmissionFromHtml({
  name: "Test Submission Document",
  documents: [
    {
      name: "Test Document",
      html: `<p>Lorem Ipsum is simply dummy text of the
<text-field
  name="Industry"
  role="First Party"
  required="false"
  style="width: 80px; height: 16px; display: inline-block; margin-bottom: -4px">
</text-field>
and typesetting industry</p>
`
    }
  ],
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

docuseal.create_submission_from_html({
  "name": "Test Submission Document",
  "documents": [
    {
      "name": "Test Document",
      "html": """<p>Lorem Ipsum is simply dummy text of the
<text-field
  name=\"Industry\"
  role=\"First Party\"
  required=\"false\"
  style=\"width: 80px; height: 16px; display: inline-block; margin-bottom: -4px\">
</text-field>
and typesetting industry</p>
"""
    }
  ],
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

Docuseal.create_submission_from_html({
  name: "Test Submission Document",
  documents: [
    {
      name: "Test Document",
      html: "<p>Lorem Ipsum is simply dummy text of the
<text-field
  name=\"Industry\"
  role=\"First Party\"
  required=\"false\"
  style=\"width: 80px; height: 16px; display: inline-block; margin-bottom: -4px\">
</text-field>
and typesetting industry</p>
"
    }
  ],
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

$docuseal->createSubmissionFromHtml([
  'name' => 'Test Submission Document',
  'documents' => [
    [
      'name' => 'Test Document',
      'html' => '<p>Lorem Ipsum is simply dummy text of the
<text-field
  name="Industry"
  role="First Party"
  required="false"
  style="width: 80px; height: 16px; display: inline-block; margin-bottom: -4px">
</text-field>
and typesetting industry</p>
'
    ]
  ],
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

submission, err := ds.CreateSubmissionFromHtml(context.Background(), &docuseal.CreateSubmissionFromHtmlParams{
	Name: "Test Submission Document",
	Documents: []*docuseal.CreateSubmissionFromHtmlDocumentParams{
		{
			Name: "Test Document",
			Html: `<p>Lorem Ipsum is simply dummy text of the
<text-field
  name="Industry"
  role="First Party"
  required="false"
  style="width: 80px; height: 16px; display: inline-block; margin-bottom: -4px">
</text-field>
and typesetting industry</p>
`,
		},
	},
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

var submission = await client.CreateSubmissionFromHtmlAsync(new CreateSubmissionFromHtmlParams
{
    Name = "Test Submission Document",
    Documents = [
        new CreateSubmissionFromHtmlDocumentParams
        {
            Name = "Test Document",
            Html = """
<p>Lorem Ipsum is simply dummy text of the
<text-field
  name="Industry"
  role="First Party"
  required="false"
  style="width: 80px; height: 16px; display: inline-block; margin-bottom: -4px">
</text-field>
and typesetting industry</p>
"""
        },
    ],
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

var submission = client.createSubmissionFromHtml(CreateSubmissionFromHtmlParams.builder()
    .documents(List.of(
      CreateSubmissionFromHtmlDocumentParams.builder()
        .html("""
<p>Lorem Ipsum is simply dummy text of the
<text-field
  name="Industry"
  role="First Party"
  required="false"
  style="width: 80px; height: 16px; display: inline-block; margin-bottom: -4px">
</text-field>
and typesetting industry</p>
""")
        .name("Test Document")
        .build()))
    .submitters(List.of(
      CreateSubmissionSubmitterParams.builder()
        .role("First Party")
        .email("john.doe@example.com")
        .build()))
    .name("Test Submission Document")
    .build());
```

## Response Example

```json
{
  "id": 5,
  "name": "Test Submission",
  "submitters": [
    {
      "id": 1,
      "uuid": "884d545b-3396-49f1-8c07-05b8b2a78755",
      "email": "john.doe@example.com",
      "slug": "pAMimKcyrLjqVt",
      "sent_at": "2025-06-02T15:55:51.310Z",
      "opened_at": null,
      "completed_at": null,
      "declined_at": null,
      "created_at": "2025-06-02T15:55:50.320Z",
      "updated_at": "2025-06-02T15:55:50.320Z",
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
        "send_sms": false,
        "reply_to": "reply@example.com",
        "completed_redirect_url": "https://example.com/"
      },
      "role": "First Party",
      "embed_src": "https://docuseal.com/s/pAMimKcyrLjqVt"
    }
  ],
  "source": "api",
  "submitters_order": "preserved",
  "status": "pending",
  "schema": [
    {
      "name": "Demo PDF",
      "attachment_uuid": "48d2998f-266b-47e4-beb2-250ab7ccebdf"
    }
  ],
  "fields": [
    {
      "name": "Name",
      "type": "text",
      "required": true,
      "uuid": "d0bf3c0c-1928-40c8-80f9-d9f3c6ad4eff",
      "submitter_uuid": "0b0bff58-bc9a-475d-b4a9-2f3e5323faf7",
      "areas": [
        {
          "page": 1,
          "attachment_uuid": "48d2998f-266b-47e4-beb2-250ab7ccebdf",
          "x": 0.403158189124654,
          "y": 0.04211750189825361,
          "w": 0.100684625476058,
          "h": 0.01423690205011389
        }
      ]
    }
  ],
  "expire_at": null,
  "created_at": "2025-06-02T15:55:50.270Z"
}
```

## Related Guides

- [Create PDF document fillable form with HTML](create-pdf-document-fillable-form-with-html-api.md)
