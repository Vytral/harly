# Template Webhook

Get template creation and update notifications using these events:

- **'template.created'** is triggered when the template is created.
- **'template.updated'** is triggered when the template is updated.
- **'template.archived'** is triggered when the template is archived.

## Event Types

- `template.created`
- `template.updated`
- `template.archived`

## Payload Properties

| Property | Type | Description |
|---|---|---|
| `event_type` | `string` | The event type. Values: `template.created`, `template.updated`, `template.archived`. |
| `timestamp` | `string` | The event timestamp. |
| `data` | `object` | - |

## Payload Example

```json
{
  "event_type": "template.created",
  "timestamp": "2024-05-26T16:59:47.237Z",
  "data": {
    "id": 1,
    "slug": "UwRU9ir5dvhSRY",
    "name": "Sample Document",
    "schema": [
      {
        "attachment_uuid": "84fa7c01-8b89-47e2-83f0-8623e7e4aa1c",
        "name": "sample-document"
      }
    ],
    "fields": [
      {
        "uuid": "f86dbf07-2d84-490c-b372-1aaaaf0549c1",
        "submitter_uuid": "6b92a2d0-b511-4678-bccf-1e8a131f5030",
        "name": "First Name",
        "type": "text",
        "required": true,
        "preferences": {},
        "areas": [
          {
            "x": 0.2541666666666667,
            "y": 0.2266854052667579,
            "w": 0.3132975260416667,
            "h": 0.04878270348837208,
            "attachment_uuid": "84fa7c01-8b89-47e2-83f0-8623e7e4aa1c",
            "page": 0
          }
        ]
      },
      {
        "uuid": "1b41711b-f765-41c5-b2b9-000b88b96c6e",
        "submitter_uuid": "6b92a2d0-b511-4678-bccf-1e8a131f5030",
        "name": "Last Name",
        "type": "text",
        "required": true,
        "preferences": {},
        "areas": [
          {
            "x": 0.5419813368055556,
            "y": 0.3057829599863201,
            "w": 0.2188802083333333,
            "h": 0.05516843365253077,
            "attachment_uuid": "84fa7c01-8b89-47e2-83f0-8623e7e4aa1c",
            "page": 0
          }
        ]
      }
    ],
    "submitters": [
      {
        "name": "First Party",
        "uuid": "6b92a2d0-b511-4678-bccf-1e8a131f5030"
      }
    ],
    "author_id": 1,
    "archived_at": null,
    "created_at": "2024-05-26T16:57:28.092Z",
    "updated_at": "2024-05-26T16:57:28.092Z",
    "source": "native",
    "folder_id": 1,
    "external_id": null,
    "preferences": {},
    "shared_link": false,
    "folder_name": "Default",
    "author": {
      "id": 1,
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com"
    },
    "documents": [
      {
        "id": 12,
        "uuid": "84fa7c01-8b89-47e2-83f0-8623e7e4aa1c",
        "url": "https://docuseal.com/file/hash/sample-document.pdf",
        "preview_image_url": "https://docuseal.com/file/hash/0.jpg",
        "filename": "sample-document.pdf"
      }
    ]
  }
}
```
