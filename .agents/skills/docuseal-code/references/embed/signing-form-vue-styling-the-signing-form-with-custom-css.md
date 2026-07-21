## Styling the Signing Form with custom CSS

The signing form is divided into four main parts: Start Form, Main Form, Completed Form, and Submitted Form.   
 Some sections may not be displayed depending on the form settings; however, the Main Form is always visible.

Start Form

The Start Form is displayed only if the signer's email is not specified (i.e., the email attribute is missing). If the signer's email is always provided, this form does not require customization. CSS classes for this section:

- `.start-form`
- `.start-form-container`
- `.start-form-company-logo`
- `.start-form-template-info-container`
- `.start-form-template-title`
- `.start-form-submit-button`

Main Form

The Main Form is the primary signing form displayed after the Start Form. This form is always visible, making its customization essential. CSS classes for this section:

- `.field-area`
- `.field-area-active`
- `.field-area-active-label`
- `.form-container`
- `.scrollbox`
- `.title-container`
- `.header-container`
- `.page-container`
- `.minimize-form-button`
- `.steps-progress`
- `.steps-progress-current`
- `.template-title`
- `.company-logo`
- `.steps-form`
- `.draw-canvas`
- `.file-dropzone`
- `.uploaded-image-preview`
- `.submit-form-button`
- `.phone-number-input-container`
- `.country-code-select-label`
- `.type-text-button`
- `.upload-image-button`
- `.clear-canvas-button`
- `.set-current-date-button`
- `.reupload-button`
- `.decline-button`
- `.field-name-label`
- `.field-description-text`
- `.checkbox-label`
- `.radio-label`
- `.attachment-file-name`
- `.remove-attachment-button`
- `.toggle-multiline-text-button`
- `.change-phone-number-link`
- `.resend-code-link`

Completed Form

The Completed Form is displayed right away when a user has completed the document. It provides information about the successful signing and may include actions that can be performed post-signing. Depending on the form settings, this section may not be displayed. CSS classes for this section:

- `.completed-form`
- `.completed-form-message-title`
- `.completed-form-message-body`
- `.completed-form-completed-button`
- `.completed-form-send-copy-button`
- `.completed-form-download-button`

Submitted Form

The Submitted Form is displayed when a user has already signed the document and re-opened embedding for the completed form. It provides information about the successful signing and may include actions that can be performed post-signing. Depending on the form settings, this section may not be displayed. CSS classes for this section:

- `.submitted-form-container`
- `.submitted-form-company-logo`
- `.submitted-form-template-info-container`
- `.submitted-form-title`
- `.submitted-form-template-title`
- `.submitted-form-template-description`
- `.submitted-form-send-copy-button`
- `.submitted-form-resubmit-button`

Expired Form

The Expired Form is displayed when the document's expiration date has passed, and the user attempts to access the form after it is no longer valid. Depending on the form settings, this section may not be displayed. CSS classes for this section:

- `.expired-form-container`
- `.expired-form-company-logo`
- `.expired-form-template-info-container`
- `.expired-form-template-description`


```
<template>
  <DocusealForm
    :src="'https://docuseal.com/d/LEVGR9rhZYf86M'"
    :email="'signer@example.com'"
    :custom-css="customCss"
  />
</template>

<script>
import { DocusealForm } from '@docuseal/vue'

export default {
  name: 'App',
  components: {
    DocusealForm
  },
  computed: {
    customCss () {
      return `YOUR SIGNING FORM CSS THEME HERE`
    }
  }
}
```


```
/* DOCUSEAL SIGNING FORM DARK THEME */
/*
  This theme is provided as a demonstration of Signing Form customization capabilities.
  Some selectors may need adjustments based on your website's structure.
  The code is not optimized for production to enhance readability.
*/

/* COLORS */
/*
  #101828: gray-900
  #495565: gray-800
  #1E2839: gray-700
  #364153: gray-600
  #E5E8EB: gray-200
  #700DE7: violet-600
  #8022FE: violet-700
  #A806B7: fuchsia-600
  #C809DE: fuchsia-700
  #C10006: red-600
  #E70009: red-700
  #432DD7: indigo-700
  #5039F6: indigo-600
*/

/* GENERAL STYLES */
.tooltip:before {
  background-color: #364153;
}

/* START FORM */
/*
  The container for the start form displayed before the document signing process begins.
  Includes both template information and the email input form.
*/
.start-form-container {
  padding: 1rem;
  background-color: #1E2839;
  border-radius: 0.25rem;
  border: 1px solid #1E2839;
}

/* The company logo displayed in the start form. */
.start-form-company-logo {
  background-color: #ffffff;
  border-radius: 0.25rem;
}

/*
  The template information container displayed in the start form.
  Includes the template title and description.
*/
.start-form-template-info-container {
  border-radius: 0.25rem;
  background-color: #1E2839;
  border: 1px solid #101828;
  color: #ffffff;
}

/* Template title displayed in the start form */
.start-form-template-title {
  color: #ffffff;
}

/* Labels for all input fields in the start form */
.start-form label {
  color: #ffffff;
}

/* Input fields in the start form */
.start-form input {
  border-radius: 0.25rem;
  background-color: #101828;
  border: 1px solid #101828;
  color: #ffffff;
}

.start-form input::placeholder {
  color: #ffffff;
}

/*
  The submit button for email input in the start form.
  Used to proceed to the main signing form.
*/
.start-form-submit-button {
  background-color: #700DE7;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.start-form-submit-button:hover {
  background-color: #8022FE;
}

/* MAIN FORM */
/*
  The main document signing form.
  Contains all form elements, including input fields, buttons, and document information.
*/
.form-container {
  background-color: #1E2839;
  border-radius: 0.25rem;
  border: 1px solid #1E2839;
}

/* The scrollable container for document pages */
.scrollbox {
  background-color: #101828;
}

/*
  The header container at the top of the embedded signing form.
  Displays when showing the template name is allowed, and the 'Decline' and 'Complete' buttons are disabled.
*/
.title-container {
  background-color: #1E2839;
}

/*
  The header container at the top of the embedded signing form.
  Displayed when it is allowed to show the 'Decline' or 'Complete' buttons.
*/
.header-container {
  background-color: #1E2839;
}

/*
  The container for individual document pages.
  If a document has multiple pages, each page will use this identifier.
*/
.page-container {
  border: 1px solid #1E2839;
}

/* Minimize button in the top-right corner of the form */
.minimize-form-button {
  color: #ffffff;
}

/* Document title displayed at the top of the form */
.template-title {
  color: #ffffff;
}

/* Company logo displayed next to the document title */
.company-logo {
  background-color: #ffffff;
  border-radius: 0.25rem;
}

/* Buttons for interacting with the form */
.type-text-button,
.upload-image-button,
.clear-canvas-button,
.set-current-date-button,
.decline-button,
.reupload-button {
  background-color: #364153;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.type-text-button:hover,
.upload-image-button:hover,
.clear-canvas-button:hover,
.set-current-date-button:hover,
.decline-button:hover,
.reupload-button:hover {
  background-color: #495565;
}

/* Labels, descriptions, and other text elements in the form */
.field-name-label,
.field-description-text,
.checkbox-label,
.radio-label,
.attachment-file-name,
.remove-attachment-button,
.toggle-multiline-text-button,
.change-phone-number-link,
.resend-code-link {
  color: #ffffff;
}

/* The container displaying the current signing step */
.steps-progress button {
  background-color: #6A7282;
  border: none;
}

/* The current signing step within #steps-progress */
.steps-progress-current {
  background-color: #ffffff !important;
}

/* Input fields for signing steps */
.steps-form input,
.steps-form textarea,
.steps-form select {
  border-radius: 0.25rem;
  background-color: #101828;
  border: 1px solid #101828;
  color: #ffffff;
}

.steps-form input::placeholder,
.steps-form textarea::placeholder,
.steps-form select::placeholder {
  color: #ffffff;
}

.steps-form input:checked {
  --chkbg: 220 43% 11%;
}

.steps-form input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(1);
}

/* Canvas area where signers draw signatures or initials */
.draw-canvas {
  background-color: #E5E8EB;
  border-radius: 0.25rem;
  border: 1px solid #101828;
}

/* File drop zone container for uploaded files */
.file-dropzone {
  border-radius: 0.25rem;
  background-color: #101828;
  border: 1px solid #101828;
  color: #ffffff;
}

.file-dropzone:hover {
  background-color: #364153;
}

/* Container for displaying uploaded images */
.uploaded-image-preview {
  border-radius: 0.25rem;
  border: 1px solid #101828;
}

/* The submit button to finalize document signing */
.submit-form-button {
  background-color: #700DE7;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff ;
}

.submit-form-button:disabled {
  background-color: #364153;
  color: #ffffff;
}

.submit-form-button:hover {
  background-color: #8022FE;
}

/* The button to expand the form and display fields */
.expand-form-button {
  background-color: #432DD7;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.expand-form-button:hover {
  background-color: #5039F6;
}

/* Container holding the country code selector and phone number input */
.phone-number-input-container {
  outline-color: transparent;
}

/* Phone country code selector */
.country-code-select-label {
  background-color: #364153;
  border-color: #101828;
  border-radius: 0.25rem;
  color: #ffffff;
}

/* COMPLETED FORM */
/*
  The container for the completed form displayed after the document is signed.
  Includes template information and action buttons for downloading or sending a copy.
*/
.completed-form {
  padding: 1rem;
  border-radius: 0.25rem;
  border: 1px solid #101828;
}

/* Text elements in the completed form */
.completed-form-message-title,
.completed-form-message-body {
  color: #ffffff;
}

/*
  The button to complete the signing process.
  Used for returning to the website or another configured page.
*/
.completed-form-completed-button {
  background-color: #700DE7;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.completed-form-completed-button:hover {
  background-color: #8022FE;
}

/* Button to send a copy of the signed document */
.completed-form-send-copy-button {
  background-color: #432DD7;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.completed-form-send-copy-button:hover {
  background-color: #5039F6;
}

/* Button to download the signed document */
.completed-form-download-button {
  background-color: #A806B7;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.completed-form-download-button:hover {
  background-color: #C809DE;
}

/* SUBMITTED FORM */
/*
  The container for the submitted form, displayed when a signed document is reopened.
  Includes template information and action buttons for downloading or resending a copy.
*/
.submitted-form-container {
  padding: 1rem;
  background-color: #1E2839;
  border-radius: 0.25rem;
  border: 1px solid #1E2839;
}

/* The company logo displayed in the submitted form. */
.submitted-form-company-logo {
  background-color: #ffffff;
  border-radius: 0.25rem;
}

/*
  The template information container in the submitted form.
  Includes the template title and description.
*/
.submitted-form-template-info-container {
  border-radius: 0.25rem;
  background-color: #1E2839;
  border: 1px solid #101828;
  color: #ffffff;
}

/* Titles, descriptions, and text elements in the submitted form */
.submitted-form-title,
.submitted-form-template-title,
.submitted-form-template-description {
  color: #ffffff;
}

/* Button to download the signed document */
.submitted-form-send-copy-button {
  background-color: #700DE7;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.submitted-form-send-copy-button:hover {
  background-color: #8022FE;
}

/* Button to resend a copy of the signed document */
.submitted-form-resubmit-button {
  background-color: #364153;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.submitted-form-resubmit-button:hover {
  background-color: #495565;
}

/* EXPIRED FORM */
/*
  The container for the expired form, displayed when a signed document is expired.
  Includes template information and information about the expiration.
*/
.expired-form-container {
  padding: 1rem;
  background-color: #1E2839;
  border-radius: 0.25rem;
  border: 1px solid #1E2839;
}

/* The company logo displayed in the expired form. */
.expired-form-company-logo {
  background-color: #ffffff;
  border-radius: 0.25rem;
}

/*
  The template information container in the expired form.
  Includes the template title and description.
*/
.expired-form-template-info-container {
  border-radius: 0.25rem;
  background-color: #1E2839;
  border: 1px solid #101828;
  color: #ffffff;
}

/* Descriptions in the expired form */
.expired-form-template-description {
  color: #ffffff;
}

/* FIELD AREAS */
/* The container for individual fields added to the document */
.field-area {
  background-color: rgba(229, 232, 235, 0.5);
  border-color: #1E2839;
}

.field-area-active {
  border-color: #432DD7;
  outline-color: #700DE7;
}

.field-area-active-label {
  background-color: #700DE7;
  color: #ffffff;
}
```

 Default Theme Custom CSS Theme 

**Learn more:**

[Embed API Reference](signing-form-vue.md)

[REST API Reference](https://www.docuseal.com/docs/api#create-a-submission)

[Vue package on GitHub](https://github.com/docusealco/docuseal-vue)

[Embedded Demo App](https://embed.docuseal.tech/)
