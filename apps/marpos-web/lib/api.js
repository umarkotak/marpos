import { en } from "@/lib/i18n";
export async function api(path, options = {}) {
  const { body, headers, ...request } = options;
  const json = body != null && !(body instanceof FormData);
  const response = await fetch(`/backend${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    ...request,
    headers: {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json ? JSON.stringify(body) : body,
  }).catch(() => {
    throw new Error(en.server_is_unavailable_try_again_when_it_returns);
  });
  const result = await response.json().catch(() => ({
    success: false,
    error: { message: en.server_is_unavailable_try_again_when_it_returns },
  }));
  if (!response.ok || !result.success) {
    const error = new Error(result.error?.message || en.request_failed);
    error.status = response.status;
    throw error;
  }
  return result.data;
}
