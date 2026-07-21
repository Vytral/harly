## Mount form builder component

Open your terminal or command prompt and navigate to your project directory. Then, run the following command to install the `@docuseal/vue` package

Once the installation is complete, you'll need to import the component in the relevant file where you intend to use DocuSeal. With the component imported, you can now use `<DocusealBuilder />` within your Vue template wherever you want to integrate the DocuSeal document form builder functionality.

Trigger the API call to your backend endpoint to retrieve a JSON Web Token (JWT) generated on the previous step.


```
<template>
  <DocusealBuilder
    v-if="token"
    :token="token"
  />
</template>

<script>
import { DocusealBuilder } from '@docuseal/vue'

export default {
  name: 'App',
  components: {
    DocusealBuilder
  },
  data () {
    return {
      token: ''
    }
  },
  mounted () {
    fetch('/your_backend/docuseal/init_builder', {
      method: 'POST'
    }).then(async (resp) => {
      const { jwt } = await resp.json()

      this.token = jwt
    })
  }
}
</script>
```
