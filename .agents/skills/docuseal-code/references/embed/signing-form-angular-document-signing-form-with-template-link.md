## Document signing form with Template link

The template link follows the pattern `/d/{TEMPLATE_SLUG}`. Copy it from the template page in the DocuSeal UI by clicking the **Link** button, or fetch the template's `slug` via the `GET /templates` (or `GET /templates/{id}`) API and construct the URL as `/d/{slug}`.

Open your terminal or command prompt and navigate to your project directory. Then, run the following command to install the `@docuseal/angular` package

Once the installation is complete, you'll need to import the component in the relevant file where you intend to use DocuSeal. With the component imported, you can now use `<docuseal-form>` within your Angular template wherever you want to integrate the DocuSeal functionality:

- `[src]`: This prop specifies the URL of the DocuSeal form that you want to embed. Each template form on DocuSeal has a unique URL with `slug` key. "Slug" key can be obtained via the `/templates` API or copied from the template page in the web UI. 
- `[email]`: This prop is used to initialize the form for a specified email address for the signer. 

Signing forms initialized via template URL and email work only if the template contains a single signing party. For signing forms with multiple parties all signers should be initiated via the API.


```
import { Component } from '@angular/core';
import { DocusealFormComponent } from '@docuseal/angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DocusealFormComponent],
  template: `
    <div class="app">
      <docuseal-form
        src="https://docuseal.com/d/LEVGR9rhZYf86M"
        email="signer@example.com">
      </docuseal-form>
    </div>
  `
})
export class AppComponent {}
```
