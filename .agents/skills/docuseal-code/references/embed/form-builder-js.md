# DocuSeal Form Builder — JavaScript

This component allows you to seamlessly integrate an entire document creation and signing form anywhere on your website or application. It supports **JS+HTML** , **Vue** , **Angular** and **React**.

## Installation

```html
<script src="https://cdn.docuseal.com/js/builder.js"></script>
```

## Basic Example

```html
<script src="https://cdn.docuseal.com/js/builder.js"></script>

<docuseal-builder
  data-token="<%= JWT.encode({
    user_email: 'admin@company.com',
    integration_email: 'signer@example.com',
    name: 'Integration W-9 Test Form',
    document_urls: ['https://www.irs.gov/pub/irs-pdf/fw9.pdf'],
  }, 'YOUR_API_KEY') %>">
</docuseal-builder>
```

## Attributes

| Attribute | Type | Required | Default | Description |
|---|---|---|---|---|
| `data-token` | `object` | yes | — | JSON Web Token (JWT HS256) with a payload signed using the API key. **Ensure that the JWT token is generated on the backend to prevent unauthorized access to your documents**. See nested properties below. |
| `data-host` | `string` | no | — | DocuSeal host domain name. Only use this attribute if you are using the on-premises DocuSeal installation or docuseal.eu Cloud. Example: `yourdomain.com` |
| `data-roles` | `string` | no | — | Comma separated submitter role names to be used by default in the form. Example: `Company,Customer` |
| `data-fields` | `array` | no | — | A list of default custom fields with `name` to be added to the document. Should contain an array of field properties as a JSON encoded string. Example: `[{ "name": "FIELD_1", "type": "date", "role": "Customer", "default_value": "2021-01-01" }]` See nested properties below. |
| `data-submitters` | `array` | no | — | A list of default submitters with `role` name to be added to the document. Should contain an array of field properties as a JSON encoded string. Example: `[{ "email": "example@company.com", "name": "John Doe", "phone": "+1234567890", "role": "Customer" }]` See nested properties below. |
| `data-required-fields` | `array` | no | — | A list of required default custom fields with `name` that should be added to the document. Should contain an array of field properties as a JSON encoded string. Example: `[{ "name": "FIELD_1", "type": "date", "role": "Customer", "default_value": "2021-01-01" }]` See nested properties below. |
| `data-field-types` | `string` (enum) | no | — | Comma separated field type names to be used in the form builder. All field types are used by default. Example: `text,date` Values: `heading`, `text`, `signature`, `initials`, `date`, `datenow`, `number`, `image`, `checkbox`, `multiple`, `file`, `radio`, `select`, `cells`, `stamp`, `payment`, `phone`, `verification`, `kba`, `strikethrough`. |
| `data-date-formats` | `string` | no | — | Comma separated list of formats to be used for the date field. Formats may include date ('YYYY', 'MM', 'DD'), time ('HH', 'hh', 'mm', 'ss', 'A') and timezone ('z') parts. The first format in the list is used as the default. Example: `MM/DD/YYYY,YYYY-MM-DD HH:mm:ss z` |
| `data-draw-field-type` | `string` | no | `text` | Field type to be used by default with the field drawing tool. Example: `signature` |
| `data-custom-button-title` | `string` | no | — | Custom button title. This button will be displayed on the top right corner of the form builder. |
| `data-custom-button-url` | `string` | no | — | Custom button URL. Only absolute URLs are supported. |
| `data-with-title` | `boolean` | no | `true` | Set `false` to remove document title from the builder. |
| `email-subject` | `string` | no | — | Email subject for the signature request. Required if `email-body` specified |
| `email-body` | `string` | no | — | Email body for the signature request. Required if `email-subject` specified |
| `data-with-send-button` | `boolean` | no | `true` | Show the "Recipients" button. |
| `data-with-upload-button` | `boolean` | no | `true` | Show the "Upload" button. |
| `data-with-add-page-button` | `boolean` | no | — | Show the "Add Blank Page" button. |
| `data-with-sign-yourself-button` | `boolean` | no | `true` | Show the "Sign Yourself" button. |
| `data-with-documents-list` | `boolean` | no | `true` | Set `false` to not show the documents list on the left. Documents list is displayed by default. |
| `data-with-dynamic-documents` | `boolean` | no | — | Set `true` to allow converting DOCX files to editable dynamic documents. |
| `data-with-fields-list` | `boolean` | no | `true` | Set `false` to not show the fields list on the right. Fields list is displayed by default. |
| `data-with-fields-detection` | `boolean` | no | — | Display a button to automatically detect and add fields to the document with AI. |
| `data-with-custom-fields-tab` | `boolean` | no | — | Set `true` to display a separate "Custom" fields tab in the fields list. Custom fields can be configured using the `data-fields` or `data-required-fields` attribute. |
| `data-with-field-placeholder` | `boolean` | no | — | Set `true` to display field name placeholders instead of the field type icons. |
| `data-with-signature-id` | `boolean` | no | — | Set to `true` to enable Signature ID by default for newly added fields. If set to `false`, the Signature ID toggle will be displayed under field settings, with the Signature ID turned off by default. |
| `data-with-revisions` | `boolean` | no | — | Set `true` to save revisions and display a dropdown next to the Save button that provides access to the template revisions history. |
| `data-preview` | `boolean` | no | — | Show template in preview mode without ability to edit it. |
| `data-input-mode` | `boolean` | no | — | Open template in data input mode to prefill fields with default values. |
| `data-only-defined-fields` | `boolean` | no | — | Allow to add fields only defined in the `data-fields` attribute. |
| `data-autosave` | `boolean` | no | `true` | Set `false` to disable form changes autosaving. |
| `data-i18n` | `string` | no | `{}` | JSON encoded string that contains i18n keys to replace the default UI text with custom values. See [template\_builder/i18n.js](https://github.com/docusealco/docuseal/blob/master/app/javascript/template_builder/i18n.js) for available i18n keys. |
| `data-language` | `string` | no | `en` | UI language, 'en', 'es', 'de', 'fr', 'pt', 'nl', 'he', 'ar' languages are available. |
| `data-background-color` | `string` | no | — | The form builder background color. Only HEX color codes are supported. Example: `#ffffff` |
| `data-custom-css` | `string` | no | — | Custom CSS styles to be applied to the form builder. Example: `#sign_yourself_button { background-color: #FFA500; }` |

### `data-token` properties

| Property | Type | Required | Description |
|---|---|---|---|
| `user_email` | `string` | yes | Email of the owner of the API signing key - admin user email. |
| `integration_email` | `string` | no | Email of the user to create a template for. Example: `signer@example.com` |
| `template_id` | `number` | no | ID of the template to open in the form builder. Optional when `document_urls` are specified. |
| `external_id` | `string` | no | Your application-specific unique string key to identify this template within your app. |
| `folder_name` | `string` | no | The folder name in which the template should be created. |
| `document_urls` | `array` | no | An Array of URLs with PDF files to open in the form builder. Optional when `template_id` is specified. Example: `['https://www.irs.gov/pub/irs-pdf/fw9.pdf']` |
| `name` | `string` | no | New template name when creating a template with document\_urls specified. Example: `Integration W-9 Test Form` |
| `extract_fields` | `boolean` | no | Pass `false` to disable automatic PDF form fields extraction. PDF fields are automatically added by default. |

### `data-fields` item properties

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | yes | Field name. |
| `type` | `string` | no | Field type. Values: `heading`, `text`, `signature`, `initials`, `date`, `number`, `image`, `checkbox`, `multiple`, `file`, `radio`, `select`, `cells`, `stamp`, `payment`, `phone`, `verification`, `kba`, `strikethrough`. |
| `role` | `string` | no | Submitter role name for the field. |
| `default_value` | `string` | no | Default value of the field. |
| `title` | `string` | no | Field title displayed to the user instead of the name, shown on the signing form. Supports Markdown. |
| `description` | `string` | no | Field description displayed on the signing form. Supports Markdown. |
| `width` | `number` | no | Field width in pixels. |
| `height` | `number` | no | Field height in pixels. |
| `format` | `string` | no | Field format. Depends on the field type. |
| `options` | `array` | no | Field options. Required for the select field type. |
| `validation` | `object` | no | Field validation rules. See nested properties below. |

### `data-submitters` item properties

| Property | Type | Required | Description |
|---|---|---|---|
| `email` | `string` | no | Submitter email. |
| `role` | `string` | yes | Submitter role name. |
| `name` | `string` | no | Submitter name. |
| `phone` | `string` | no | Submitter phone number, formatted according to the E.164 standard. |

### `data-required-fields` item properties

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | yes | Field name. |
| `type` | `string` | no | Field type. Values: `heading`, `text`, `signature`, `initials`, `date`, `number`, `image`, `checkbox`, `multiple`, `file`, `radio`, `select`, `cells`, `stamp`, `payment`, `phone`, `verification`, `kba`, `strikethrough`. |
| `role` | `string` | no | Submitter role name for the field. |
| `default_value` | `string` | no | Default value of the field. |
| `title` | `string` | no | Field title displayed to the user instead of the name, shown on the signing form. Supports Markdown. |
| `description` | `string` | no | Field description displayed on the signing form. Supports Markdown. |
| `width` | `number` | no | Field width in pixels. |
| `height` | `number` | no | Field height in pixels. |
| `format` | `string` | no | Field format. Depends on the field type. |
| `options` | `array` | no | Field options. Required for the select field type. |
| `validation` | `object` | no | Field validation rules. See nested properties below. |

## Events

| Event | Description | Example |
|---|---|---|
| `load` | Custom event to be triggered on loading the form builder template data. | `document.querySelector('docuseal-builder').addEventListener('load', (e) => e.detail)` |
| `upload` | Custom event to be triggered on uploading a document to the template. | `document.querySelector('docuseal-builder').addEventListener('upload', (e) => e.detail)` |
| `send` | Custom event to be triggered on sending documents for signature to recipients. | `document.querySelector('docuseal-builder').addEventListener('send', (e) => e.detail)` |
| `change` | Custom event to be triggered every time a change to the template is made. | `document.querySelector('docuseal-builder').addEventListener('change', (e) => e.detail)` |
| `save` | Custom event to be triggered on saving changes of the template form. | `document.querySelector('docuseal-builder').addEventListener('save', (e) => e.detail)` |

## JWT Token (required)

The Form Builder requires a JWT signed with your DocuSeal API key. **Generate the JWT on the backend** — never expose the API key to the client.

Minimal payload:

```json
{
  "user_email": "admin@company.com",
  "integration_email": "saas-user@company.com",
  "external_id": "TEMPLATE_ID",
  "name": "New Template",
  "document_urls": ["https://example.com/doc.pdf"]
}
```

Ready-made JWT examples (Node/TypeScript/Ruby/Python/PHP/Java/C#/Go): see [form-builder-jwt-token.md](form-builder-jwt-token.md).

## Guides

Step-by-step walkthroughs. Load individually to keep context small:

- [Generate JWT on your back-end to authorize users](form-builder-js-generate-jwt-on-your-back-end-to-authorize-users.md)
- [Render HTML form element with JWT](form-builder-js-render-html-form-element-with-jwt.md)
- [Styling the Builder with custom CSS](form-builder-js-styling-the-builder-with-custom-css.md)

## Related

- EU Cloud / self-hosted host config: [form-builder-hosts.md](form-builder-hosts.md)
- Custom CSS theming: [form-builder-custom-css.md](form-builder-custom-css.md)
- JWT token generation: [form-builder-jwt-token.md](form-builder-jwt-token.md)
- Security recommendations: [form-builder-security-recommendations.md](form-builder-security-recommendations.md)
