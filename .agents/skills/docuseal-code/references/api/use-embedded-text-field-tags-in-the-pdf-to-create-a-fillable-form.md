# Use embedded text field tags in the PDF to create a fillable form

**Prerequisites:**

**Sign Up and Obtain API Key:** Visit [DocuSeal API Console](https://console.docuseal.com/api) to obtain your API key.

## Embedded PDF field text tags

The PDF embedded text tags can be defined in the PDF using `{{ }}` curly brackets. These tags act as placeholders in the document, which should be replaced with interactive and fillable document fields. Each tag contains a defined field name along with its associated attributes:

Text field tags can contain the following attributes:

- `name`: Name of the field in the template. 
- `type`: Field type can be one of the following types: text, signature, initials, date, datenow, image, file, payment, stamp, select, checkbox, multiple, radio, phone, verification, kba. 
- `role`: signer role name. Specify different names in case the document contains multiple signing parties with their own set of fields. 
- `default`: default field value to be used in the template (optional). 
- `required`: set false to make the field optional and skippable. true by default. 
- `readonly`: set true to make it impossible for the signer to edit the pre-filled field value. false by default. 
- `title`: field title shown instead of the field name in the signing interface. 
- `description`: the field description displayed after the field name or title in the signing interface. 
- `options`: comma separated list of options for select and radio field types. 
- `condition`: FieldName:value to show the field only if the condition is met for the value in other field. Pass only FieldName to set a condition for a non-empty field. 
- `width`: absolute width of the field in pixels. This attribute is optional, text tag width will be used for the field width by default. 
- `height`: absolute height of the field in pixels. This attribute is optional, font size height will be used for the field height by default. 
- `format`: the data format for date and signature fields. Possible values depend on the field type: 
  - **date field** can be, for example: DD/MM/YYYY (Default: MM/DD/YYYY) 
  - **signature field** can accept only: drawn, typed, drawn\_or\_typed, upload. (Default: drawn\_or\_typed ) 
  - **number field** can accept: usd, eur, gbp currency formats. 

- `min`: Minimum allowed number value or date depending on field type. 
- `max`: Maximum allowed number value or date depending on field type. 
- `font`: font name to be used in the field. Can accept Times, Helvetica or Courier PDF default fonts to be used for the field font. 
- `font_size`: font size of the text value. This attribute is optional, default font size will be calculated based on the field height by default. 
- `font_type`: font type to be used in the field. Can accept bold, italic or bold\_italic font types to be used for the field value. 
- `color`: blue or red color of the text value or signature. This attribute is optional, default black color is used when not specified. 
- `align`: Horizontal alignment of the text value. This attribute is optional, with possible values being left, center, or right. Default is left when not specified. 
- `valign`: Vertical alignment of the text value. This attribute is optional, with possible values being top, center, or bottom. Default is center when not specified. 
- `hidden`: set true to make field not visible on the document. false by default. 
- `mask`: set true to make sensitive data masked on the document. false by default. 
- `method`: set aes or qes identity verification field method. 

Attributes should be separated with semicolon `(;)` with attribute value specified after the equal `(=)` sign: ` {{DOB;type=date;role=Customer;required=false}}
        `

| Tag format | Field type |
| --- | --- |
| `{{Field Name}}` | Text field |
| `{{Sign;type=signature}}` | Signature field |
| `{{DOB;type=date}}` | Date field |
| `{{Date;type=datenow}}` | Read-only signing date |
| `{{Photo;type=image}}` | Image upload field |
| `{{Documents;type=file}}` | Files upload field |
| `{{type=checkbox}}` | Checkbox |
| `{{Radio name;type=radio;option=Opt1}}` | Radio field option |
| `{{Select name;type=select;options=Opt1,Opt2}}` | Select field |
| `{{type=stamp;readonly=true}}` | Stamp field (non-interactive) |
| `{{type=phone;required=true}}` | Phone 2FA field |
| `{{Name;condition=Checkbox1:true}}` | Field condition |

## Send PDF to the API

Use `POST https://api.docuseal.com/submissions/pdf` API to create a one-off submission request document from the given PDF with field text tags.

API request body should contain JSON payload with `"file": '...'` encoded as base64 string value.

**Learn more:**

[REST API Reference](https://www.docuseal.com/docs/api#create-a-template-from-existing-pdf)

[PDF text tags example file](https://www.docuseal.com/examples/fieldtags.pdf)

#### Javascript

```
const docuseal = require('@docuseal/api');
const fs = require('fs')

const filePath = 'path/to/your/file.pdf';
const fileData = fs.readFileSync(filePath, { encoding: 'base64' });

docuseal.configure({ key: 'API_KEY', url: 'https://api.docuseal.com' });

const submission = await docuseal.createSubmissionFromPdf({
  name: 'Rental Agreement',
  documents: [
    {
      name: 'rental-agreement',
      file: fileData
    }
  ],
  submitters: [
    {
      role: 'First Party',
      email: 'john.doe@example.com'
    }
  ]
});
```

#### Typescript

```
import docuseal from '@docuseal/api';
import fs from 'fs';

const filePath = 'path/to/your/file.pdf';
const fileData = fs.readFileSync(filePath, { encoding: 'base64' });

docuseal.configure({ key: 'API_KEY', url: 'https://api.docuseal.com' });

const submission = await docuseal.createTemplateFromPdf({
  name: 'Rental Agreement',
  documents: [
    {
      name: 'rental-agreement',
      file: fileData
    }
  ],
  submitters: [
    {
      role: 'First Party',
      email: 'john.doe@example.com'
    }
  ]
});
```

#### Python

```
import base64
from docuseal import docuseal

file_path = "path/to/your/file.pdf"
with open(file_path, "rb") as f:
    file_data = base64.b64encode(f.read()).decode()

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

submission = docuseal.create_submission_from_pdf({
  "name": "Rental Agreement",
  "documents": [
    {
      "name": "rental-agreement",
      "file": file_data
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

#### Ruby

```
require 'base64'
require 'docuseal'

file_path = 'path/to/your/file.pdf'
file_data = Base64.strict_encode64(File.read(file_path))

Docuseal.key = ENV['DOCUSEAL_API_KEY']
Docuseal.url = 'https://api.docuseal.com'

submission = Docuseal.create_submission_from_pdf(
  name: 'Rental Agreement',
  documents: [
    {
      name: 'rental-agreement',
      file: file_data
    }
  ],
  submitters: [
    {
      role: 'First Party',
      email: 'john.doe@example.com'
    }
  ]
)
```

#### Php

```
$filePath = 'path/to/your/file.pdf';
$fileData = base64_encode(file_get_contents($filePath));

$docuseal = new DocusealApi('API_KEY', 'https://api.docuseal.com');

$submission = $docuseal->createSubmissionFromPdf([
  'name' => 'Rental Agreement',
  'documents' => [
    [
      'name' => 'rental-agreement',
      'file' => $fileData
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

#### Java

```
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var fileData = Base64.getEncoder().encodeToString(Files.readAllBytes(Path.of("path/to/your/file.pdf")));

var submission = client.createSubmissionFromPdf(CreateSubmissionFromPdfParams.builder()
    .documents(List.of(
      CreateSubmissionFromPdfDocumentParams.builder()
        .name("rental-agreement")
        .file(fileData)
        .build()))
    .submitters(List.of(
      CreateSubmissionSubmitterParams.builder()
        .email("john.doe@example.com")
        .role("First Party")
        .build()))
    .name("Rental Agreement")
    .build());
```

#### Csharp

```
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var fileData = Convert.ToBase64String(File.ReadAllBytes("path/to/your/file.pdf"));

var submission = await client.CreateSubmissionFromPdfAsync(new CreateSubmissionFromPdfParams
{
    Name = "Rental Agreement",
    Documents = [
        new CreateSubmissionFromPdfDocumentParams
        {
            Name = "rental-agreement",
            File = fileData
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

#### Go

```
ds := docuseal.NewClient(
	"API_KEY",
	docuseal.WithBaseURL("https://api.docuseal.com"),
)

fileBytes, _ := os.ReadFile("path/to/your/file.pdf")
fileData := base64.StdEncoding.EncodeToString(fileBytes)

submission, err := ds.CreateSubmissionFromPdf(context.Background(), &docuseal.CreateSubmissionFromPdfParams{
	Name: "Rental Agreement",
	Documents: []*docuseal.CreateSubmissionFromPdfDocumentParams{
		{
			Name: "rental-agreement",
			File: fileData,
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
