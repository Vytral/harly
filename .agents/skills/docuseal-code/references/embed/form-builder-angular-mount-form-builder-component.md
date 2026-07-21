## Mount form builder component

Open your terminal or command prompt and navigate to your project directory. Then, run the following command to install the `@docuseal/angular` package

Once the installation is complete, you'll need to import the component in the relevant file where you intend to use DocuSeal. With the component imported, you can now use `<docuseal-builder>` within your Angular template wherever you want to integrate the DocuSeal document form builder functionality.

Trigger the API call to your backend endpoint to retrieve a JSON Web Token (JWT) generated on the previous step. The `ngOnInit` method triggers the API request upon component mount, fetching the JWT asynchronously.

**Learn more:**

[Embed API Reference](form-builder-angular.md)

[Angular package on GitHub](https://github.com/docusealco/docuseal-angular)

[Embedded Demo App](https://embed.docuseal.tech/)


```
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DocusealBuilderComponent } from '@docuseal/angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DocusealBuilderComponent],
  template: `
    <div>
      <ng-container *ngIf="token; else loading">
        <docuseal-builder [token]="token"></docuseal-builder>
      </ng-container>
      <ng-template #loading>
        <p>Loading...</p>
      </ng-template>
    </div>
  `,
})
export class AppComponent implements OnInit {
  token: string | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.fetchToken();
  }

  private fetchToken(): void {
    this.http.get<{ jwt: string }>('/your_backend/docuseal_builder/init').subscribe({
      next: (resp) => {
        // API should respond with JWT generated on your backend
        this.token = resp.jwt;
      }
    });
  }
}
```
