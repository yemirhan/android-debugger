import type { NetworkRequest, SdkMessage } from '@android-debugger/shared';

type SendFn = (message: SdkMessage) => void;

let originalFetch: typeof fetch | null = null;
let originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
let originalXHRSend: typeof XMLHttpRequest.prototype.send | null = null;

let requestId = 0;

function generateRequestId(): string {
  return `req-${Date.now()}-${++requestId}`;
}

export function interceptNetwork(send: SendFn): () => void {
  if (originalFetch) {
    // Already intercepted
    return () => {};
  }

  // Intercept fetch
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const id = generateRequestId();
    const startTime = Date.now();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';
    const headers: Record<string, string> = {};

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([key, value]) => {
          headers[key] = value;
        });
      } else {
        Object.assign(headers, init.headers);
      }
    }

    // Send request start
    const request: NetworkRequest = {
      id,
      url,
      method: method.toUpperCase(),
      headers,
      body: init?.body ? String(init.body) : undefined,
      timestamp: startTime,
    };

    send({
      type: 'network',
      timestamp: startTime,
      payload: request,
    });

    try {
      const response = await originalFetch!(input, init);

      // Clone response to read body
      const clonedResponse = response.clone();
      let responseBody: string | undefined;

      try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json') || contentType?.includes('text')) {
          responseBody = await clonedResponse.text();
          // Truncate large responses
          if (responseBody.length > 10000) {
            responseBody = responseBody.substring(0, 10000) + '... [truncated]';
          }
        }
      } catch {
        // Ignore body read errors
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Send response
      const completedRequest: NetworkRequest = {
        ...request,
        status: response.status,
        responseHeaders,
        responseBody,
        duration: Date.now() - startTime,
      };

      send({
        type: 'network',
        timestamp: Date.now(),
        payload: completedRequest,
      });

      return response;
    } catch (error) {
      // Send error
      const errorRequest: NetworkRequest = {
        ...request,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };

      send({
        type: 'network',
        timestamp: Date.now(),
        payload: errorRequest,
      });

      throw error;
    }
  };

  // Intercept XMLHttpRequest
  originalXHROpen = XMLHttpRequest.prototype.open;
  originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null
  ): void {
    (this as any).__debugger_id = generateRequestId();
    (this as any).__debugger_method = method;
    (this as any).__debugger_url = url.toString();
    (this as any).__debugger_start = 0;
    (this as any).__debugger_headers = {};

    const originalSetRequestHeader = this.setRequestHeader;
    this.setRequestHeader = function (name: string, value: string): void {
      (this as any).__debugger_headers[name] = value;
      originalSetRequestHeader.call(this, name, value);
    };

    return originalXHROpen!.call(this, method, url, async, username, password);
  };

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null): void {
    const id = (this as any).__debugger_id;
    const method = (this as any).__debugger_method || 'GET';
    const url = (this as any).__debugger_url || '';
    const headers = (this as any).__debugger_headers || {};
    const startTime = Date.now();

    (this as any).__debugger_start = startTime;

    const request: NetworkRequest = {
      id,
      url,
      method: method.toUpperCase(),
      headers,
      body: body ? String(body) : undefined,
      timestamp: startTime,
    };

    send({
      type: 'network',
      timestamp: startTime,
      payload: request,
    });

    this.addEventListener('load', function () {
      const responseHeaders: Record<string, string> = {};
      const headerString = this.getAllResponseHeaders();
      headerString.split('\r\n').forEach((line) => {
        const [key, ...valueParts] = line.split(':');
        if (key) {
          responseHeaders[key.trim().toLowerCase()] = valueParts.join(':').trim();
        }
      });

      let responseBody = this.responseText;
      if (responseBody && responseBody.length > 10000) {
        responseBody = responseBody.substring(0, 10000) + '... [truncated]';
      }

      const completedRequest: NetworkRequest = {
        ...request,
        status: this.status,
        responseHeaders,
        responseBody,
        duration: Date.now() - startTime,
      };

      send({
        type: 'network',
        timestamp: Date.now(),
        payload: completedRequest,
      });
    });

    this.addEventListener('error', function () {
      const errorRequest: NetworkRequest = {
        ...request,
        error: 'Network request failed',
        duration: Date.now() - startTime,
      };

      send({
        type: 'network',
        timestamp: Date.now(),
        payload: errorRequest,
      });
    });

    this.addEventListener('timeout', function () {
      const errorRequest: NetworkRequest = {
        ...request,
        error: 'Request timeout',
        duration: Date.now() - startTime,
      };

      send({
        type: 'network',
        timestamp: Date.now(),
        payload: errorRequest,
      });
    });

    return originalXHRSend!.call(this, body);
  };

  // Return restore function
  return () => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
      originalFetch = null;
    }
    if (originalXHROpen) {
      XMLHttpRequest.prototype.open = originalXHROpen;
      originalXHROpen = null;
    }
    if (originalXHRSend) {
      XMLHttpRequest.prototype.send = originalXHRSend;
      originalXHRSend = null;
    }
  };
}
