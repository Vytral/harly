# Submission Webhook

Get submission creation, completion, expiration, and archiving notifications using these events:

- **'submission.created'** event is triggered when the submission is created.
- **'submission.completed'** event is triggered when the submission is completed by all signing parties.
- **'submission.expired'** event is triggered when the submission expires.
- **'submission.archived'** event is triggered when the submission is archived.

## Event Types

- `submission.created`
- `submission.completed`
- `submission.expired`
- `submission.archived`

## Payload Properties

| Property | Type | Description |
|---|---|---|
| `event_type` | `string` | The event type. Values: `submission.created`, `submission.completed`, `submission.expired`, `submission.archived`. |
| `timestamp` | `string` | The event timestamp. |
| `data` | `object` | - |

## Payload Example

```json
{
  "event_type": "submission.created",
  "timestamp": "2024-05-26T17:32:33.518Z",
  "data": {
    "id": 1,
    "name": "Sample Submission",
    "slug": "VyL4szTwYoSvXq",
    "expire_at": null,
    "archived_at": null,
    "created_at": "2024-05-26T17:32:33.447Z",
    "updated_at": "2024-05-26T17:32:33.447Z",
    "source": "invite",
    "submitters_order": "random",
    "audit_log_url": null,
    "combined_document_url": null,
    "submitters": [
      {
        "id": 1,
        "submission_id": 1,
        "uuid": "6b92a2d0-b511-4678-bccf-1e8a131f5030",
        "email": "mike@example.com",
        "slug": "S6fWFYRZus6suW",
        "sent_at": null,
        "opened_at": null,
        "completed_at": null,
        "declined_at": null,
        "created_at": "2024-05-26T17:32:33.466Z",
        "updated_at": "2024-05-26T17:32:33.466Z",
        "name": null,
        "phone": null,
        "external_id": null,
        "metadata": {},
        "status": "awaiting",
        "values": [],
        "documents": [],
        "preferences": {},
        "role": "First Party"
      }
    ],
    "template": {
      "id": 1,
      "name": "Sample Document",
      "created_at": "2024-05-26T16:57:28.092Z",
      "updated_at": "2024-05-26T16:58:07.314Z",
      "external_id": null,
      "folder_name": "Default"
    },
    "variables": {
      "custom_variable": "value"
    },
    "created_by_user": {
      "id": 1,
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com"
    },
    "submission_events": [],
    "documents": [],
    "status": "pending",
    "completed_at": null
  }
}
```
