# Update a template

`PUT /templates/{id}`
The API endpoint provides the functionality to move a document template to a different folder and update the name of the template.


## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | `integer` | yes | The unique identifier of the document template. |

## Request Body

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | no | The name of the template. Example: `New Document Name` |
| `folder_name` | `string` | no | The folder's name to which the template should be moved. Example: `New Folder` |
| `roles` | `array[]` | no | An array of submitter role names to update the template with. Example: `["Agent", "Customer"]` |
| `archived` | `boolean` | no | Set `false` to unarchive template. |

## Code Examples

### cURL

```curl
curl --request PUT \
  --url https://api.docuseal.com/templates/1000001 \
  --header 'X-Auth-Token: API_KEY' \
  --header 'content-type: application/json' \
  --data '{"name":"New Document Name","folder_name":"New Folder"}'
```
### CLI

```shell
docuseal templates update 1000001 --name "New Document Name" --folder-name "New Folder"
```
### Node.js (fetch)

```javascript
const fetch = require("node-fetch");

const resp = await fetch("https://api.docuseal.com/templates/1000001", {
  method: "PUT",
  headers: {
    "X-Auth-Token": "API_KEY"
  },
  body: JSON.stringify({
    name: "New Document Name",
    folder_name: "New Folder"
  })
});

const template = await resp.json();
```
### JavaScript SDK

```javascript
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const template = await docuseal.updateTemplate(1000001, {
  name: "New Document Name",
  folder_name: "New Folder"
});
```
### TypeScript SDK

```typescript
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const template = await docuseal.updateTemplate(1000001, {
  name: "New Document Name",
  folder_name: "New Folder"
});
```
### Python SDK

```python
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.update_template(1000001, {
  "name": "New Document Name",
  "folder_name": "New Folder"
})
```
### Ruby SDK

```ruby
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.update_template(1000001, {
  name: "New Document Name",
  folder_name: "New Folder"
})
```
### PHP SDK

```php
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$docuseal->updateTemplate(1000001, [
  'name' => 'New Document Name',
  'folder_name' => 'New Folder'
]);
```
### Go SDK

```go
ds := docuseal.NewClient("API_KEY", docuseal.WithBaseURL("https://api.docuseal.com"))

template, err := ds.UpdateTemplate(context.Background(), 1000001, &docuseal.UpdateTemplateParams{
	Name: "New Document Name",
	FolderName: "New Folder",
})
```
### C# SDK

```csharp
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var template = await client.UpdateTemplateAsync(1000001, new UpdateTemplateParams
{
    Name = "New Document Name",
    FolderName = "New Folder"
});
```
### Java SDK

```java
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var template = client.updateTemplate(1000001, UpdateTemplateParams.builder()
    .name("New Document Name")
    .folderName("New Folder")
    .build());
```

## Response Example

```json
{
  "id": 1,
  "updated_at": "2023-12-14T15:50:21.799Z"
}
```
