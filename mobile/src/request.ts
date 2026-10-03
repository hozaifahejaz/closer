export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function requestJson<T>(url: string, token: string | null, body?: object, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    let data;
    try { data = await response.json(); }
    catch {
      if (response.ok) throw new ApiError('Unexpected response from Closer. Please try again.', 502);
      data = {};
    }
    if (!response.ok) throw new ApiError(typeof data?.error === 'string' ? data.error : 'Something went wrong, please try again', response.status);
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError('Closer took too long to respond. Please try again.', 0);
    if (error instanceof ApiError) throw error;
    throw new ApiError("Can't reach Closer. Check your connection and try again.", 0);
  } finally { clearTimeout(timeout); }
}
