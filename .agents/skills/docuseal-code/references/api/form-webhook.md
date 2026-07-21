# Form Webhook

During the form filling and signing process, 4 types of events may occur and are dispatched at different stages:

- **'form.viewed'** event is triggered when the submitter first opens the form.
- **'form.started'** event is triggered when the submitter initiates filling out the form.
- **'form.completed'** event is triggered upon successful form completion and signing by one of the parties.
- **'form.declined'** event is triggered when a signer declines the submission.

 It's important to note that each of these events contain information available at the time of dispatch, so some data may be missing or incomplete depending on the specific event. Failed webhook requests (4xx, 5xx) are automatically retried multiple times within 48 hours (every 2^attempt minutes) for all production accounts.

## Event Types

- `form.viewed`
- `form.started`
- `form.completed`
- `form.declined`

## Payload Properties

| Property | Type | Description |
|---|---|---|
| `event_type` | `string` | The event type. Values: `form.viewed`, `form.started`, `form.completed`, `form.declined`. |
| `timestamp` | `string` | The event timestamp. |
| `data` | `object` | Submitted form data object. |

## Payload Example

```json
{
  "event_type": "form.completed",
  "timestamp": "2023-09-24T13:48:36Z",
  "data": {
    "id": 1,
    "email": "john.doe@example.com",
    "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
    "ip": "132.216.88.83",
    "sent_at": "2023-08-20T10:09:05.459Z",
    "opened_at": "2023-08-20T10:10:00.451Z",
    "completed_at": "2023-08-20T10:12:47.579Z",
    "declined_at": null,
    "created_at": "2023-08-20T10:09:02.459Z",
    "updated_at": "2023-08-20T10:12:47.907Z",
    "name": null,
    "phone": null,
    "role": "First Party",
    "external_id": null,
    "decline_reason": null,
    "status": "completed",
    "preferences": {
      "send_email": true,
      "send_sms": false
    },
    "submission": {
      "id": 12,
      "audit_log_url": "https://docuseal.com/blobs/proxy/eyJfcmFpbHMiOnsib/audit-log.pdf",
      "combined_document_url": "https://docuseal.com/blobs/proxy/eyJfcmFpbHMiOnsib/document.pdf",
      "status": "completed",
      "url": "https://docuseal.com/e/N5JsdkFGPeQF7J",
      "variables": {
        "custom_variable": "value"
      },
      "created_at": "2023-08-20T10:09:05.258Z"
    },
    "template": {
      "id": 6,
      "name": "Invoice",
      "external_id": null,
      "created_at": "2023-08-19T11:09:21.487Z",
      "updated_at": "2023-08-19T11:11:47.804Z",
      "folder_name": "Default"
    },
    "values": [
      {
        "field": "First Name",
        "value": "John"
      },
      {
        "field": "Last Name",
        "value": "Doe"
      },
      {
        "field": "Signature",
        "value": "https://docuseal.com/blobs/proxy/eyJfcmFpbHMiOnsib/signature.png"
      },
      {
        "field": "Signature",
        "value": "John Doe"
      }
    ],
    "metadata": {
      "customData": "custom value"
    },
    "audit_log_url": "https://docuseal.com/blobs/proxy/eyJfcmFpbHMiOnsib/audit-log.pdf",
    "submission_url": "https://docuseal.com/e/N5JsdkFGPeQF7J",
    "documents": [
      {
        "name": "sample-document",
        "url": "https://docuseal.com/blobs/proxy/eyJfcmFpbHMiOnsib/sample-document.pdf"
      }
    ]
  }
}
```

## Related Guides

- [Download Signed Documents](download-signed-documents.md)
