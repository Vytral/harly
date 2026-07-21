# Use dynamic content variables in DOCX to create personalized documents

Prerequisites:

**Sign Up and Obtain API Key:** Visit [DocuSeal API Console](https://console.docuseal.com/api) to obtain your API key.

## Dynamic content variables

Dynamic content variables are a powerful feature for building personalized documents for each signer. They enable automatic insertion of data such as the signer's name, email address, signing date, and other details. During template generation, these values are directly populated into the DOCX template, as if each document had been created manually.

[Download example DOCX](https://www.docuseal.com/examples/demo_template.docx)

## 1.1 Simple variables

Simple variables use the format `[[variable_name]]` and can be applied to insert text, numbers, or dates. For example, if you add the variable `[[signer_name]]` into a DOCX file, it will be replaced with the signer's actual name when the template is generated.

 Example: 

| The Purchase Agreement is between **[[signer\_name]]** and DocuSeal LLC. |

## 1.2 Conditional logic

Conditional logic variables allow you to include or exclude specific parts of the document. They are especially useful for creating templates with multiple content variations depending on certain conditions.

The `[[if:var]]...[[end]]` condition allows you to include or exclude a block of text based on the logical value `true/false` of a variable. If the variable is not set or has the value false, the block of text will be skipped.

The `[[if:var]]...[[else]]...[[end]]` condition allows you to include one of two text blocks based on the boolean value true/false of a variable. If the variable is set to true, the first block of text is included; otherwise, the second [[else]] block is used.  
Note: The variable\_name in `[[end:variable_name]]` is optional, but including it can improve readability.

 Example: 

| Your order has been processed. **[[if:is\_vip]]** Thank you for being a valued VIP customer! **[[end]]** |
| Your order has been processed. **[[if:is\_vip]]** Thank you for being a valued VIP customer! **[[else]]** Thank you for being our customer. **[[end:is\_vip]]** |

## 1.3 Lists and tables

`[[for:items]]...[[end]]` loops allow you to generate repeated blocks of content based on array variables. This is especially useful for generating lists or rows where the number of items may vary. Array variables can be provided in two formats: as an array of simple values (e.g., strings or numbers) or as an array of objects (where each object contains multiple properties).

The array of objects allows you to create a **list** or **table** based on an array of objects, where each object contains multiple properties. You can access each property of the object using dot notation within the loop and the singular form of the items list variable (e.g., invoices → invoice).

Here is an example of a DOCX table generated with a for loop and array variables:

 Example: 

| **[[for:items]]** - **[[item.name]]** (**[[item.quantity]]**) **[[end]]** |


```
{
  "invoices": [
    { "name": "Dell XPS 15 Laptop", "quantity": "2", "price": "1250.00", "total": "2500.00" },
    { "name": "Logitech MX Master 3S Mouse", "quantity": "1", "price": "150.00", "total": "150.00" }
  ]
}
```

| Name | Quantity | Price | Total |
| --- | --- | --- | --- |
| **[[for:invoices]]** [[invoice.name]] | [[invoice.quantity]] | [[invoice.price]] | [[invoice.total]]**[[end]]** |

## 1.4 HTML content variables

In some cases, you may need more advanced text formatting, such as lists, bold text, or hyperlinks. For this purpose, you can use HTML content variables, which allow you to insert dynamic content, styled and formatted with HTML, directly into a DOCX file. HTML variables use the same format as simple variables [[variable\_name]], but the value of the variable must contain HTML content.

### HTML paragraphs

You can use HTML tags to create styled paragraphs with different formatting styles. Below is an example of an HTML variable value that generates a paragraph with styled text and colors:

 Example: 


```
<p><b style="color: #1976D2; text-decoration: underline;">50 Dell XPS 15 Laptops</b> Monitors with additional accessories including Logitech MX Master 3S mice and Samsung 4K displays.</p>
```

### HTML lists

The ul, ol, and li tags can be used for lists and styled with inline CSS.

 Below is an example of an HTML variable value that generates a bulleted list with styled text and colors: 

 Example: 


```
<ul>
  <li><b style="color: #1976D2; text-decoration: underline;">50 Dell XPS 15 Laptops</b></li>
  <li><b style="color: #388E3C; text-decoration: underline;">100 Logitech MX Master <i style="color: #FBC02D; font-style: italic; text-decoration: underline;">3S</i> mice</b></li>
  <li><b style="color: #D32F2F; text-decoration: underline;">25 Samsung <i style="color: #0288D1; font-style: italic; text-decoration: underline;">4K</i> Monitors</b></li>
</ul>
```

### HTML tables

The table, tr, th, and td tags can be used to build tables with styled text and colors using inline CSS.

Table cells can also include CSS styles and other HTML formatting, just like a regular paragraph. This allows you to add custom styles, links, and formatting within table contents as needed.

The generated DOCX will contain the table built from dynamic HTML content variables:

 Example: 


```
<table border="1" style="border-collapse: collapse; border: 2px solid #444;">
  <tr>
    <th style="border: 2px solid #444; padding: 8px;"><b>Item</b></th>
    <th style="border: 2px solid #444; padding: 8px;"><b>Qty</b></th>
    <th style="border: 2px solid #444; padding: 8px; text-align: center;"><b>Price</b></th>
  </tr>
  <tr>
    <td style="border: 2px solid #444; padding: 8px;">External Hard Drive</td>
    <td style="border: 2px solid #444; padding: 8px;">10</td>
    <td style="border: 2px solid #444; padding: 8px; text-align: center;"><b>$80</b></td>
  </tr>
  <tr>
    <td style="border: 2px solid #444; padding: 8px;">USB-C Hub</td>
    <td style="border: 2px solid #444; padding: 8px;">15</td>
    <td style="border: 2px solid #444; padding: 8px; text-align: center;"><b>$45</b></td>
  </tr>
</table>
```

### HTML links

The a tag can be used to insert hyperlinks directly into a DOCX file.

The result will contain an HTML link inside the DOCX, as below:

 Example: 


```
<p>For more information, visit the <a href="https://www.example.com" style="color: #1976D2; text-decoration: underline;">Example Link</a></p>
```

## Embedded field text tags

While content variables allow you to insert dynamic content anywhere in a DOCX file, embedded field text tags are used to insert special fields such as signature blocks, dates, initials, and other interactive elements. These tags are recognized by the system when the template is generated and are replaced with the corresponding interactive fields. Each tag includes a defined field name along with its associated attributes:

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

Learn more about using embedded field text tags in the [Use embedded text field tags in the PDF to create a fillable form](https://www.docuseal.com/guides/use-embedded-text-field-tags-in-the-pdf-to-create-a-fillable-form) guide.

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

## Send DOCX to the API

Use `POST https://api.docuseal.com/submissions/docx` API to create a one-off submission request document from the given DOCX with content variables and embedded text field tags.

API request body should contain JSON payload with `"file": '...'` encoded as base64 string value.

**Learn more:**

[REST API Reference](https://www.docuseal.com/docs/api#create-a-submission-from-docx)

[DOCX content variables example file](https://www.docuseal.com/examples/demo_template.docx)

#### Javascript

```
const docuseal = require('@docuseal/api');
const fs = require('fs')

const filePath = 'path/to/your/file.docx';
const fileData = fs.readFileSync(filePath, { encoding: 'base64' });

docuseal.configure({ key: 'API_KEY', url: 'https://api.docuseal.com' });

const submission = await docuseal.createSubmissionFromDocx({
  name: 'Rental Agreement',
  variables: {
    signer_name: 'John Doe',
    is_vip: true,
    items: ['Item A', 'Item B', 'Item C'],
    table_rows: [
      { number: '1', name: 'Item A', quantity: '2', price: '50.00', total: '100.00'},
      { number: '2', name: 'Item B', quantity: '1', price: '150.00', total: '150.00'}
    ],
    html_paragraph: '<p><b style="color: #1976D2; text-decoration: underline;">50 Dell XPS 15 Laptops</b> Monitors</p>',
  },
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

const filePath = 'path/to/your/file.docx';
const fileData = fs.readFileSync(filePath, { encoding: 'base64' });

docuseal.configure({ key: 'API_KEY', url: 'https://api.docuseal.com' });

const submission = await docuseal.createSubmissionFromDocx({
  name: 'Rental Agreement',
  variables: {
    signer_name: 'John Doe',
    is_vip: true,
    items: ['Item A', 'Item B', 'Item C'],
    table_rows: [
      { number: '1', name: 'Item A', quantity: '2', price: '50.00', total: '100.00'},
      { number: '2', name: 'Item B', quantity: '1', price: '150.00', total: '150.00'}
    ],
    html_paragraph: '<p><b style="color: #1976D2; text-decoration: underline;">50 Dell XPS 15 Laptops</b> Monitors</p>',
  },
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

file_path = "path/to/your/file.docx"
with open(file_path, "rb") as f:
    file_data = base64.b64encode(f.read()).decode()

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

submission = docuseal.create_submission_from_docx({
  "name": "Rental Agreement",
  "variables": {
    "signer_name": "John Doe",
    "is_vip": True,
    "items": ["Item A", "Item B", "Item C"],
    "table_rows": [
      { "number": "1", "name": "Item A", "quantity": "2", "price": "50.00", "total": "100.00"},
      { "number": "2", "name": "Item B", "quantity": "1", "price": "150.00", "total": "150.00"}
    ],
    "html_paragraph": '<p><b style="color: #1976D2; text-decoration: underline;">50 Dell XPS 15 Laptops</b> Monitors</p>',
  },
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

file_path = 'path/to/your/file.docx'
file_data = Base64.strict_encode64(File.read(file_path))

Docuseal.key = ENV['DOCUSEAL_API_KEY']
Docuseal.url = 'https://api.docuseal.com'

submission = Docuseal.create_submission_from_docx(
  name: 'Rental Agreement',
  variables: {
    signer_name: 'John Doe',
    is_vip: true,
    items: ['Item A', 'Item B', 'Item C'],
    table_rows: [
      { number: '1', name: 'Item A', quantity: '2', price: '50.00', total: '100.00'},
      { number: '2', name: 'Item B', quantity: '1', price: '150.00', total: '150.00'}
    ],
    html_paragraph: '<p><b style="color: #1976D2; text-decoration: underline;">50 Dell XPS 15 Laptops</b> Monitors</p>',
  },
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
$filePath = 'path/to/your/file.docx';
$fileData = base64_encode(file_get_contents($filePath));

$docuseal = new DocusealApi('API_KEY', 'https://api.docuseal.com');

$submission = $docuseal->createSubmissionFromDocx([
  'name' => 'Rental Agreement',
  'variables' => [
    'signer_name' => 'John Doe',
    'is_vip' => true,
    'items' => ['Item A', 'Item B', 'Item C'],
    'table_rows' => [
      ['number' => '1', 'name' => 'Item A', 'quantity' => '2', 'price' => '50.00', 'total' => '100 .00'],
      ['number' => '2', 'name' => 'Item B', 'quantity' => '1', 'price' => '150.00', 'total' => '150.00']
    ],
    'html_paragraph' => '<p><b style="color: #1976D2; text-decoration: underline;">50 Dell XPS 15 Laptops</b> Monitors</p>',
  ],
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

var fileData = Base64.getEncoder().encodeToString(Files.readAllBytes(Path.of("path/to/your/file.docx")));

var submission = client.createSubmissionFromDocx(CreateSubmissionFromDocxParams.builder()
    .documents(List.of(
      CreateSubmissionFromDocxDocumentParams.builder()
        .name("rental-agreement")
        .file(fileData)
        .build()))
    .submitters(List.of(
      CreateSubmissionSubmitterParams.builder()
        .email("john.doe@example.com")
        .role("First Party")
        .build()))
    .name("Rental Agreement")
    .variables(Map.<String, Object>of(
      "signer_name", "John Doe",
      "is_vip", true,
      "items", List.of("Item A", "Item B", "Item C"),
      "table_rows", List.of(
        Map.of("number", "1", "name", "Item A", "quantity", "2", "price", "50.00", "total", "100.00"),
        Map.of("number", "2", "name", "Item B", "quantity", "1", "price", "150.00", "total", "150.00")),
      "html_paragraph", """
<p><b style="color: #1976D2; text-decoration: underline;">50 Dell XPS 15 Laptops</b> Monitors</p>"""))
    .build());
```

#### Csharp

```
var client = new DocusealClient("API_KEY", "https://api.docuseal.com");

var fileData = Convert.ToBase64String(File.ReadAllBytes("path/to/your/file.docx"));

var submission = await client.CreateSubmissionFromDocxAsync(new CreateSubmissionFromDocxParams
{
    Name = "Rental Agreement",
    Variables = new Dictionary<string, object?>
    {
        ["signer_name"] = "John Doe",
        ["is_vip"] = true,
        ["items"] = new[] { "Item A", "Item B", "Item C" },
        ["table_rows"] = new[]
        {
            new Dictionary<string, string>
            {
                ["number"] = "1", ["name"] = "Item A", ["quantity"] = "2", ["price"] = "50.00", ["total"] = "100.00"
            },
            new Dictionary<string, string>
            {
                ["number"] = "2", ["name"] = "Item B", ["quantity"] = "1", ["price"] = "150.00", ["total"] = "150.00"
            },
        },
        ["html_paragraph"] = """<p><b style="color: #1976D2; text-decoration: underline;">50 Dell XPS 15 Laptops</b> Monitors</p>"""
    },
    Documents = [
        new CreateSubmissionFromDocxDocumentParams
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

fileBytes, _ := os.ReadFile("path/to/your/file.docx")
fileData := base64.StdEncoding.EncodeToString(fileBytes)

submission, err := ds.CreateSubmissionFromDocx(context.Background(), &docuseal.CreateSubmissionFromDocxParams{
	Name: "Rental Agreement",
	Variables: map[string]any{
		"signer_name": "John Doe",
		"is_vip": true,
		"items": []string{"Item A", "Item B", "Item C"},
		"table_rows": []map[string]string{
			{"number": "1", "name": "Item A", "quantity": "2", "price": "50.00", "total": "100.00"},
			{"number": "2", "name": "Item B", "quantity": "1", "price": "150.00", "total": "150.00"},
		},
		"html_paragraph": `<p><b style="color: #1976D2; text-decoration: underline;">50 Dell XPS 15 Laptops</b> Monitors</p>`,
	},
	Documents: []*docuseal.CreateSubmissionFromDocxDocumentParams{
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
