# Update a submitter

`PUT /submitters/{id}`
The API endpoint allows you to update submitter details, pre-fill or update field values and re-send emails.


## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `integer` | yes | The unique identifier of the submitter. |

## Request Body

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | no | The name of the submitter. |
| `email` | `string` | no | The email address of the submitter. Example: `john.doe@example.com` |
| `phone` | `string` | no | The phone number of the submitter, formatted according to the E.164 standard. Example: `+1234567890` |
| `values` | `object` | no | An object with pre-filled values for the submission. Use field names for keys of the object. For more configurations see `fields` param. |
| `external_id` | `string` | no | Your application-specific unique string key to identify this submitter within your app. |
| `send_email` | `boolean` | no | Set `true` to re-send signature request emails. |
| `send_sms` | `boolean` | no | Set `true` to re-send signature request via phone number SMS. Default: `false` |
| `reply_to` | `string` | no | Specify Reply-To address to use in the notification emails. |
| `completed` | `boolean` | no | Pass `true` to mark submitter as completed and auto-signed via API. |
| `metadata` | `object` | no | Metadata object with additional submitter information. Example: `{ "customField": "value" }` |
| `completed_redirect_url` | `string` | no | Submitter specific URL to redirect to after the submission completion. |
| `require_phone_2fa` | `boolean` | no | Set to `true` to require phone 2FA verification via a one-time code sent to the phone number in order to access the documents. Default: `false` |
| `require_email_2fa` | `boolean` | no | Set to `true` to require email 2FA verification via a one-time code sent to the email address in order to access the documents. Default: `false` |
| `message` | `object` | no | Custom signature request email message. |
| `message.subject` | `string` | no | Custom signature request email subject. |
| `message.body` | `string` | no | Custom signature request email body. Can include the following variables: {{template.name}}, {{submitter.link}}, {{account.name}}. |
| `fields` | `array[]` | no | A list of configurations for template document form fields. |
| `fields[].name` | `string` | yes | Document template field name. Example: `First Name` |
| `fields[].default_value` | `string / integer / number / boolean / array` | no | Default value of the field. Use base64 encoded file or a public URL to the image file to set default signature or image fields. Example: `Acme` |
| `fields[].readonly` | `boolean` | no | Set `true` to make it impossible for the submitter to edit predefined field value. Default: `false` |
| `fields[].required` | `boolean` | no | Set `true` to make the field required. |
| `fields[].validation` | `object` | no | Field validation rules. |
| `fields[].validation.pattern` | `string` | no | HTML field validation pattern string based on https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/pattern specification. Example: `[A-Z]{4}` |
| `fields[].validation.message` | `string` | no | A custom error message to display on validation failure. |
| `fields[].validation.min` | `number / string` | no | Minimum allowed number value or date depending on field type. |
| `fields[].validation.max` | `number / string` | no | Maximum allowed number value or date depending on field type. |
| `fields[].validation.step` | `number` | no | Increment step for number field. Pass 1 to accept only integers, or 0.01 to accept decimal currency. |
| `fields[].preferences` | `object` | no | Field display preferences. |
| `fields[].preferences.font_size` | `integer` | no | Font size of the field value in pixels. Example: `12` |
| `fields[].preferences.font_type` | `string` | no | Font type of the field value. Values: `bold`, `italic`, `bold_italic`. |
| `fields[].preferences.font` | `string` | no | Font family of the field value. Values: `Times`, `Helvetica`, `Courier`. |
| `fields[].preferences.color` | `string` | no | Font color of the field value. Example: `black` Default: `black` |
| `fields[].preferences.background` | `string` | no | Field box background color. Example: `black` |
| `fields[].preferences.align` | `string` | no | Horizontal alignment of the field text value. Default: `left` Values: `left`, `center`, `right`. |
| `fields[].preferences.valign` | `string` | no | Vertical alignment of the field text value. Default: `center` Values: `top`, `center`, `bottom`. |
| `fields[].preferences.format` | `string` | no | The data format for different field types. - Date field: accepts formats such as DD/MM/YYYY (default: MM/DD/YYYY). - Signature field: accepts drawn, typed, drawn\_or\_typed (default), or upload. - Number field: accepts currency formats such as usd, eur, gbp. Example: `DD/MM/YYYY` |
| `fields[].preferences.price` | `number` | no | Price value of the payment field. Only for payment fields. Example: `99.99` |
| `fields[].preferences.currency` | `string` | no | Currency value of the payment field. Only for payment fields. Default: `USD` Values: `USD`, `EUR`, `GBP`, `CAD`, `AUD`, `CHF`, `SEK`. |
| `fields[].preferences.mask` | `integer / boolean` | no | Set `true` to make sensitive data masked on the document. Default: `false` |
| `fields[].preferences.reasons` | `array[]` | no | An array of signature reasons to choose from. |

## Code Examples

### cURL

```curl
curl --request PUT \
  --url https://api.docuseal.com/submitters/500001 \
  --header 'X-Auth-Token: API_KEY' \
  --header 'content-type: application/json' \
  --data '{"email":"john.doe@example.com","fields":[{"name":"First Name","default_value":"Acme"}]}'
```
### CLI

```shell
docuseal submitters update 500001 \
  -d "email=john.doe@example.com" \
  -d "fields[0][name]=First Name" \
  -d "fields[0][default_value]=Acme"
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/submitters/500001", {
  method: "PUT",
  headers: {
    "X-Auth-Token": "API_KEY"
  },
  body: JSON.stringify({
    email: "john.doe@example.com",
    fields: [
      {
        name: "First Name",
        default_value: "Acme"
      }
    ]
  })
});

const submitter = await resp.json();
```
### JavaScript SDK

```javascript
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submitter = await docuseal.updateSubmitter(500001, {
  email: "john.doe@example.com",
  fields: [
    {
      name: "First Name",
      default_value: "Acme"
    }
  ]
});
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submitter = await docuseal.updateSubmitter(500001, {
  email: "john.doe@example.com",
  fields: [
    {
      name: "First Name",
      default_value: "Acme"
    }
  ]
});
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.update_submitter(500001, {
  "email": "john.doe@example.com",
  "fields": [
    {
      "name": "First Name",
      "default_value": "Acme"
    }
  ]
})
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.update_submitter(500001, {
  email: "john.doe@example.com",
  fields: [
    {
      name: "First Name",
      default_value: "Acme"
    }
  ]
})
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->updateSubmitter(500001, [
  'email' => 'john.doe@example.com',
  'fields' => [
    [
      'name' => 'First Name',
      'default_value' => 'Acme'
    ]
  ]
]);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

submitter, err := ds.UpdateSubmitter(context.Background(), 500001, &docuseal.UpdateSubmitterParams{
	Email: "john.doe@example.com",
	Fields: []*docuseal.UpdateSubmitterFieldParams{
		{
			Name: "First Name",
			Value: "Acme",
		},
	},
})
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submitter = await client.UpdateSubmitterAsync(500001, new UpdateSubmitterParams
{
    Email = "john.doe@example.com",
    Fields = [
        new UpdateSubmitterFieldParams
        {
            Name = "First Name",
            Value = "Acme"
        },
    ]
});
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submitter = client.updateSubmitter(500001, UpdateSubmitterParams.builder()
    .email("john.doe@example.com")
    .fields(List.of(
      UpdateSubmitterFieldParams.builder()
        .name("First Name")
        .value("Acme")
        .build()))
    .build());
```

## Response Example

```json
{
  "id": 1,
  "submission_id": 12,
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
  "values": [
    {
      "field": "Full Name",
      "value": "John Doe"
    }
  ],
  "documents": [],
  "role": "First Party",
  "embed_src": "https://docuseal.com/s/pAMimKcyrLjqVt"
}
```

## Related Guides

- [Pre-fill PDF document form fields with API](pre-fill-pdf-document-form-fields-with-api.md)
