# DocuSeal Form Builder — Angular

This component allows you to seamlessly integrate an entire document creation and signing form anywhere on your website or application. It supports **JS+HTML** , **Vue** , **Angular** and **React**.

## Installation

```bash
npm install @docuseal/angular
```

Source: https://github.com/docusealco/docuseal-angular

## Basic Example

```jsx
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DocusealBuilderComponent } from '@docuseal/angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DocusealBuilderComponent],
  template: `
    <div class="app">
      <ng-container *ngIf="token">
        <docuseal-builder [token]="token"></docuseal-builder>
      </ng-container>
    </div>
  `
})
export class AppComponent implements OnInit {
  token: string = ''

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.post('/api/docuseal/builder_token', {}).subscribe((data: any) => {
      this.token = data.token;
    });
  }
}
```

## Attributes

| Attribute | Type | Required | Default | Description |
|---|---|---|---|---|
| `token` | `object` | yes | — | JSON Web Token (JWT HS256) with a payload signed using the API key. **Ensure that the JWT token is generated on the backend to prevent unauthorized access to your documents**. See nested properties below. |
| `host` | `string` | no | — | DocuSeal host domain name. Only use this attribute if you are using the on-premises DocuSeal installation or docuseal.eu Cloud. Example: `yourdomain.com` |
| `customButton` | `object` | no | — | Custom button will be displayed on the top right corner of the form builder. See nested properties below. |
| `roles` | `array` | no | — | Submitter role names to be used by default in the form. |
| `fieldTypes` | `array` (enum) | no | — | Field type names to be used in the form builder. All field types are used by default. Values: `heading`, `text`, `signature`, `initials`, `date`, `datenow`, `number`, `image`, `checkbox`, `multiple`, `file`, `radio`, `select`, `cells`, `stamp`, `payment`, `phone`, `verification`, `kba`, `strikethrough`. |
| `dateFormats` | `array` | no | — | A list of formats to be used for the date field. Formats may include date ('YYYY', 'MM', 'DD'), time ('HH', 'hh', 'mm', 'ss', 'A') and timezone ('z') parts. The first format in the list is used as the default. Example: `["MM/DD/YYYY", "YYYY-MM-DD HH:mm:ss z"]` |
| `drawFieldType` | `string` | no | `text` | Field type to be used by default with the field drawing tool. Example: `signature` |
| `fields` | `array` | no | — | An array of default custom field properties with `name` to be added to the document. See nested properties below. |
| `submitters` | `array` | no | — | An array of default submitters with `role` name to be added to the document. See nested properties below. |
| `requiredFields` | `array` | no | — | An array of default required custom field properties with `name` that should be added to the document. See nested properties below. |
| `emailMessage` | `object` | no | — | Email subject and body for the signature request. See nested properties below. |
| `withTitle` | `boolean` | no | `true` | Set `false` to remove document title from the builder. |
| `withSendButton` | `boolean` | no | `true` | Show the "Send" button. |
| `withUploadButton` | `boolean` | no | `true` | Show the "Upload" button. |
| `withAddPageButton` | `boolean` | no | — | Show the "Add Blank Page" button. |
| `withSignYourselfButton` | `boolean` | no | `true` | Show the "Sign Yourself" button. |
| `withDocumentsList` | `boolean` | no | `true` | Set `false` to not show the documents list on the left. Documents list is displayed by default. |
| `withDynamicDocuments` | `boolean` | no | — | Set `true` to allow converting DOCX files to editable dynamic documents. |
| `withFieldsList` | `boolean` | no | `true` | Set `false` to not show the fields list on the right. Fields list is displayed by default. |
| `withFieldsDetection` | `boolean` | no | — | Display a button to automatically detect and add fields to the document with AI. |
| `withCustomFieldsTab` | `boolean` | no | — | Set `true` to display a separate "Custom" fields tab in the fields list. Custom fields can be configured using the `fields` or `requiredFields` prop. |
| `withFieldPlaceholder` | `boolean` | no | — | Set `true` to display field name placeholders instead of the field type icons. |
| `withSignatureId` | `boolean` | no | — | Set to `true` to enable Signature ID by default for newly added fields. If set to `false`, the Signature ID toggle will be displayed under field settings, with the Signature ID turned off by default. |
| `withRevisions` | `boolean` | no | — | Set `true` to save revisions and display a dropdown next to the Save button that provides access to the template revisions history. |
| `onlyDefinedFields` | `boolean` | no | — | Allow to add fields only defined in the `fields` prop. |
| `preview` | `boolean` | no | — | Show template in preview mode without ability to edit it. |
| `inputMode` | `boolean` | no | — | Open template in data input mode to prefill fields with default values. |
| `autosave` | `boolean` | no | `true` | Set `false` to disable form changes autosaving. |
| `language` | `string` | no | `en` | UI language, 'en', 'es', 'de', 'fr', 'pt', 'nl', 'he', 'ar' languages are available. |
| `i18n` | `object` | no | `{}` | Object that contains i18n keys to replace the default UI text with custom values. See [template\_builder/i18n.js](https://github.com/docusealco/docuseal/blob/master/app/javascript/template_builder/i18n.js) for available i18n keys. |
| `backgroundColor` | `string` | no | — | The form builder background color. Only HEX color codes are supported. Example: `#ffffff` |
| `customCss` | `string` | no | — | Custom CSS styles to be applied to the form builder. Example: `#sign_yourself_button { background-color: #FFA500; }` |

### `token` properties

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

### `customButton` properties

| Property | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | yes | Custom button title. |
| `url` | `string` | yes | Custom button URL. Only absolute URLs are supported. |

### `fields` item properties

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

### `submitters` item properties

| Property | Type | Required | Description |
|---|---|---|---|
| `email` | `string` | no | Submitter email. |
| `role` | `string` | yes | Submitter role name. |
| `name` | `string` | no | Submitter name. |
| `phone` | `string` | no | Submitter phone number, formatted according to the E.164 standard. |

### `requiredFields` item properties

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

### `emailMessage` properties

| Property | Type | Required | Description |
|---|---|---|---|
| `subject` | `string` | yes | Email subject for the signature request. |
| `body` | `string` | yes | Email body for the signature request. |

## Callbacks

| Callback | Description | Example |
|---|---|---|
| `onLoad` | Event emitted on loading the form builder template data. | `handleLoad($event)` |
| `onUpload` | Event emitted on uploading a document to the template. | `handleUpload($event)` |
| `onSend` | Event emitted on sending documents for signature to recipients. | `handleSend($event)` |
| `onChange` | Function to be called when changes are made to the template form. | `handleChange($event)` |
| `onSave` | Event emitted on saving changes of the template form. | `handleSave($event)` |

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

- [Generate JWT on your back-end to authorize users](form-builder-angular-generate-jwt-on-your-back-end-to-authorize-users.md)
- [Mount form builder component](form-builder-angular-mount-form-builder-component.md)
- [Styling the Builder with custom CSS](form-builder-angular-styling-the-builder-with-custom-css.md)

## Related

- EU Cloud / self-hosted host config: [form-builder-hosts.md](form-builder-hosts.md)
- Custom CSS theming: [form-builder-custom-css.md](form-builder-custom-css.md)
- JWT token generation: [form-builder-jwt-token.md](form-builder-jwt-token.md)
- Security recommendations: [form-builder-security-recommendations.md](form-builder-security-recommendations.md)
