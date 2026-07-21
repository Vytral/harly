## Document signing form with Template link

The template link follows the pattern `/d/{TEMPLATE_SLUG}`. Copy it from the template page in the DocuSeal UI by clicking the **Link** button, or fetch the template's `slug` via the `GET /templates` (or `GET /templates/{id}`) API and construct the URL as `/d/{slug}`.

First, add the DocuSeal functionality to your webpage by including the script. Copy and paste the following line into the `<head>` or `<body>` section of your HTML page:

To integrate a DocuSeal form, add the `<docuseal-form>` element to your webpage with the necessary attributes specifying the form's unique URL and, optionally, a default email address for the signer:

- `data-src`: This attribute specifies the URL of the DocuSeal form that you want to embed. Each template form on DocuSeal has a unique URL with `slug` key. "Slug" key can be obtained via the `/templates` API or copied from the template page in the web UI. 
- `data-email`: This attribute is used to initialize the form for a specified email address for the signer. 

Signing forms initialized via template URL and email work only if the template contains a single signing party. For signing forms with multiple parties all signers should be initiated via the API.


```
<script src="https://cdn.docuseal.com/js/form.js"></script>

<docuseal-form
  data-src="https://docuseal.com/d/LEVGR9rhZYf86M"
  data-email="signer@example.com">
</docuseal-form>
```
