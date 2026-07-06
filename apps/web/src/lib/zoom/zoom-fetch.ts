type ZoomError = {
  message: string;
  error_code: number;
};

export class ZoomAPIError extends Error {
  code: number;
  status: number;

  constructor(message: string, status: number, code: number) {
    super(message);
    this.name = "ZoomAPIError";
    this.code = code;
    this.status = status;
  }
}

export async function zoomFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`https://api.zoom.us${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as ZoomError | null;
    const message = errorBody?.message ?? `Zoom API error: ${response.status}`;
    const code = errorBody?.error_code ?? response.status;
    throw new ZoomAPIError(message, response.status, code);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
