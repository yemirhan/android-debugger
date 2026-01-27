import type { NetworkRequest, SdkMessage } from '@android-debugger/shared';

type SendFn = (message: SdkMessage) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AxiosInstance = any;

interface AxiosInterceptorManager {
  requestInterceptorId: number | null;
  responseInterceptorId: number | null;
  instance: AxiosInstance;
}

let originalFetch: typeof fetch | null = null;
let originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
let originalXHRSend: typeof XMLHttpRequest.prototype.send | null = null;
let axiosInterceptors: AxiosInterceptorManager[] = [];

let requestId = 0;

function generateRequestId(): string {
  return `req-${Date.now()}-${++requestId}`;
}

/**
 * Intercept an Axios instance
 */
export function interceptAxios(axiosInstance: AxiosInstance, send: SendFn): () => void {
  const pendingRequests = new Map<string, NetworkRequest>();

  // Request interceptor
  const requestInterceptorId = axiosInstance.interceptors.request.use(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (config: any) => {
      const id = generateRequestId();
      const startTime = Date.now();

      // Store ID in config for response matching
      config.__debugger_id = id;
      config.__debugger_start = startTime;

      const headers: Record<string, string> = {};
      if (config.headers) {
        // Axios headers can be an object or AxiosHeaders instance
        const headerObj = config.headers.toJSON ? config.headers.toJSON() : config.headers;
        Object.entries(headerObj).forEach(([key, value]) => {
          if (typeof value === 'string') {
            headers[key] = value;
          }
        });
      }

      let body: string | undefined;
      if (config.data) {
        try {
          body = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
        } catch {
          body = String(config.data);
        }
      }

      const request: NetworkRequest = {
        id,
        url: config.url || '',
        method: (config.method || 'GET').toUpperCase(),
        headers,
        body,
        timestamp: startTime,
      };

      // Handle baseURL
      if (config.baseURL && config.url && !config.url.startsWith('http')) {
        request.url = config.baseURL.replace(/\/$/, '') + '/' + config.url.replace(/^\//, '');
      }

      pendingRequests.set(id, request);

      send({
        type: 'network',
        timestamp: startTime,
        payload: request,
      });

      return config;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (error: any) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor
  const responseInterceptorId = axiosInstance.interceptors.response.use(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (response: any) => {
      const id = response.config?.__debugger_id;
      const startTime = response.config?.__debugger_start || Date.now();
      const request = pendingRequests.get(id);

      if (request) {
        pendingRequests.delete(id);

        const responseHeaders: Record<string, string> = {};
        if (response.headers) {
          const headerObj = response.headers.toJSON ? response.headers.toJSON() : response.headers;
          Object.entries(headerObj).forEach(([key, value]) => {
            if (typeof value === 'string') {
              responseHeaders[key] = value;
            }
          });
        }

        let responseBody: string | undefined;
        if (response.data !== undefined) {
          try {
            responseBody =
              typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            if (responseBody && responseBody.length > 10000) {
              responseBody = responseBody.substring(0, 10000) + '... [truncated]';
            }
          } catch {
            responseBody = String(response.data);
          }
        }

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
      }

      return response;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (error: any) => {
      const config = error.config || {};
      const id = config.__debugger_id;
      const startTime = config.__debugger_start || Date.now();
      const request = pendingRequests.get(id);

      if (request) {
        pendingRequests.delete(id);

        const errorRequest: NetworkRequest = {
          ...request,
          status: error.response?.status,
          error: error.message || 'Request failed',
          duration: Date.now() - startTime,
        };

        // Include response data if available
        if (error.response?.data) {
          try {
            errorRequest.responseBody =
              typeof error.response.data === 'string'
                ? error.response.data
                : JSON.stringify(error.response.data);
          } catch {
            errorRequest.responseBody = String(error.response.data);
          }
        }

        send({
          type: 'network',
          timestamp: Date.now(),
          payload: errorRequest,
        });
      }

      return Promise.reject(error);
    }
  );

  const manager: AxiosInterceptorManager = {
    requestInterceptorId,
    responseInterceptorId,
    instance: axiosInstance,
  };
  axiosInterceptors.push(manager);

  // Return restore function
  return () => {
    if (manager.requestInterceptorId !== null) {
      axiosInstance.interceptors.request.eject(manager.requestInterceptorId);
    }
    if (manager.responseInterceptorId !== null) {
      axiosInstance.interceptors.response.eject(manager.responseInterceptorId);
    }
    axiosInterceptors = axiosInterceptors.filter((m) => m !== manager);
  };
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

      let responseBody: string | undefined;
      const responseType = this.responseType;

      if (responseType === '' || responseType === 'text') {
        responseBody = this.responseText;
      } else if (responseType === 'json' && this.response) {
        try {
          responseBody = JSON.stringify(this.response);
        } catch {
          responseBody = '[JSON response - unable to stringify]';
        }
      } else if (responseType === 'blob' || responseType === 'arraybuffer') {
        const size =
          (this.response as Blob)?.size ?? (this.response as ArrayBuffer)?.byteLength ?? 0;
        responseBody = `[${responseType} response - ${size} bytes]`;
      }

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
    // Clean up any axios interceptors
    axiosInterceptors.forEach((manager) => {
      if (manager.requestInterceptorId !== null) {
        manager.instance.interceptors.request.eject(manager.requestInterceptorId);
      }
      if (manager.responseInterceptorId !== null) {
        manager.instance.interceptors.response.eject(manager.responseInterceptorId);
      }
    });
    axiosInterceptors = [];
  };
}
