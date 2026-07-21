## Preview completed document

To display a completed signed document in the embedded form, use the `preview` attribute with the submitter's `slug`. The form will render the document with all filled fields in read-only mode.

- `preview`: set to `{true}` to display the document in read-only preview mode without the submit button.
- `token`: a [JWT token](signing-form-react.md) is required to authenticate the preview of completed documents.

Pass the `slug` of a completed submitter to display the signed version of the document. The slug can be obtained from the [Create a Submission](https://www.docuseal.com/docs/api#create-a-submission) API response or from the [form.completed](https://www.docuseal.com/docs/api#form-webhook) webhook payload.


```
import { DocusealForm } from '@docuseal/react'

export function App({ slug, token }) {
  return (
    <DocusealForm
      src={`https://docuseal.com/s/${slug}`}
      preview={true}
      token={token}
    />
  );
}
```
