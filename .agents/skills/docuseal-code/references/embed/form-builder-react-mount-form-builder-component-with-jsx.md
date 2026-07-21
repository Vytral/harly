## Mount form builder component with JSX

Open your terminal or command prompt and navigate to your project directory. Then, run the following command to install the `@docuseal/react` package

Once the installation is complete, you'll need to import the component in the relevant file where you intend to use DocuSeal. With the component imported, you can now use `<DocusealBuilder />` within your React JSX template wherever you want to integrate the DocuSeal document form builder functionality.

Trigger the API call to your backend endpoint to retrieve a JSON Web Token (JWT) generated on the previous step. The useEffect hook handles this API request upon component mount, fetching the JWT asynchronously.


```
import { useState, useEffect } from 'react';
import { DocusealBuilder } from '@docuseal/react'

export default function Home() {
  const [token, setToken] = useState(null);

  useEffect(() => {
    fetch('/your_backend/docuseal_builder/init').then(async (resp) => {
      // API should respond with JWT generated on your backend
      const { jwt } = await resp.json()

      setToken(jwt)
    })
  }, []);

  return (
    <div>
      {token ? (
        <DocusealBuilder token={token} />
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}
```
