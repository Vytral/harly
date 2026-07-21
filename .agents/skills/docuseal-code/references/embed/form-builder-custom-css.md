# Custom CSS Theming — Form Builder

`<docuseal-builder>` accepts arbitrary CSS via the `data-custom-css` (HTML) or `customCss` (React/Vue/Angular) attribute.

Pass the CSS **as a string**, not a stylesheet link. Selectors target the component's internal class names.

## Minimal example

```html
<docuseal-builder
  data-token="<JWT_FROM_BACKEND>"
  data-custom-css=".tooltip:before { background-color: #364153; }">
</docuseal-builder>
```

```jsx
<DocusealBuilder
  token={token}
  customCss=".tooltip:before { background-color: #364153; }"
/>
```

## Selector reference (dark theme)

Full working dark theme. Covers every overridable selector in `<docuseal-builder>`.

```css
/* DOCUSEAL TEMPLATE BUILDER DARK THEME */
/*
  This theme is provided as a demonstration of Template Builder customization capabilities.
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

/* TEMPLATE BUILDER */
/*
  Main container for all Template Builder elements, excluding the header (#title-container).
*/
.main-container {
  background-color: #101828;
}

/* Header container for the template title and control buttons. */
.title-container {
  background-color: #1E2839;
}

/* Template name displayed at the top of the builder */
.template-name {
  color: #ffffff;
}

/* Document title displayed in the left column under each added document. */
.document-preview-name {
  color: #ffffff;
}

/* Template control buttons */
.save-button,
.add-document-button,
.sign-yourself-button,
.document-control-button,
.replace-document-button {
  background-color: #364153;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.save-button:hover,
.add-document-button:hover,
.sign-yourself-button:hover,
.document-control-button:hover,
.replace-document-button:hover {
  background-color: #495565;
}

.add-blank-page-button,
.send-button {
  background-color: #700DE7;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.add-blank-page-button:hover,
.send-button:hover {
  background-color: #8022FE;
}

.document-control-button:hover {
  background-color: #8022FE;
}

/* List of fields added to the template */
.fields-list-container input,
.fields-list-container textarea,
.fields-list-container select {
  border-radius: 0.25rem;
  background-color: #101828;
  border: 1px solid #101828;
  color: #ffffff;
}

.fields-list-container input:checked {
  --chkbg: 220 43% 11%;
}

.fields-list-container input::placeholder,
.fields-list-container select::placeholder {
  color: #ffffff;
}

/*
  Individual field item added to the template.
*/
.fields-list-item {
  background-color: #1E2839 !important;
  border-color: #101828;
  color: #ffffff;
}

.field-settings-dropdown hr,
.fields-list-item .border-t {
  border-color: #101828;
}

.fields-list-item:hover .field-remove-button,
.fields-list-item:hover .field-settings-dropdown label {
  color: #ffffff;
}

/* Field settings dropdown */
.field-settings-dropdown ul {
  border-radius: 0.25rem;
  background-color: #364153 !important;
  border: 1px solid #101828;
  color: #ffffff;
}

.field-settings-dropdown ul label,
.field-settings-dropdown .label-text {
  background-color: transparent !important;
  color: #ffffff
}

.field-settings-dropdown li a.active,
.field-settings-dropdown li a:hover,
.field-settings-dropdown li label:hover {
  border-radius: 0.25rem;
  background-color: #1E2839 !important;
  border: none;
  color: #ffffff;
}

 /* Field types dropdown */
.field-types-dropdown ul {
  border-radius: 0.25rem;
  background-color: #364153 !important;
  border: 1px solid #101828;
  color: #ffffff;
}

.field-types-dropdown li a.active,
.field-types-dropdown li a:hover,
.field-types-dropdown li label:hover {
  border-radius: 0.25rem;
  background-color: #1E2839 !important;
  border: none;
  color: #ffffff;
}

/* Field area controls displayed when clicking on a field area */
.field-area-controls {
  border-radius: 0.25rem;
  background-color: #364153;
  color: #ffffff;
}

.field-area-controls input[type="checkbox"] {
  border-color: #ffffff;
}

.field-area-controls input:checked {
  --chkbg: 220 43% 11%;
}

.field-area-controls .border-r {
  border-color: #101828;
}

/* Field area settings dropdown displayed when clicking on 3 dots button */
.field-area-settings-dropdown input,
.field-area-settings-dropdown textarea,
.field-area-settings-dropdown select {
  border-radius: 0.25rem;
  background-color: #101828;
  border: 1px solid #101828;
  color: #ffffff;
}

.field-area-settings-dropdown ul {
  border-radius: 0.25rem;
  background-color: #364153 !important;
  border: 1px solid #101828;
  color: #ffffff !important;
}

.field-area-settings-dropdown ul label,
.field-area-settings-dropdown .label-text {
  background-color: transparent !important;
  color: #ffffff
}

.field-area-settings-dropdown li a.active,
.field-area-settings-dropdown li a:hover,
.field-area-settings-dropdown li label:hover {
  border-radius: 0.25rem;
  background-color: #1E2839 !important;
  border: none;
  color: #ffffff !important;
}

/* Template roles dropdown */
.roles-dropdown label {
  background-color: #364153;
  border-color: #101828;
  color: #ffffff;
}

.roles-dropdown ul {
  border-radius: 0.25rem;
  background-color: #364153 !important;
  border: 1px solid #101828;
  color: #ffffff;
}

.roles-dropdown li a {
  border-radius: 0.25rem;
  border: none;
}

.roles-dropdown li a.active,
.roles-dropdown li a:hover {
  background-color: #1E2839 !important;
  color: #ffffff;
}

.roles-dropdown-label-mobile {
  background-color: #364153;
  color: #ffffff;
}

.draw-field-container-mobile {
  background-color: #364153;
  color: #ffffff;
}

.roles-dropdown-mobile label {
  background-color: #364153;
  border-color: #101828;
  color: #ffffff;
}

.roles-dropdown-mobile ul {
  border-radius: 0.25rem;
  background-color: #364153 !important;
  border: 1px solid #101828;
  color: #ffffff;
}

.roles-dropdown-mobile li a {
  border-radius: 0.25rem;
  border: none;
}

.roles-dropdown-mobile li a.active,
.roles-dropdown-mobile li a:hover {
  background-color: #1E2839;
  color: #ffffff;
}

.fields-dropdown-mobile label {
  background-color: #364153;
  border: none;
  color: #ffffff;
}

.fields-dropdown-mobile ul {
  border-radius: 0.25rem;
  background-color: #364153 !important;
  border: 1px solid #101828;
  color: #ffffff;
}

.fields-dropdown-mobil li a.active,
.fields-dropdown-mobile li a:hover {
  border-radius: 0.25rem;
  background-color: #1E2839 !important;
  border: none;
  color: #ffffff;
}

/* Custom fields tab displayed when with-custom-fields-tab parameter is enabled */
.custom-fields-tabs {
  background-color: #364153;
}

.custom-fields-tab {
  color: #ffffff;
  border: 0;
}

.custom-fields-tab.tab-active {
  background-color: #700DE7;
  color: #ffffff;
}

/* Grid of fields available for adding or dragging into the template */
.fields-grid {
  background-color: #101828;
}

/* Individual field items available for adding to the template */
.fields-grid-item {
  background-color: #1E2839 !important;
  border-color: #101828;
  color: #ffffff;
}

/* Container displayed when drawing a field */
.draw-field-container {
  background-color: #1E2839;
  border-radius: 0.25rem;
  border: 1px solid #101828;
  color: #ffffff;
}

/* Button to cancel field drawing */
.cancel-draw-button {
  background-color: #700DE7;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.cancel-draw-button:hover {
  background-color: #8022FE;
}

/* BASE MODAL */
/* Base styles for all modal windows except the recipients modal */
.modal-container .modal-box {
  background-color: #1E2839;
  border-radius: 0.25rem;
}

.modal-container .modal-box .border-b {
  border-color: #101828;
}

.modal-container a,
.modal-container label,
.modal-container .modal-title,
.modal-container .modal-close-button,
.modal-container .label-text {
  color: #ffffff;
}

.modal-container input,
.modal-container textarea,
.modal-container select {
  border-radius: 0.25rem;
  background-color: #101828;
  border: 1px solid #101828;
  color: #ffffff;
}

.modal-container select + span {
  background-color: #101828;
  color: #ffffff;
}

.modal-container button {
  border-radius: 0.25rem;
  background-color: #364153;
  border: none;
  color: #ffffff;
}

.modal-container button:hover, {
  background-color: #495565;
}

.modal-container button[class*="bg-base-300"] {
  background-color: #6A7282 !important;
  color: #ffffff;
}

.modal-container button:hover {
  background-color: #6A7282;
}

.modal-save-button {
  background-color: #364153;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.modal-save-button:hover {
  background-color: #495565;
}

.modal-field-font-dropdown label {
  background-color: #364153;
  border-color: #101828;
  color: #ffffff;
}

.modal-field-font-dropdown .dropdown-content {
  border-radius: 0.25rem;
  background-color: #364153;
  border: 1px solid #101828;
  color: #ffffff;
}

.modal-field-font-dropdown .dropdown-content div:hover,
.modal-container .modal-field-font-dropdown .bg-base-300 {
  background-color: #6A7282;
  color: #ffffff;
}

.modal-field-font-preview {
  background-color: #E5E8EB;
}

/* RECIPIENTS */
/*
  Modal window for configuring recipients.
  Can be disabled in template settings using the with-send-button parameter.
*/
.recipients-modal {
  background-color: #1E2839;
  border-radius: 0.25rem;
}

/* Text elements in the recipients modal */
.recipients-modal-title,
.recipients-modal-close-button,
.recipients-modal-form label,
.recipients-modal-form .label-text {
  color: #ffffff;
}

/* Input fields in the recipients modal */
.recipients-modal-form input,
.recipients-modal-form textarea,
.recipients-modal-form select {
  border-radius: 0.25rem;
  background-color: #101828;
  border: 1px solid #101828;
  color: #ffffff;
}

.recipients-modal-form input::placeholder,
.recipients-modal-form textarea::placeholder,
.recipients-modal-form select::placeholder {
  color: #ffffff;
}

.recipients-modal-form input:checked {
  --chkbg: 220 43% 11%;
}

/* Button to send a signing invitation */
.recipients-modal-send-button {
  background-color: #700DE7;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.recipients-modal-send-button:hover {
  background-color: #8022FE;
}

/* Container displaying submission details */
.recipients-modal-submission {
  border-radius: 0.25rem;
  background-color: #101828;
  border: 1px solid #101828;
}

/* Container for submitter information fields */
.recipients-modal-form-submitters {
  border-radius: 0.25rem;
  background-color: #1E2839;
  border: 1px solid #101828;
}

/* Submission status labels */
.recipients-modal-submission-status-sent-label,
.recipients-modal-submission-status-awaiting-label,
.recipients-modal-submission-status-opened-label,
.recipients-modal-submission-status-completed-label,
.recipients-modal-submission-status-declined-label {
  background-color: #ffffff;
  border-radius: 0.25rem;
  border: 1px solid #101828;
}

.recipients-modal-submission-submitter-email {
  color: #ffffff;
}

/* Download button for the document */
.recipients-modal-submission-download-button {
  background-color: #364153;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.recipients-modal-submission-download-button:hover {
  background-color: #495565;
}

/* Button to remove a submission */
.recipients-modal-submission-remove-button {
  background-color: #C10006;
  border: 0;
  border-radius: 0.25rem;
  color: #ffffff;
}

.recipients-modal-submission-remove-button:hover {
  background-color: #E70009;
}

/* Block containing fields for configuring email subject and body */
.recipients-modal-form-email-message {
  border-radius: 0.25rem;
  background-color: #1E2839;
  border: 1px solid #101828;
  color: #ffffff;
}

/* Text button for editing the email message */
.recipients-modal-form-edit-email-message-link {
  color: #ffffff;
}

/* Pagination section in the recipients modal */
.recipients-modal-pagination-label {
  color: #ffffff;
}

.recipients-modal-pagination-buttons-container {
  border-radius: 0.25rem;
}

.recipients-modal-pagination-prev-button,
.recipients-modal-pagination-next-button,
.recipients-modal-pagination-page {
  background-color: #364153;
  border: none;
  color: #ffffff;
}

.recipients-modal-pagination-prev-disabled-button,
.recipients-modal-pagination-next-disabled-button {
  background-color: #364153 !important;
  color: #E5E8EB;
}

.recipients-modal-pagination-prev-button:hover,
.recipients-modal-pagination-next-button:hover,
.recipients-modal-pagination-page:hover,
.recipients-modal-pagination-prev-disabled-button:hover,
.recipients-modal-pagination-next-disabled-button:hover,
.recipients-modal-pagination-page:hover {
  background-color: #495565;
}
```
