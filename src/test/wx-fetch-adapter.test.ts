import { describe, expect, mock, test } from "bun:test";
import { wxFetchAdapter } from "../wx-fetch-adapter";

type WxRequestOptions = {
	url: string;
	method: string;
	data?: unknown;
	header: Record<string, string>;
	success: (result: {
		data: unknown;
		statusCode: number;
		header?: Record<string, string>;
	}) => void;
	fail: (result: { errMsg: string }) => void;
};

function mockWxRequest(handler: (options: WxRequestOptions) => void) {
	const request = mock((options: WxRequestOptions) => handler(options));
	(globalThis as unknown as { wx: { request: typeof request } }).wx = {
		request,
	};
	return request;
}

describe("wxFetchAdapter", () => {
	describe("请求构造", () => {
		test("GET 请求：不传 body，method 默认为 GET", async () => {
			const request = mockWxRequest((options) => {
				options.success({ data: { ok: true }, statusCode: 200, header: {} });
			});

			await wxFetchAdapter("https://example.com/api");

			const options = request.mock.calls[0]![0];
			expect(options.method).toBe("GET");
			expect(options.data).toBeUndefined();
		});

		test("POST 请求：JSON 字符串 body 被反序列化后传给 wx.request", async () => {
			const request = mockWxRequest((options) => {
				options.success({ data: { ok: true }, statusCode: 200, header: {} });
			});

			await wxFetchAdapter("https://example.com/api", {
				method: "POST",
				body: JSON.stringify({ code: "wx-code" }),
			});

			const options = request.mock.calls[0]![0];
			expect(options.method).toBe("POST");
			expect(options.data).toEqual({ code: "wx-code" });
		});

		test("headers 合并：自定义 header 与默认 Content-Type 正确合并", async () => {
			const request = mockWxRequest((options) => {
				options.success({ data: { ok: true }, statusCode: 200, header: {} });
			});

			await wxFetchAdapter("https://example.com/api", {
				headers: { "X-Client": "mini" },
			});

			const options = request.mock.calls[0]![0];
			expect(options.header["Content-Type"]).toBe("application/json");
			expect(options.header["X-Client"]).toBe("mini");
		});

		test("Authorization header 正确透传", async () => {
			const request = mockWxRequest((options) => {
				options.success({ data: { ok: true }, statusCode: 200, header: {} });
			});

			await wxFetchAdapter("https://example.com/api", {
				headers: { Authorization: "Bearer token" },
			});

			expect(request.mock.calls[0]![0].header.Authorization).toBe(
				"Bearer token",
			);
		});
	});

	describe("响应构造", () => {
		test("2xx 响应：response.ok === true，status 正确，json() 返回正确数据", async () => {
			mockWxRequest((options) => {
				options.success({ data: { ok: true }, statusCode: 200, header: {} });
			});

			const response = await wxFetchAdapter("https://example.com/api");

			expect(response.ok).toBe(true);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ ok: true });
		});

		test("4xx 响应：response.ok === false，status 正确，json() 返回错误体", async () => {
			mockWxRequest((options) => {
				options.success({
					data: { code: "BAD_REQUEST" },
					statusCode: 400,
					header: {},
				});
			});

			const response = await wxFetchAdapter("https://example.com/api");

			expect(response.ok).toBe(false);
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ code: "BAD_REQUEST" });
		});

		test("wx.request fail：返回 status=0，body 包含 NETWORK_ERROR", async () => {
			mockWxRequest((options) => {
				options.fail({ errMsg: "request:fail timeout" });
			});

			const response = await wxFetchAdapter("https://example.com/api");

			expect(response.ok).toBe(false);
			expect(response.status).toBe(0);
			expect(await response.json()).toEqual({
				code: "NETWORK_ERROR",
				message: "request:fail timeout",
			});
		});

		test("response.text() 返回 JSON 字符串", async () => {
			mockWxRequest((options) => {
				options.success({ data: { ok: true }, statusCode: 200, header: {} });
			});

			const response = await wxFetchAdapter("https://example.com/api");

			expect(await response.text()).toBe('{"ok":true}');
		});

		test("response.clone() 返回独立副本", async () => {
			mockWxRequest((options) => {
				options.success({ data: { ok: true }, statusCode: 200, header: {} });
			});

			const response = await wxFetchAdapter("https://example.com/api");
			const cloned = response.clone();

			expect(cloned).not.toBe(response);
			expect(await cloned.json()).toEqual({ ok: true });
		});
	});

	describe("Headers 接口", () => {
		test("headers.get(key) 大小写不敏感", async () => {
			mockWxRequest((options) => {
				options.success({
					data: { ok: true },
					statusCode: 200,
					header: { "Content-Type": "application/json" },
				});
			});

			const response = await wxFetchAdapter("https://example.com/api");

			expect(response.headers.get("content-type")).toBe("application/json");
			expect(response.headers.get("Content-Type")).toBe("application/json");
		});

		test("headers.get(不存在的 key) 返回 null", async () => {
			mockWxRequest((options) => {
				options.success({ data: { ok: true }, statusCode: 200, header: {} });
			});

			const response = await wxFetchAdapter("https://example.com/api");

			expect(response.headers.get("x-missing")).toBeNull();
		});

		test("headers.forEach 遍历所有响应头", async () => {
			mockWxRequest((options) => {
				options.success({
					data: { ok: true },
					statusCode: 200,
					header: { "X-One": "1", "X-Two": "2" },
				});
			});

			const response = await wxFetchAdapter("https://example.com/api");
			const entries: Record<string, string> = {};

			response.headers.forEach((value, key) => {
				entries[key] = value;
			});

			expect(entries).toEqual({ "X-One": "1", "X-Two": "2" });
		});
	});
});
