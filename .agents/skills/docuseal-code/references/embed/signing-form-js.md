# DocuSeal Signing Form — JavaScript

This component enables seamless integration of a signing form within any section of your website or application. It offers compatibility with **JS+HTML** , **Vue** , **Angular** and **React** , providing you with versatile options for integration.

## Installation

```html
<script src="https://cdn.docuseal.com/js/form.js"></script>
```

## Basic Example

```html
<script src="https://cdn.docuseal.com/js/form.js"></script>

<docuseal-form
  id="docusealForm"
  data-src="https://docuseal.com/d/TEMPLATE_SLUG"
  data-email="signer@example.com">
</docuseal-form>

<script>
  window.docusealForm.addEventListener('completed', (e) => {
    console.log(e.detail)
  })
</script>
```

## Attributes

| Attribute | Type | Required | Default | Description |
|---|---|---|---|---|
| `data-src` | `string` | yes | — | Public URL of the document signing form. There are two types of URLs: - `/d/{slug}` - template form signing URL can be copied from the template page in the admin dashboard. Also template "slug" key can be obtained via the `/templates` API. - `/s/{slug}` - individual signer URL. Signer "slug" key can be obtained via the `/submissions` API which is used to initiate signature requests for a template form with recipients. |
| `data-email` | `string` | no | — | Email address of the signer. Additional email form step will be displayed if the email attribute is not specified. |
| `data-name` | `string` | no | — | Name of the signer. |
| `data-role` | `string` | no | — | The role name or title of the signer. Example: `First Party` |
| `data-token` | `object` | no | — | JSON Web Token (JWT HS256) with a payload signed using the API key. **JWT can be generated only on the backend**. See nested properties below. |
| `data-preview` | `boolean` | no | — | Show form in preview mode without ability to submit it. Completed documents embedded in preview mode require `data-token` authentication. |
| `data-expand` | `boolean` | no | `true` | Expand form on open. |
| `data-minimize` | `boolean` | no | — | Set to `true` to always minimize form fields. Requires to click on the field to expand the form. |
| `data-order-as-on-page` | `boolean` | no | — | Order form fields based on their position on the pages. |
| `data-logo` | `string` | no | — | Public logo image URL to use in the signing form. |
| `data-language` | `string` | no | — | UI language: en, es, it, de, fr, nl, pl, uk, cs, pt, he, ar, kr, ja languages are available. By default the form is displayed in the user browser language automatically. |
| `data-i18n` | `string` | no | `{}` | JSON encoded string that contains i18n keys to replace the default UI text with custom values. See [submission\_form/i18n.js](https://github.com/docusealco/docuseal/blob/master/app/javascript/submission_form/i18n.js) for available i18n keys. |
| `data-go-to-last` | `boolean` | no | `true` | Navigate to the last unfinished step. |
| `data-skip-fields` | `boolean` | no | — | Allow skipping form fields. |
| `data-autoscroll-fields` | `boolean` | no | `true` | Set `false` to disable auto-scrolling to the next document field. |
| `data-send-copy-email` | `boolean` | no | `true` | Set `false` to disable automatic email sending with signed documents to the signers. Emails with signed documents are sent to the signers by default. |
| `data-with-title` | `boolean` | no | `true` | Set `false` to remove the document title from the form. |
| `data-with-decline` | `boolean` | no | — | Set `true` to display the decline button in the form. |
| `data-with-field-names` | `boolean` | no | `true` | Set `false` to hide field name. Hiding field names can be useful for when they are not in the human readable format. Field names are displayed by default. |
| `data-with-field-placeholder` | `boolean` | no | — | Set `true` to display field name placeholders instead of the field type icons. |
| `data-with-download-button` | `boolean` | no | `true` | Set `false` to remove the signed document download button from the completed form card. |
| `data-with-send-copy-button` | `boolean` | no | `true` | Set `false` to remove the signed document send email button from the completed form card. |
| `data-with-complete-button` | `boolean` | no | — | Set `true` to display the complete button in the form header. |
| `data-only-required-fields` | `boolean` | no | — | Set to `true` to display only required fields in the step-by-step form, hiding all optional fields. |
| `data-allow-to-resubmit` | `boolean` | no | `true` | Set `false` to disallow users to re-submit the form. |
| `data-allow-typed-signature` | `boolean` | no | `true` | Set `false` to disallow users to type their signature. |
| `data-signature` | `string` | no | — | Allows pre-filling signature fields. The value can be a base64 encoded data:image/ string, a public URL to an image, or plain text that will be rendered as a typed signature using a standard font. |
| `data-remember-signature` | `boolean` | no | — | Allows to specify whether the signature should be remembered for future use. Remembered signatures are stored in the signer's browser local storage and can be automatically reused to prefill signature fields in new forms for the signer when the value is set to `true`. |
| `data-reuse-signature` | `boolean` | no | `true` | Set `false` to not reuse the signature in the second signature field and collect a new one. |
| `data-background-color` | `string` | no | — | Form background color. Only HEX color codes are supported. Example: `#d9d9d9` |
| `data-values` | `object` | no | — | Pre-assigned values for form fields. Example: `{"First Name":"Jon","Last Name":"Doe"}` |
| `data-external-id` | `string` | no | — | Your application-specific unique string key to identify signer within your app. |
| `data-metadata` | `object` | no | — | Signer metadata Object in JSON format. Example: `{"customData":"customValue"}` |
| `data-readonly-fields` | `string` | no | — | Comma separated read-only field names Example: `First Name,Last Name` |
| `data-completed-redirect-url` | `string` | no | — | URL to redirect to after the submission completion. Example: `https://docuseal.com/success` |
| `data-completed-message-title` | `string` | no | — | Message title displayed after the form completion. Example: `Documents have been completed` |
| `data-completed-message-body` | `string` | no | — | Message body displayed after the form completion. Example: `If you have any questions, please contact us.` |
| `data-completed-button-title` | `string` | no | — | Button title displayed after the form completion. Example: `Go Back` |
| `data-completed-button-url` | `string` | no | — | URL of the button displayed after the form completion. Example: `https://example.com` |
| `data-custom-css` | `string` | no | — | Custom CSS styles to be applied to the form. Example: `#submit_form_button { background-color: #d9d9d9; }` |

### `data-token` properties

| Property | Type | Required | Description |
|---|---|---|---|
| `slug` | `string` | yes | Template or Submitter slug. When Submitter slug is used no need to pass additional email param. |
| `email` | `string` | no | Email address of the signer. Additional email form step will be displayed if the email attribute is not specified with Template slug. |
| `external_id` | `string` | no | Your application-specific unique string key to identify signer within your app. |
| `preview` | `boolean` | no | Show form in preview mode without ability to submit it. |

## Events

| Event | Description | Example |
|---|---|---|
| `init` | Custom event to be triggered on initializing the form component. | `document.querySelector('docuseal-form').addEventListener('init', () => console.log('init'))` |
| `load` | Custom event to be triggered on loading the form data. | `document.querySelector('docuseal-form').addEventListener('load', (e) => e.detail)` |
| `completed` | Custom event to be triggered after form completion. | `document.querySelector('docuseal-form').addEventListener('completed', (e) => e.detail)` |
| `declined` | Custom event to be triggered after form decline. | `document.querySelector('docuseal-form').addEventListener('declined', (e) => e.detail)` |

## Guides

Step-by-step walkthroughs. Load individually to keep context small:

- [Document signing form with Template link](signing-form-js-document-signing-form-with-template-link.md)
- [Document signing form initiated via API](signing-form-js-document-signing-form-initiated-via-api.md)
- [Preview completed document](signing-form-js-preview-completed-document.md)
- [Styling the Signing Form with custom CSS](signing-form-js-styling-the-signing-form-with-custom-css.md)

## Related

- EU Cloud / self-hosted host config: [signing-form-hosts.md](signing-form-hosts.md)
- Custom CSS theming: [signing-form-custom-css.md](signing-form-custom-css.md)
- JWT token generation: [signing-form-completed-preview-jwt-token.md](signing-form-completed-preview-jwt-token.md)
- Security recommendations: [signing-form-security-recommendations.md](signing-form-security-recommendations.md)
- Mobile (WebView) embedding: [signing-form-mobile-integration.md](signing-form-mobile-integration.md)
