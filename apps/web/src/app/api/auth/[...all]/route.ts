import { toNextJsHandler } from "@harly/auth/next";

import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
