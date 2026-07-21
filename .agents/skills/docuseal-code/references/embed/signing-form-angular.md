# DocuSeal Signing Form — Angular

This component enables seamless integration of a signing form within any section of your website or application. It offers compatibility with **JS+HTML** , **Vue** , **Angular** and **React** , providing you with versatile options for integration.

## Installation

```bash
npm install @docuseal/angular
```

Source: https://github.com/docusealco/docuseal-angular

## Basic Example

```typescript
import { Component } from '@angular/core';
import { DocusealFormComponent } from '@docuseal/angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DocusealFormComponent],
  template: `
    <div class="app">
      <docuseal-form
        [src]="'https://docuseal.com/d/TEMPLATE_SLUG'"
        [email]="'signer@example.com'">
      </docuseal-form>
    </div>
  `
})
export class AppComponent {}
```

## Attributes

| Attribute | Type | Required | Default | Description |
|---|---|---|---|---|
| `src` | `string` | yes | — | Public URL of the document signing form. There are two types of URLs: - `/d/{slug}` - template form signing URL can be copied from the template page in the admin dashboard. Also template "slug" key can be obtained via the `/templates` API. - `/s/{slug}` - individual signer URL. Signer "slug" key can be obtained via the `/submissions` API which is used to initiate signature requests for a template form with recipients. |
| `email` | `string` | no | — | Email address of the signer. Additional email form step will be displayed if the email attribute is not specified. |
| `name` | `string` | no | — | Name of the signer. |
| `role` | `string` | no | — | The role name or title of the signer. Example: `First Party` |
| `token` | `object` | no | — | JSON Web Token (JWT HS256) with a payload signed using the API key. **JWT can be generated only on the backend**. See nested properties below. |
| `preview` | `boolean` | no | — | Show form in preview mode without ability to submit it. Completed documents embedded in preview mode require `data-token` authentication. |
| `expand` | `boolean` | no | `true` | Expand form on open. |
| `minimize` | `boolean` | no | — | Set to `true` to always minimize form fields. Requires to click on the field to expand the form. |
| `orderAsOnPage` | `boolean` | no | — | Order form fields based on their position on the pages. |
| `logo` | `string` | no | — | Public logo image URL to use in the signing form. |
| `language` | `string` | no | — | UI language: en, es, it, de, fr, nl, pl, uk, cs, pt, he, ar, kr, ja languages are available. By default the form is displayed in the user browser language automatically. |
| `i18n` | `object` | no | `{}` | Object that contains i18n keys to replace the default UI text with custom values. See [submission\_form/i18n.js](https://github.com/docusealco/docuseal/blob/master/app/javascript/submission_form/i18n.js) for available i18n keys. |
| `goToLast` | `boolean` | no | `true` | Navigate to the last unfinished step. |
| `withFieldNames` | `boolean` | no | `true` | Set `false` to hide field name. Hiding field names can be useful for when they are not in the human readable format. Field names are displayed by default. |
| `withFieldPlaceholder` | `boolean` | no | — | Set `true` to display field name placeholders instead of the field type icons. |
| `skipFields` | `boolean` | no | — | Allow skipping form fields. |
| `autoscrollFields` | `boolean` | no | `true` | Set `false` to disable auto-scrolling to the next document field. |
| `sendCopyEmail` | `boolean` | no | — | Set `false` to disable automatic email sending with signed documents to the signers. Emails with signed documents are sent to the signers by default. |
| `backgroundColor` | `string` | no | — | Form background color. Only HEX color codes are supported. Example: `#d9d9d9` |
| `completedRedirectUrl` | `string` | no | — | URL to redirect to after the submission completion. Example: `https://docuseal.com/success` |
| `completedMessage` | `object` | no | — | Message displayed after the form completion. See nested properties below. |
| `completedButton` | `object` | no | — | Customizable button after form completion. See nested properties below. |
| `withTitle` | `boolean` | no | `true` | Set `false` to remove the document title from the form. |
| `withDecline` | `boolean` | no | — | Set `true` to display the decline button in the form. |
| `withDownloadButton` | `boolean` | no | `true` | Set `false` to remove the signed document download button from the completed form card. |
| `withSendCopyButton` | `boolean` | no | `true` | Set `false` to remove the signed document send email button from the completed form card. |
| `withCompleteButton` | `boolean` | no | — | Set `true` to display the complete button in the form header. |
| `onlyRequiredFields` | `boolean` | no | — | Set to `true` to display only required fields in the step-by-step form, hiding all optional fields. |
| `allowToResubmit` | `boolean` | no | `true` | Set `false` to disallow user to re-submit the form. |
| `signature` | `string` | no | — | Allows pre-filling signature fields. The value can be a base64 encoded data:image/ string, a public URL to an image, or plain text that will be rendered as a typed signature using a standard font. |
| `rememberSignature` | `boolean` | no | — | Allows to specify whether the signature should be remembered for future use. Remembered signatures are stored in the signer's browser local storage and can be automatically reused to prefill signature fields in new forms for the signer when the value is set to `true`. |
| `reuseSignature` | `boolean` | no | `true` | Set `false` to not reuse the signature in the second signature field and collect a new one. |
| `allowTypedSignature` | `boolean` | no | `true` | Set `false` to disallow users to type their signature. |
| `values` | `object` | no | — | Pre-assigned values for form fields. Example: `{ 'First Name': 'Jon', 'Last Name': 'Doe' }` |
| `externalId` | `string` | no | — | Your application-specific unique string key to identify signer within your app. |
| `metadata` | `object` | no | — | Metadata object with additional signer information. Example: `{ customData: 'custom value' }` |
| `readonlyFields` | `array` | no | — | List of read-only fields. Example: `['First Name','Last Name']` |
| `customCss` | `string` | no | — | Custom CSS styles to be applied to the form. Example: `#submit_form_button { background-color: #d9d9d9; }` |

### `token` properties

| Property | Type | Required | Description |
|---|---|---|---|
| `slug` | `string` | yes | Template or Submitter slug. When Submitter slug is used no need to pass additional email param. |
| `email` | `string` | no | Email address of the signer. Additional email form step will be displayed if the email attribute is not specified with Template slug. |
| `external_id` | `string` | no | Your application-specific unique string key to identify signer within your app. |
| `preview` | `boolean` | no | Show form in preview mode without ability to submit it. |

### `completedMessage` properties

| Property | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | no | Message title. Example: `Documents have been signed!` |
| `body` | `string` | no | Message content. Example: `If you have any questions, please contact us.` |

### `completedButton` properties

| Property | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | yes | Button label. Example: `Go Back` |
| `url` | `string` | yes | Button link. Only absolute URLs are supported. Example: `https://example.com` |

## Callbacks

| Callback | Description | Example |
|---|---|---|
| `onInit` | Event emitted on initializing the form component. | `handleInit($event)` |
| `onLoad` | Event emitted on loading the form data. | `handleLoad($event)` |
| `onComplete` | Event emitted on form completion. | `handleComplete($event)` |
| `onDecline` | Event emitted after the form decline. | `handleDecline($event)` |

## Guides

Step-by-step walkthroughs. Load individually to keep context small:

- [Document signing form with Template link](signing-form-angular-document-signing-form-with-template-link.md)
- [Document signing form initiated via API](signing-form-angular-document-signing-form-initiated-via-api.md)
- [Preview completed document](signing-form-angular-preview-completed-document.md)
- [Styling the Signing Form with custom CSS](signing-form-angular-styling-the-signing-form-with-custom-css.md)

## Related

- EU Cloud / self-hosted host config: [signing-form-hosts.md](signing-form-hosts.md)
- Custom CSS theming: [signing-form-custom-css.md](signing-form-custom-css.md)
- JWT token generation: [signing-form-completed-preview-jwt-token.md](signing-form-completed-preview-jwt-token.md)
- Security recommendations: [signing-form-security-recommendations.md](signing-form-security-recommendations.md)
- Mobile (WebView) embedding: [signing-form-mobile-integration.md](signing-form-mobile-integration.md)
