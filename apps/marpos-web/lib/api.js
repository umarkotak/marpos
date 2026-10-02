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
  });
  const result = await response
    .json()
    .catch(() => ({
      success: false,
      error: { message: "Server is unavailable. Try again when it returns." },
    }));
  if (!response.ok || !result.success) {
    const error = new Error(result.error?.message || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return result.data;
}
