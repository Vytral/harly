## Document signing form initiated via API

**Prerequisites:**

**Sign Up and Obtain API Key:** Visit [DocuSeal API Console](https://console.docuseal.com/api) to obtain your API key.

The API can be used to initiate a signing session for a single-party form or for a multi-party form. For multi-party forms, the API returns a unique `embed_src` URL for each submitter, and each URL can be used to embed the signing form for the corresponding party.

`POST` request to `https://api.docuseal.com/submissions`. Include the obtained API key in the headers along with the content type (`'application/json'`). Specify the `template_id` and submitter details:

- `send_email`: set to `false` to disable automated emails from the platform. 
- `email`: pass email address of each individual party in the document signing process. 
- `role`: specifies the designated role of each participant (e.g., 'Director', 'Contractor'). Pass role names defined in the template form. 

Upon a successful request, the API will respond with an array of submitters. Each submitter contains an `embed_src` with the full signing form URL, as well as a `slug` key which can be appended to your DocuSeal host URL.

Pass the `embed_src` value directly to the `[src]` input of the `<docuseal-form>` component, or construct the URL from the `slug` key (e.g. `https://docuseal.com/s/${slug}`). Either value links the embedded form in your Angular app to the specific submitter created through the DocuSeal API.

#### Nodejs

```
import express from 'express';
import axios from 'axios';
import docuseal from "@docuseal/api";

const app = express();

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

app.post('/your_backend/api/init_form', async (req, res) => {
  const submission = await docuseal.createSubmission({
    template_id: 1000001,
    send_email: false,
    submitters: [
      {
        email: 'john.doe@example.com',
        role: 'Director'
      },
      {
        email: 'roe.moe@example.com',
        role: 'Contractor'
      }
    ]
  });

  const slug = submission.slug;
  res.json({ slug });
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
```

#### Javascript

```
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submission = await docuseal.createSubmission({
  template_id: 1000001,
  send_email: false,
  submitters: [
    {
      email: 'john.doe@example.com',
      role: 'Director'
    },
    {
      email: 'roe.moe@example.com',
      role: 'Contractor'
    }
  ]
});
```

#### Typescript

```
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submission = await docuseal.createSubmission({
  template_id: 1000001,
  send_email: false,
  submitters: [
    {
      email: 'john.doe@example.com',
      role: 'Director'
    },
    {
      email: 'roe.moe@example.com',
      role: 'Contractor'
    }
  ]
});
```

#### Python

```
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

submission = docuseal.create_submission({
  "template_id": 1000001,
  "send_email": False,
  "submitters": [
    {
      "email": "john.doe@example.com",
      "role": "Director"
    },
    {
      "email": "roe.moe@example.com",
      "role": "Contractor"
    }
  ]
})
```

#### Ruby

```
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

submission = Docuseal.create_submission({
  template_id: 1000001,
  send_email: false,
  submitters: [
    {
      email: 'john.doe@example.com',
      role: 'Director'
    },
    {
      email: 'roe.moe@example.com',
      role: 'Contractor'
    }
  ]
})
```

#### Php

```
$docuseal = new DocusealApi('API_KEY', 'https://api.docuseal.com');

$submission = $docuseal->createSubmission([
  'template_id' => 1000001,
  'send_email' => false,
  'submitters' => [
    [
      'email' => 'john.doe@example.com',
      'role' => 'Director'
    ],
    [
      'email' => 'roe.moe@example.com',
      'role' => 'Contractor'
    ]
  ]
]);
```

#### Java

```
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submission = client.createSubmission(CreateSubmissionParams.builder()
    .templateId(1000001)
    .submitters(List.of(
      CreateSubmissionSubmitterParams.builder()
        .email("john.doe@example.com")
        .role("Director")
        .build(),
      CreateSubmissionSubmitterParams.builder()
        .email("roe.moe@example.com")
        .role("Contractor")
        .build()))
    .sendEmail(false)
    .build());
```

#### Csharp

```
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submission = await client.CreateSubmissionAsync(new CreateSubmissionParams
{
    TemplateId = 1000001,
    SendEmail = false,
    Submitters = [
        new CreateSubmissionSubmitterParams
        {
            Email = "john.doe@example.com",
            Role = "Director"
        },
        new CreateSubmissionSubmitterParams
        {
            Email = "roe.moe@example.com",
            Role = "Contractor"
        },
    ]
});
```

#### Go

```
ds := docuseal.NewClient(
	"API_KEY",
	docuseal.WithBaseURL("https://api.docuseal.com"),
)

submission, err := ds.CreateSubmission(context.Background(), &docuseal.CreateSubmissionParams{
	TemplateID: 1000001,
	SendEmail: docuseal.Bool(false),
	Submitters: []*docuseal.CreateSubmissionSubmitterParams{
		{
			Email: "john.doe@example.com",
			Role: "Director",
		},
		{
			Email: "roe.moe@example.com",
			Role: "Contractor",
		},
	},
})
```

#### Curl

```
curl -X POST https://api.docuseal.com/submissions \
  --header "X-Auth-Token: YOUR_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "template_id": 1000001,
    "send_email": false,
    "submitters": [
      { "email": "john.doe@example.com", "role": "Director" },
      { "email": "roe.moe@example.com", "role": "Contractor" }
    ]
  }'
```


```
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DocusealFormComponent } from '@docuseal/angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DocusealFormComponent],
  template: `
    <div>
      <ng-container *ngIf="slug; else loading">
        <docuseal-form [src]="'https://docuseal.com/s/' + slug"></docuseal-form>
      </ng-container>
      <ng-template #loading>
        <p>Loading...</p>
      </ng-template>
    </div>
  `
})
```
