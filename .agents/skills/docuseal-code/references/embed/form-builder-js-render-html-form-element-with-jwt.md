## Render HTML form element with JWT

First, add the DocuSeal functionality to your webpage by including the script. Copy and paste the following line into the `<head>` or `<body>` section of your HTML page:

To integrate a DocuSeal document form builder, add the `<docuseal-builder>` element to your webpage with the `data-token` attribute.

In server-side rendering, the token can be rendered within the initial server-generated HTML, readily available upon page load.

In client-side render apps, it's advisable to fetch the token via an API call after the initial page load.


```
<script src="https://cdn.docuseal.com/js/builder.js"></script>

<docuseal-builder data-token="{ token }">
</docuseal-builder>
```
