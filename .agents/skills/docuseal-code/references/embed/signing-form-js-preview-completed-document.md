## Preview completed document

To display a completed signed document in the embedded form, use the `data-preview` attribute with the submitter's `slug`. The form will render the document with all filled fields in read-only mode.

- `data-preview`: set to `"true"` to display the document in read-only preview mode without the submit button.
- `data-token`: a [JWT token](signing-form-js.md) is required to authenticate the preview of completed documents.

Pass the `slug` of a completed submitter to display the signed version of the document. The slug can be obtained from the [Create a Submission](https://www.docuseal.com/docs/api#create-a-submission) API response or from the [form.completed](https://www.docuseal.com/docs/api#form-webhook) webhook payload.


```
<script src="https://cdn.docuseal.com/js/form.js"></script>

<docuseal-form
  data-src="https://docuseal.com/s/{{ slug }}"
  data-preview="true"
  data-token="JWT_TOKEN">
</docuseal-form>
```
