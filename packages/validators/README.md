# @harly/validators

Shared Zod validation schemas used by the web app and the REST API.

## What lives here

- Candidate create and update inputs, including the http(s)-only profile link schema (`httpUrlSchema`, `isHttpUrl`)
- Job, application, offer, scorecard, task, webhook and API key inputs for the public REST API
- Upload request limits for resumes and images
- Small shared primitives such as `optionalTrimmedString` and `optionalHttpsUrlSchema`

Feature-specific forms and server actions that need translated messages still keep their schemas next to the feature in `apps/web`; they reuse the primitives from this package where one exists.

## Usage

```ts
import { candidateCreateSchema, isHttpUrl } from "@harly/validators";
```

Run the tests with `pnpm --filter @harly/validators test`.
