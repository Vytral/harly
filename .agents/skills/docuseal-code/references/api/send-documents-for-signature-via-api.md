# Send documents for signature via API

**Prerequisites:**

**Sign Up and Obtain API Key:** Visit [DocuSeal API Console](https://console.docuseal.com/api) to obtain your API key.

**Template ID:** Identify the template ID you want to use for the form.

## Send default document signing request email

`POST` request to `https://api.docuseal.com/submissions`. Include the obtained API key in the headers along with the content type (`'application/json'`). Specify the `template_id` and submitter details:

- `email`: pass email address of each individual party in the document signing process. 
- `role`: specifies the designated role of each participant (e.g., 'Director', 'Contractor'). Pass role names defined in the template form. 
- `order`: pass `'preserved'` order to send email only to the first signer party, second party will receive an email after the document is signed by the first party. Pass `'random'` to send emails to all parties right away to allow them to sign in random order. 

Upon a successful request, specified submitters of the document will receive an email invitation to click on the link to fill and sign the document.

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

## Send custom document signing request email message

`POST` request to `https://api.docuseal.com/submissions`. Include the obtained API key in the headers along with the content type (`'application/json'`).  
 Specify the `message` and submitter details:

- `subject`: Custom email message subject line. 
- `body`: Custom email message body, can contain the following variables: 

| Variable | Description |
| --- | --- |
| `{{template.name}}` | Name of the template document form |
| `{{template.id}}` | ID of the template document form |
| `{{submitter.link}}` | Signing form link |
| `{{account.name}}` | Your company name |
| `{{sender.name}}` | Full name of the user requesting signature |
| `{{sender.first_name}}` | First name of the user requesting signature |
| `{{submitter.email}}` | Signer (aka Submitter) email address |
| `{{submitter.name}}` | Signer (aka Submitter) full name |
| `{{submitter.first_name}}` | Signer (aka Submitter) first name |
| `{{submitter.FieldName}}` | Signer (aka Submitter) field value |
| `{{submitter.slug}}` | Unique key which is used to open the embedded signing form |
| `{{submission.submitters}}` | A list of submitter emails |
| `{{submission.expire_at}}` | Submission expiration date and time |
| `{{submitters[1].email}}` | Email of the first party |
| `{{submitters[1].name}}` | Name of the first party |
| `{{submitters[1].FieldName}}` | Form field value of the first party |

Upon a successful request, specified submitters of the document will receive an email invitation with a custom message.

**Learn more:**

[REST API Reference](https://www.docuseal.com/docs/api#create-a-submission)

#### Javascript

```
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submission = await docuseal.createSubmission({
  template_id: 1000001,
  message: {
    subject: 'Custom Subject',
    body: 'Custom Message {{submitter.link}}'
  },
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
  message: {
    subject: 'Custom Subject',
    body: 'Custom Message {{submitter.link}}'
  },
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
  "message": {
    "subject": "Custom Subject",
    "body": "Custom Message {{submitter.link}}"
  },
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
  message: {
    subject: 'Custom Subject',
    body: 'Custom Message {{submitter.link}}'
  },
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
  'message' => [
    'subject' => 'Custom Subject',
    'body' => 'Custom Message {{submitter.link}}'
  ],
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
    .message(CreateSubmissionMessageParams.builder()
      .subject("Custom Subject")
      .body("Custom Message {{submitter.link}}")
      .build())
    .build());
```

#### Csharp

```
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submission = await client.CreateSubmissionAsync(new CreateSubmissionParams
{
    TemplateId = 1000001,
    Message = new CreateSubmissionMessageParams
    {
        Subject = "Custom Subject",
        Body = "Custom Message {{submitter.link}}"
    },
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
	Message: &docuseal.CreateSubmissionMessageParams{
		Subject: "Custom Subject",
		Body: "Custom Message {{submitter.link}}",
	},
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
  --data'{
    "template_id": 1000001,
    "message": {
      "subject": "Custom Subject",
      "body": "Custom Message {{submitter.link}}"
    },
    "submitters": [
      { "email": "john.doe@example.com", "role": "Director" },
      { "email": "roe.moe@example.com", "role": "Contractor" }
    ]
  }'
```
