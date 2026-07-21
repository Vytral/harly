# Download Signed Documents

## Setup webhooks

Navigate to [https://console.docuseal.com/webhooks](https://console.docuseal.com/webhooks) to set up the webhooks. Configure the endpoint URL of your backend API where you'll handle the received webhook data. Ensure this endpoint is secured with a token to authenticate incoming requests. Here's an example of how you might structure this:   
`https://your-backend-api.com/webhook/docuseal/YOUR_TOKEN_HERE`

Once the document is signed by one of the parties the "form.completed" event is triggered. DocuSeal will send a webhook payload containing a "documents" list which includes URLs with downloadable signed documents.

Webhook payload includes the `"external_id"` value which works as a identifier for that specific signer. External ID can be specified via [REST API](https://www.docuseal.com/docs/api#create-a-submission) or [Embedded Form](https://www.docuseal.com/docs/embedded/form). This association allows you to maintain a clear mapping between signed documents and the individual signers in your database.


```
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

## Download documents via API

Documents can be downloaded from DocuSeal using the following API request:  
`GET https://api.docuseal.com/submitters?external_id=value`  
 This API responds with the `documents[]` array that contains downloadable PDF URLs. Submitters (aka Signers) can be filtered with the specified `external_id` to make it easier to map documents to records in your database.

**Learn more:**

[REST API Reference](https://www.docuseal.com/docs/api#form-webhook)

#### Javascript

```
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const { data, pagination } = await docuseal.listSubmitters({ external_id: 'customer_123' });
```

#### Typescript

```
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const { data, pagination } = await docuseal.listSubmitters({ external_id: 'customer_123' });
```

#### Python

```
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

docuseal.list_submitters({ "external_id": "customer_123" })
```

#### Ruby

```
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

Docuseal.list_submitters({ external_id: 'customer_123' })
```

#### Php

```
$docuseal = new DocusealApi('API_KEY', 'https://api.docuseal.com');

$docuseal->listSubmitters(['external_id' => 'customer_123']);
```

#### Java

```
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submitters = client.getSubmitters(GetSubmittersParams.builder().externalId("customer_123").build());
```

#### Csharp

```
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submitters = await client.GetSubmittersAsync(new GetSubmittersParams { ExternalId = "customer_123" });
```

#### Go

```
ds := docuseal.NewClient(
	"API_KEY",
	docuseal.WithBaseURL("https://api.docuseal.com"),
)

submitters, err := ds.GetSubmitters(context.Background(), &docuseal.GetSubmittersParams{ExternalID: "customer_123"})
```

#### Curl

```
curl --request GET \
  --url https://api.docuseal.com/submitters?external_id=customer_123 \
  --header 'X-Auth-Token: API_KEY'
```

## Document URL expiration

Document URLs returned by the API and webhooks are **temporary** and expire after **40 minutes** by default. After expiration, these URLs will return a `404` error.

**Do not store document URLs in your database.** A common mistake is to save the URL from a webhook or API response and try to use it later for downloading. Since the URL expires, any stored link will stop working after a short period of time.

Instead, always call the API to get a fresh document URL right before you need to access the file:

- `GET /submissions/{id}/documents` - get only the document URLs 
- `GET /submissions/{id}` - get documents for the entire submission 
- `GET /submitters/{id}` - get documents for a specific submitter 

Save the `submission_id` or `submitter_id` in your database instead of the URL. When you need to download or display the document, make an API call with the stored ID to retrieve a fresh, valid URL.

#### Javascript

```
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const resp = await docuseal.getSubmissionDocuments(submissionId);

const documentUrl = resp.documents[0].url;
```

#### Typescript

```
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const resp = await docuseal.getSubmissionDocuments(submissionId);

const documentUrl = resp.documents[0].url;
```

#### Python

```
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

resp = docuseal.get_submission_documents(submission_id)

document_url = resp["documents"][0]["url"]
```

#### Ruby

```
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

resp = Docuseal.get_submission_documents(submission_id)

document_url = resp["documents"][0]["url"]
```

#### Php

```
$docuseal = new \Docuseal\Api('API_KEY', 'https://api.docuseal.com');

$resp = $docuseal->getSubmissionDocuments($submissionId);

$documentUrl = $resp['documents'][0]['url'];
```

#### Java

```
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var resp = client.getSubmissionDocuments(submissionId);

var documentUrl = resp.getDocuments().get(0).getUrl();
```

#### Csharp

```
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var resp = await client.GetSubmissionDocumentsAsync(submissionId, new GetSubmissionDocumentsParams());

var documentUrl = resp.Documents.First().Url;
```

#### Go

```
ds := docuseal.NewClient(
	"API_KEY",
	docuseal.WithBaseURL("https://api.docuseal.com"),
)

resp, err := ds.GetSubmissionDocuments(context.Background(), submissionID, nil)

documentURL := resp.Documents[0].URL
```

#### Curl

```
curl --request GET \
  --url https://api.docuseal.com/submissions/SUBMISSION_ID/documents \
  --header 'X-Auth-Token: API_KEY'
```
