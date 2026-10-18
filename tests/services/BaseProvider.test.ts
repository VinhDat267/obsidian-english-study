import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestUrl } from "obsidian";
import { BaseProvider } from "../../src/services/provider/BaseProvider";

class TestProvider extends BaseProvider {
  public testFetchJson<T>(url: string, options?: any) {
    return this.fetchJson<T>(url, options);
  }

  public testFetchText(url: string, options?: any) {
    return this.fetchText(url, options);
  }

  public setTimeoutMs(ms: number) {
    this.defaultTimeoutMs = ms;
  }
}

describe("BaseProvider", () => {
  let provider: TestProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new TestProvider();
  });

  describe("fetchJson", () => {
    it("should return JSON data when status is 200", async () => {
      const mockData = { message: "ok", count: 42 };
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockData,
        text: JSON.stringify(mockData),
      });

      const res = await provider.testFetchJson<typeof mockData>("https://example.com/api");
      expect(res).toEqual(mockData);
      expect(requestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://example.com/api",
          throw: false,
        })
      );
    });

    it("should return null when status is not 200", async () => {
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 404,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: { error: "not found" },
        text: "not found",
      });

      const res = await provider.testFetchJson("https://example.com/api/missing");
      expect(res).toBeNull();
    });

    it("should return null when requestUrl throws network error", async () => {
      vi.mocked(requestUrl).mockRejectedValueOnce(new Error("Network failed"));

      const res = await provider.testFetchJson("https://example.com/api/fail");
      expect(res).toBeNull();
    });

    it("should return null when request times out", async () => {
      provider.setTimeoutMs(50);
      // Simulate request taking longer than timeout
      vi.mocked(requestUrl).mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 200)) as any
      );

      const res = await provider.testFetchJson("https://example.com/api/slow");
      expect(res).toBeNull();
    });
  });

  describe("fetchText", () => {
    it("should return text when status is 200", async () => {
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: null,
        text: "plain text content",
      });

      const res = await provider.testFetchText("https://example.com/text");
      expect(res).toBe("plain text content");
    });

    it("should return null when status is not 200", async () => {
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 500,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: null,
        text: "Error",
      });

      const res = await provider.testFetchText("https://example.com/error");
      expect(res).toBeNull();
    });
  });
});
