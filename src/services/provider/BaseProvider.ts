import { requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";

export abstract class BaseProvider {
  protected defaultTimeoutMs: number = 3500;

  /**
   * Thực hiện HTTP request an toàn với timeout và throw: false.
   */
  protected async executeRequest(
    url: string,
    options?: Partial<RequestUrlParam>,
    timeoutMs: number = this.defaultTimeoutMs
  ): Promise<RequestUrlResponse | null> {
    let timer: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
      const param: RequestUrlParam = {
        url,
        throw: false,
        ...options,
      };

      const res = await Promise.race([requestUrl(param), timeoutPromise]);
      return res;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Gọi HTTP request qua requestUrl của Obsidian API (bypass CORS).
   * - throw: false để không ném ngoại lệ khi gặp mã lỗi HTTP.
   * - Trả về dữ liệu JSON kiểu T nếu status 200, ngược lại trả về null.
   */
  protected async fetchJson<T>(url: string, options?: Partial<RequestUrlParam>): Promise<T | null> {
    const res = await this.executeRequest(url, options);
    if (!res || res.status !== 200) {
      return null;
    }

    if (res.json !== undefined && res.json !== null) {
      return res.json as T;
    }

    if (res.text) {
      try {
        return JSON.parse(res.text) as T;
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Trả về response dạng text thuần nếu status 200, ngược lại null.
   */
  protected async fetchText(url: string, options?: Partial<RequestUrlParam>): Promise<string | null> {
    const res = await this.executeRequest(url, options);
    if (!res || res.status !== 200) {
      return null;
    }

    if (typeof res.text === "string") {
      return res.text;
    }

    if (res.json !== undefined && res.json !== null) {
      return typeof res.json === "string" ? res.json : JSON.stringify(res.json);
    }

    return null;
  }
}
