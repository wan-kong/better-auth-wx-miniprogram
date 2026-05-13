import { test, expect, mock } from "bun:test";
import { code2Session } from "../src/lib/code2session";

const baseOptions = {
	appId: "test-app-id",
	appSecret: "test-app-secret",
};

test("正常返回 openid + session_key", async () => {
	const mockFetch = mock(() =>
		Promise.resolve({
			json: () =>
				Promise.resolve({
					openid: "oTest123456",
					session_key: "abc+def/ghi==",
					errcode: 0,
				}),
		}),
	);
	globalThis.fetch = mockFetch as unknown as typeof fetch;

	const result = await code2Session("test-code", baseOptions);

	expect(result.openid).toBe("oTest123456");
	expect(result.session_key).toBe("abc+def/ghi==");
	expect(result.unionid).toBeUndefined();
});

test("包含 unionid 时正常返回", async () => {
	const mockFetch = mock(() =>
		Promise.resolve({
			json: () =>
				Promise.resolve({
					openid: "oTest123456",
					session_key: "abc+def/ghi==",
					unionid: "uUnionId789",
					errcode: 0,
				}),
		}),
	);
	globalThis.fetch = mockFetch as unknown as typeof fetch;

	const result = await code2Session("test-code", baseOptions);

	expect(result.openid).toBe("oTest123456");
	expect(result.session_key).toBe("abc+def/ghi==");
	expect(result.unionid).toBe("uUnionId789");
});

test("微信返回 errcode=40029（code无效）时抛出 WX_CODE_INVALID", async () => {
	const mockFetch = mock(() =>
		Promise.resolve({
			json: () =>
				Promise.resolve({
					errcode: 40029,
					errmsg: "invalid code",
				}),
		}),
	);
	globalThis.fetch = mockFetch as unknown as typeof fetch;

	await expect(code2Session("bad-code", baseOptions)).rejects.toThrow(
		"wx_code_invalid",
	);
});

test("微信返回 errcode=40163（code已使用）时抛出 WX_CODE_INVALID", async () => {
	const mockFetch = mock(() =>
		Promise.resolve({
			json: () =>
				Promise.resolve({
					errcode: 40163,
					errmsg: "code been used",
				}),
		}),
	);
	globalThis.fetch = mockFetch as unknown as typeof fetch;

	await expect(code2Session("used-code", baseOptions)).rejects.toThrow(
		"wx_code_invalid",
	);
});

test("微信返回其他 errcode 时抛出 WX_API_ERROR", async () => {
	const mockFetch = mock(() =>
		Promise.resolve({
			json: () =>
				Promise.resolve({
					errcode: -1,
					errmsg: "system error",
				}),
		}),
	);
	globalThis.fetch = mockFetch as unknown as typeof fetch;

	await expect(code2Session("test-code", baseOptions)).rejects.toThrow(
		"wx_api_error",
	);
});

test("网络请求失败时抛出 WX_API_ERROR", async () => {
	const mockFetch = mock(() => Promise.reject(new Error("Network error")));
	globalThis.fetch = mockFetch as unknown as typeof fetch;

	await expect(code2Session("test-code", baseOptions)).rejects.toThrow(
		"wx_api_error",
	);
});

test("支持自定义 code2SessionUrl", async () => {
	let requestedUrl = "";
	const mockFetch = mock((url: string) => {
		requestedUrl = url;
		return Promise.resolve({
			json: () =>
				Promise.resolve({
					openid: "oTest",
					session_key: "key",
					errcode: 0,
				}),
		});
	});
	globalThis.fetch = mockFetch as unknown as typeof fetch;

	await code2Session("test-code", {
		...baseOptions,
		code2SessionUrl: "https://custom.example.com/code2session",
	});

	expect(requestedUrl).toContain("https://custom.example.com/code2session");
});
