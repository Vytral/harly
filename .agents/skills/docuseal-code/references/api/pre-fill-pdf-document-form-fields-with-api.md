# Pre-fill PDF document form fields with API

**Prerequisites:**

**Sign Up and Obtain API Key:** Visit [DocuSeal API Console](https://console.docuseal.com/api) to obtain your API key.

**Template ID:** Identify the template ID you want to use for the form.

## Pre-fill document data and send for signature

`POST` request to `https://api.docuseal.com/submissions`. Include the obtained API key in the headers (`'X-Auth-Token'`). Specify the `template_id` and submitter details with `fields[]` list containing:

- `name`: Name of the field in the template. 
- `default_value`: The default value assigned to the field. Use base64 encoded string to pass images, signatures or files. Or pass a public downloadable URL with an image to prefill signature, image, initials fields. Pass text value if you want to pre-fill signature or initials with the font-generated text. 
- `readonly`: Set `true` to make it impossible for the signer to edit the pre-filled field value. `false` by default. 

Upon a successful request, specified submitters of the document will receive an email invitation to click on the link to fill and sign the document.

#### Javascript

```
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submission = await docuseal.createSubmission({
  template_id: 1000001,
  order: 'preserved',
  submitters: [
    {
      email: 'john.doe@example.com',
      fields: [
        {
          name: 'First name',
          default_value: 'John',
          readonly: true
        },
        {
          name: 'Last name',
          default_value: 'Doe',
          readonly: true
        }
      ]
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
  order: 'preserved',
  submitters: [
    {
      email: 'john.doe@example.com',
      fields: [
        {
          name: 'First name',
          default_value: 'John',
          readonly: true
        },
        {
          name: 'Last name',
          default_value: 'Doe',
          readonly: true
        }
      ]
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
  "order": "preserved",
  "submitters": [
    {
      "email": "john.doe@example.com",
      "fields": [
        {
          "name": "First name",
          "default_value": "John",
          "readonly": True
        },
        {
          "name": "Last name",
          "default_value": "Doe",
          "readonly": True
        }
      ]
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
  order: 'preserved',
  submitters: [
    {
      email: 'john.doe@example.com',
      fields: [
        {
          name: 'First name',
          default_value: 'John',
          readonly: true
        },
        {
          name: 'Last name',
          default_value: 'Doe',
          readonly: true
        }
      ]
    }
  ]
})
```

#### Php

```
$docuseal = new DocusealApi('API_KEY', 'https://api.docuseal.com');

$submission = $docuseal->createSubmission([
  'template_id' => 1000001,
  'order' => 'preserved',
  'submitters' => [
    [
      'email' => 'john.doe@example.com',
      'fields' => [
        [
          'name' => 'First name',
          'default_value' => 'John',
          'readonly' => true
        ],
        [
          'name' => 'Last name',
          'default_value' => 'Doe',
          'readonly' => true
        ]
      ]
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
        .fields(List.of(
          CreateSubmissionSubmitterFieldParams.builder()
            .name("First name")
            .value("John")
            .readonly(true)
            .build(),
          CreateSubmissionSubmitterFieldParams.builder()
            .name("Last name")
            .value("Doe")
            .readonly(true)
            .build()))
        .build()))
    .order(SubmittersOrder.PRESERVED)
    .build());
```

#### Csharp

```
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submission = await client.CreateSubmissionAsync(new CreateSubmissionParams
{
    TemplateId = 1000001,
    Order = SubmittersOrder.Preserved,
    Submitters = [
        new CreateSubmissionSubmitterParams
        {
            Email = "john.doe@example.com",
            Fields = [
                new CreateSubmissionSubmitterFieldParams
                {
                    Name = "First name",
                    Value = "John",
                    Readonly = true
                },
                new CreateSubmissionSubmitterFieldParams
                {
                    Name = "Last name",
                    Value = "Doe",
                    Readonly = true
                },
            ]
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
	Order: "preserved",
	Submitters: []*docuseal.CreateSubmissionSubmitterParams{
		{
			Email: "john.doe@example.com",
			Fields: []*docuseal.CreateSubmissionSubmitterFieldParams{
				{
					Name: "First name",
					Value: "John",
					Readonly: docuseal.Bool(true),
				},
				{
					Name: "Last name",
					Value: "Doe",
					Readonly: docuseal.Bool(true),
				},
			},
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
    "order": "preserved",
    "submitters": [
      {
        "email": "john.doe@example.com",
        "fields": [
          { "name": "First name", "default_value": "John", "readonly": true },
          { "name": "Last name", "default_value": "Doe", "readonly": true }
        ]
      }
    ]
  }'
```

## Automatically sign documents via API

Signing documents on behalf of your company as a signing party can be automated with the `PUT https://api.docuseal.com/submitters/{id}` API. This automation reduces the time spent on administrative tasks, enabling faster turnaround times for your documents.

API request body should contain JSON payload with `"completed": true` value to mark the document as signed by this submitter party. Also request body should contain `fields[]` list to predefine values and to put a signature image with the given URL.

Upon a successful request, all signing parties will receive an email with a signed document.

**Learn more:**

[REST API Reference](https://www.docuseal.com/docs/api#update-a-submitter)

#### Javascript

```
const docuseal = require("@docuseal/api");

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submitter = await docuseal.updateSubmitter(500001, {
  completed: true,
  fields: [
    {
      name: 'Full Name',
      default_value: 'John Doe',
      readonly: true
    },
    {
      name: 'Signature',
      default_value: 'https://your-company.com/signature.png',
      readonly: true
    }
  ]
});
```

#### Typescript

```
import docuseal from "@docuseal/api";

docuseal.configure({ key: "API_KEY", url: "https://api.docuseal.com" });

const submitter = await docuseal.updateSubmitter(500001, {
  completed: true,
  fields: [
    {
      name: 'Full Name',
      default_value: 'John Doe',
      readonly: true
    },
    {
      name: 'Signature',
      default_value: 'https://your-company.com/signature.png',
      readonly: true
    }
  ]
});
```

#### Python

```
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

submitter = docuseal.update_submitter(500001, {
  "completed": True,
  "fields": [
    {
      "name": "Full Name",
      "default_value": "John Doe",
      "readonly": True
    },
    {
      "name": "Signature",
      "default_value": "https://your-company.com/signature.png",
      "readonly": True
    }
  ]
})
```

#### Ruby

```
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

submitter = Docuseal.update_submitter(500001, {
  completed: true,
  fields: [
    {
      name: 'Full Name',
      default_value: 'John Doe',
      readonly: true
    },
    {
      name: 'Signature',
      default_value: 'https://your-company.com/signature.png',
      readonly: true
    }
  ]
})
```

#### Php

```
$docuseal = new DocusealApi('API_KEY', 'https://api.docuseal.com');

$docuseal->updateSubmitter(500001, [
  'completed' => true,
  'fields' => [
    [
      'name' => 'Full Name',
      'default_value' => 'John Doe',
      'readonly' => true
    ],
    [
      'name' => 'Signature',
      'default_value' => 'https://your-company.com/signature.png',
      'readonly' => true
    ]
  ]
]);
```

#### Java

```
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submitter = client.updateSubmitter(500001, UpdateSubmitterParams.builder()
    .completed(true)
    .fields(List.of(
      UpdateSubmitterFieldParams.builder()
        .name("Full Name")
        .value("John Doe")
        .readonly(true)
        .build(),
      UpdateSubmitterFieldParams.builder()
        .name("Signature")
        .value("https://your-company.com/signature.png")
        .readonly(true)
        .build()))
    .build());
```

#### Csharp

```
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var submitter = await client.UpdateSubmitterAsync(500001, new UpdateSubmitterParams
{
    Completed = true,
    Fields = [
        new UpdateSubmitterFieldParams
        {
            Name = "Full Name",
            Value = "John Doe",
            Readonly = true
        },
        new UpdateSubmitterFieldParams
        {
            Name = "Signature",
            Value = "https://your-company.com/signature.png",
            Readonly = true
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

submitter, err := ds.UpdateSubmitter(context.Background(), 500001, &docuseal.UpdateSubmitterParams{
	Completed: docuseal.Bool(true),
	Fields: []*docuseal.UpdateSubmitterFieldParams{
		{
			Name: "Full Name",
			Value: "John Doe",
			Readonly: docuseal.Bool(true),
		},
		{
			Name: "Signature",
			Value: "https://your-company.com/signature.png",
			Readonly: docuseal.Bool(true),
		},
	},
})
```

#### Curl

```
curl -X PUT https://api.docuseal.com/submitters/500001 \
  --header "X-Auth-Token: YOUR_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "completed": true,
    "fields": [
      {
        "name": "Full Name",
        "default_value": "John Doe",
        "readonly": true
      },
      {
        "name": "Signature",
        "default_value": "https://your-company.com/signature.png",
        "readonly": true
      }
    ]
  }'
```
