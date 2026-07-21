# Create PDF document fillable form with HTML

**Prerequisites:**

**Sign Up and Obtain API Key:** Visit [DocuSeal API Console](https://console.docuseal.com/api) to obtain your API key.

## HTML field tags

HTML is a universal tool for building dynamic PDF forms with ease. Using custom tags like `<text-field>`, `<signature-field>`, and other 9 field types. These tags, coupled with the style attribute, enable developers to precisely define the width and height of form fields. For instance, utilizing HTML tags within your HTML structure grants you granular control over each element's positioning and dimensions. This level of customization ensures that the final form aligns perfectly with your design requirements.

HTML field tags can contain the following attributes:

- `name`: Name of the field in the template. 
- `role`: signer role name. Specify different names in case the document contains multiple signing parties with their own set of fields. 
- `default`: default field value to be used in the template. 
- `required`: set false to make the field optional and skippable. true by default. 
- `readonly`: set true to make it impossible for the signer to edit the pre-filled field value. false by default. 
- `title`: field title shown instead of the field name in the signing interface. 
- `description`: the field description displayed after the field name or title in the signing interface. 
- `option`: option value for multi-select and radio field types. Fields with the same name are grouped into radio and multi-select groups with passed option values. 
- `condition`: FieldName:value to show the field only if the condition is met for the value in other field. Pass only FieldName to set a condition for a non-empty field. 
- `options`: comma separated list of options for select field type. 
- `pattern`: HTML field validation pattern string based on [https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/pattern](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/pattern) specification. 
- `format`: the data format for date and signature fields. Possible values depend on the field type: 
  - **date field** can be, for example: DD/MM/YYYY (Default: MM/DD/YYYY) 
  - **signature field** can accept only: drawn, typed, drawn\_or\_typed, upload. (Default: drawn\_or\_typed ) 
  - **number field** can accept: usd, eur, gbp currency formats. 

- `min`: Minimum allowed number value or date depending on field type. 
- `max`: Maximum allowed number value or date depending on field type. 
- `font`: font name to be used in the field. Can accept Times, Helvetica or Courier PDF default fonts to be used for the field font. 
- `font-size`: font size of the text value. This attribute is optional, default font size will be calculated based on the field height by default. 
- `font-type`: font type to be used in the field. Can accept bold, italic or bold\_italic font types to be used for the field value. 
- `color`: blue or red color of the text value or signature. This attribute is optional, default black color is used when not specified. 
- `align`: Horizontal alignment of the text value. This attribute is optional, with possible values being left, center, or right. Default is left when not specified. 
- `valign`: Vertical alignment of the text value. This attribute is optional, with possible values being top, center, or bottom. Default is center when not specified. 
- `mask`: set true to make sensitive data masked on the document. false by default. 
- `method`: set "aes" or "qes" identity verification-field field method. 


```
<text-field>
</text-field>
```


```
<signature-field>
</signature-field>
```


```
<date-field name="Date">
</date-field>
```


```
<image-field name="Photo">
</image-field>
```


```
<initials-field>
</initials-field>
```


```
<phone-field name="Phone">
</phone-field>
```


```
<stamp-field readonly="true">
</stamp-field>
```


```
<file-field name="Resume">
</file-field>
```


```
<checkbox-field>
</checkbox-field>
```


```
<radio-field
  options="opt1,opt2">
</radio-field>
```


```
<select-field
  options="opt1,opt2">
</select-field>
```


```
<multi-select-field
  options="opt1,opt2">
</multi-select-field>
```


```
<payment-field
  price="100" currency="USD">
</payment-field>
```


```
<verification-field
  method="aes">
</verification-field>
```

## Creating HTML layout

To begin crafting PDF document templates, start by creating a structured HTML, incorporating these custom field tags. Use Chrome print preview feature to get a real-time visualization of the document appearance as a PDF.

Custom CSS, whether embedded inline or linked externally, can be used to refine the visual design of the document.


```
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>Rental Agreement</title>
  </head>
  <body>
    <div
      style="width: 80%; margin: 0 auto; padding: 20px; border: 1px solid #ccc;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2>Rental Agreement</h2>
      </div>
      <p>This Rental Agreement (the "Agreement") is made and entered into by and
        between:</p>
      <p style="display: flex; align-items: center;">
        <span>Party A: </span>
        <text-field
          name="Full Name"
          role="Property Owner"
          style="width: 160px; height: 20px; display: inline-block;">
        </text-field>
      </p>
      <p>and</p>
      <p style="display: flex; align-items: center;">
        <span>Party B: </span>
        <text-field
          name="Full Name"
          role="Renter"
          style="width: 160px; height: 20px; display: inline-block;">
        </text-field>
      </p>
      <p>...</p>
      <div
        style="display: flex; justify-content: space-between; margin-top: 50px;">
        <div style="text-align: left;">
          <p style="display: flex; align-items: center;">
            <text-field
              name="Full Name"
              role="Property Owner"
              style="width: 160px; height: 20px; display: inline-block;">
            </text-field>
          </p>
          <p>Party A</p>
          <p style="display: flex; align-items: center;">
            <span>Date: </span>
            <date-field
              name="Date"
              role="Property Owner"
              style="width: 100px; height: 20px; display: inline-block;">
            </date-field>
          </p>
          <signature-field
            name="Property Owner's Signature"
            role="Property Owner"
            style="width: 160px; height: 80px; display: inline-block;">
          </signature-field>
        </div>
        <div style="text-align: left;">
          <p style="display: flex; align-items: center;">
            <text-field
              name="Full Name"
              role="Renter"
              style="width: 160px; height: 20px; display: inline-block;">
            </text-field>
          </p>
          <p>Party B (Renter)</p>
          <p style="display: flex; align-items: center;">
            <span>Date: </span>
            <date-field
              name="Date"
              role="Renter"
              style="width: 100px; height: 20px; display: inline-block;">
            </date-field>
          </p>
          <signature-field
            name="Renter's Signature"
            role="Renter"
            style="width: 160px; height: 80px; display: inline-block;">
          </signature-field>
        </div>
      </div>
    </div>
  </body>
</html>
```

## Adding header and footer (optional)

Additionally, it's possible to add headers and footers to every page using the `html_header` and `html_footer` parameters.

Use special html tags to add page number and total pages in the header or footer: `<span class="pageNumber"></span>`, `<span class="totalPages"></span>`.


```
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { margin: auto 10px; font-size: 11pt }
    </style>
  </head>
  <body>
    <p><span class="pageNumber"></span> of <span class="totalPages"></span></p>
  </body>
</html>
```

## Send HTML to the API

Use `POST https://api.docuseal.com/submissions/html` API to create a one-off submission request document from the given HTML.

API request body should contain JSON payload with `"html": '...'` string value.

**Learn more:**

[REST API Reference](https://www.docuseal.com/docs/api#create-a-template-from-html)

[Style document page with CSS](https://www.docuseal.com/blog/css-print-page-style)

#### Javascript

```
const docuseal = require('@docuseal/api');

docuseal.configure({ key: 'API_KEY', url: 'https://api.docuseal.com' });

const html = '<!DOCTYPE html>...';
const html_header = '<!DOCTYPE html>...';
const html_footer = '<!DOCTYPE html>...';

const submission = await docuseal.createSubmissionFromHtml({
  name: 'Rental Agreement',
  documents: [
    {
      name: 'rental-agreement',
      html: html,
      html_header: html_header,
      html_footer: html_footer,
      size: 'A4'
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

docuseal.configure({ key: 'API_KEY', url: 'https://api.docuseal.com' });

const html = '<!DOCTYPE html>...';
const html_header = '<!DOCTYPE html>...';
const html_footer = '<!DOCTYPE html>...';

const submission = await docuseal.createSubmissionFromHtml({
  name: 'Rental Agreement',
  documents: [
    {
      name: 'rental-agreement',
      html: html,
      html_header: html_header,
      html_footer: html_footer,
      size: 'A4'
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
from docuseal import docuseal

docuseal.key = "API_KEY"
docuseal.url = "https://api.docuseal.com"

html = '<!DOCTYPE html>...';
html_header = '<!DOCTYPE html>...';
html_footer = '<!DOCTYPE html>...';

submission = docuseal.create_submission_from_html({
  "name": "Rental Agreement",
  "documents": [
    {
      "name": "rental-agreement",
      "html": html,
      "html_header": html_header,
      "html_footer": html_footer,
      "size": "A4"
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
require "docuseal"

Docuseal.key = ENV["DOCUSEAL_API_KEY"]
Docuseal.url = "https://api.docuseal.com"

html = '<!DOCTYPE html>...';
html_header = '<!DOCTYPE html>...';
html_footer = '<!DOCTYPE html>...';

submission = Docuseal.create_submission_from_html({
  name: 'Rental Agreement',
  documents: [
    {
      name: 'rental-agreement',
      html: html,
      html_header: html_header,
      html_footer: html_footer,
      size: 'A4'
    }
  ],
  submitters: [
    {
      role: 'First Party',
      email: 'john.doe@example.com'
    }
  ]
})
```

#### Php

```
$docuseal = new DocusealApi('API_KEY', 'https://api.docuseal.com');

$html = '<!DOCTYPE html>...';
$html_header = '<!DOCTYPE html>...';
$html_footer = '<!DOCTYPE html>...';

$submission = $docuseal->createSubmissionFromHtml([
  'name' => 'Rental Agreement',
  'documents' => [
    [
      'name' => 'rental-agreement',
      'html' => $html,
      'html_header' => $html_header,
      'html_footer' => $html_footer,
      'size' => 'A4'
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

var html = "<!DOCTYPE html>...";
var htmlHeader = "<!DOCTYPE html>...";
var htmlFooter = "<!DOCTYPE html>...";

var submission = client.createSubmissionFromHtml(CreateSubmissionFromHtmlParams.builder()
    .documents(List.of(
      CreateSubmissionFromHtmlDocumentParams.builder()
        .html(html)
        .name("rental-agreement")
        .htmlHeader(htmlHeader)
        .htmlFooter(htmlFooter)
        .size(PageSize.A4)
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

var html = "<!DOCTYPE html>...";
var htmlHeader = "<!DOCTYPE html>...";
var htmlFooter = "<!DOCTYPE html>...";

var submission = await client.CreateSubmissionFromHtmlAsync(new CreateSubmissionFromHtmlParams
{
    Name = "Rental Agreement",
    Documents = [
        new CreateSubmissionFromHtmlDocumentParams
        {
            Name = "rental-agreement",
            Html = html,
            HtmlHeader = htmlHeader,
            HtmlFooter = htmlFooter,
            Size = PageSize.A4
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

html := "<!DOCTYPE html>..."
htmlHeader := "<!DOCTYPE html>..."
htmlFooter := "<!DOCTYPE html>..."

submission, err := ds.CreateSubmissionFromHtml(context.Background(), &docuseal.CreateSubmissionFromHtmlParams{
	Name: "Rental Agreement",
	Documents: []*docuseal.CreateSubmissionFromHtmlDocumentParams{
		{
			Name: "rental-agreement",
			Html: html,
			HtmlHeader: htmlHeader,
			HtmlFooter: htmlFooter,
			Size: "A4",
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

#### Curl

```
curl --request POST \
  --url https://api.docuseal.com/submissions/html \
  --header 'X-Auth-Token: API_KEY' \
  --header 'content-type: application/json' \
  --data '{"name":"Rental Agreement","documents":[{"name":"rental-agreement","html":"<!DOCTYPE html>...","html_header":"<!DOCTYPE html>...","html_footer":"<!DOCTYPE html>...","size":"A4"}],"submitters":[{"role":"First Party","email":"john.doe@example.com"}]}'
```
