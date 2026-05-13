import { test, expect, mock } from "bun:test";
import { wxMiniprogram } from "../src/plugin";

function createInputCtx(overrides: Record<string, unknown> = {}) {
	return {
		body: {},
		headers: new Headers({ "Content-Type": "application/json" }),
		method: "POST",
		path: "/wx-miniprogram/login",
		request: { url: "https://example.com/api/auth/wx-miniprogram/login" },
		...overrides,
	};
}

function createSession(sessionToken = "mock-session-token", userId = "user-1") {
	return {
		session: {
			token: sessionToken,
			userId,
			expiresAt: new Date(Date.now() + 86400_000),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		user: {
			id: userId,
			name: "Test User",
			email: "test@example.com",
			emailVerified: false,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	};
}

const baseOptions = {
	appId: "test-app-id",
	appSecret: "test-app-secret",
	storeSessionKey: true,
};

test("POST /wx-miniprogram/login - 新用户：通过 anonymous plugin 创建匿名 user（isAnonymous: true），新建 account，返回 token", async () => {
	const mockFetch = mock(() =>
		Promise.resolve({
			json: () =>
				Promise.resolve({
					openid: "oNewUser123",
					session_key: "skey123",
					errcode: 0,
				}),
		}),
	);
	globalThis.fetch = mockFetch as unknown as typeof fetch;

	const anonUser = {
		id: "user-1",
		name: "",
		email: "temp-user-1@wx.placeholder.invalid",
		emailVerified: false,
		image: null,
		isAnonymous: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
	const anonSession = { token: "session-token-xyz" };
	const anonResult = { user: anonUser, session: anonSession };

	const savedAccount: Record<string, unknown>[] = [];

	const mockInternalAdapter = {
		signInAnonymous: mock(() => Promise.resolve(anonResult)),
	};

	const mockAdapter = {
		findOne: mock(() => Promise.resolve(null)),
		create: mock((opts: { data: Record<string, unknown> }) => {
			savedAccount.push(opts.data);
			return Promise.resolve(opts.data);
		}),
		update: mock(() => Promise.resolve({})),
	};

	const plugin = wxMiniprogram(baseOptions);
	const endpoint = plugin.endpoints.wxLogin;
	const inputCtx = createInputCtx({
		body: { code: "valid-code" },
		context: {
			adapter: mockAdapter,
			internalAdapter: mockInternalAdapter,
		},
	});

	const result = await endpoint(inputCtx as Parameters<typeof endpoint>[0]);

	expect(mockInternalAdapter.signInAnonymous).toHaveBeenCalled();
	expect(mockAdapter.create).toHaveBeenCalled();
	expect(savedAccount[0]?.providerId).toBe("wx-miniprogram");
	expect(savedAccount[0]?.accountId).toBe("oNewUser123");
	expect(result.token).toBe("session-token-xyz");
	expect(result.user).toBeDefined();
	expect(result.user.isAnonymous).toBe(true);
});

test("POST /wx-miniprogram/login - 新用户：anonymous plugin 未配置时返回 500（WX_ANONYMOUS_PLUGIN_MISSING）", async () => {
	const mockFetch = mock(() =>
		Promise.resolve({
			json: () =>
				Promise.resolve({
					openid: "oNewUser123",
					session_key: "skey123",
					errcode: 0,
				}),
		}),
	);
	globalThis.fetch = mockFetch as unknown as typeof fetch;

	const mockInternalAdapter = {
		// signInAnonymous 不存在，模拟未配置 anonymous plugin
	};

	const mockAdapter = {
		findOne: mock(() => Promise.resolve(null)),
	};

	const plugin = wxMiniprogram(baseOptions);
	const endpoint = plugin.endpoints.wxLogin;
	const inputCtx = createInputCtx({
		body: { code: "valid-code" },
		context: {
			adapter: mockAdapter,
			internalAdapter: mockInternalAdapter,
		},
	});

	await expect(
		endpoint(inputCtx as Parameters<typeof endpoint>[0]),
	).rejects.toThrow("anonymous plugin is required but not configured");
});

test("POST /wx-miniprogram/login - 老用户：复用已有 user，更新 session_key，返回 token", async () => {
	const mockFetch = mock(() =>
		Promise.resolve({
			json: () =>
				Promise.resolve({
					openid: "oExistingUser",
					session_key: "new-skey",
					errcode: 0,
				}),
		}),
	);
	globalThis.fetch = mockFetch as unknown as typeof fetch;

	const existingAccount = {
		id: "acc-1",
		userId: "user-existing",
		providerId: "wx-miniprogram",
		accountId: "oExistingUser",
	};

	const updateCalled: Array<{
		where: unknown;
		update: Record<string, unknown>;
	}> = [];

	const mockInternalAdapter = {
		createSession: mock(() =>
			Promise.resolve({ token: "token-returning-user" }),
		),
	};

	const mockAdapter = {
		findOne: mock(() => Promise.resolve(existingAccount)),
		create: mock(() => Promise.resolve({})),
		update: mock(
			(opts: { where: unknown; update: Record<string, unknown> }) => {
				updateCalled.push(opts);
				return Promise.resolve({});
			},
		),
	};

	const plugin = wxMiniprogram(baseOptions);
	const endpoint = plugin.endpoints.wxLogin;
	const inputCtx = createInputCtx({
		body: { code: "valid-code" },
		context: {
			adapter: mockAdapter,
			internalAdapter: mockInternalAdapter,
		},
	});

	const result = await endpoint(inputCtx as Parameters<typeof endpoint>[0]);

	expect(mockAdapter.update).toHaveBeenCalled();
	expect(updateCalled.length).toBe(1);
	expect(updateCalled[0]?.update.accessToken).toBe("new-skey");
	expect(mockInternalAdapter.createSession).toHaveBeenCalled();
	expect(result.token).toBe("token-returning-user");
});

test("POST /wx-miniprogram/login - 微信 code 无效时返回 401", async () => {
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

	const plugin = wxMiniprogram(baseOptions);
	const endpoint = plugin.endpoints.wxLogin;
	const inputCtx = createInputCtx({
		body: { code: "bad-code" },
		context: {
			adapter: { findOne: mock(() => Promise.resolve(null)) },
			internalAdapter: {},
		},
	});

	await expect(
		endpoint(inputCtx as Parameters<typeof endpoint>[0]),
	).rejects.toThrow("wx_code_invalid");
});

test("POST /wx-miniprogram/login - storeSessionKey=false 时不写入 accessToken", async () => {
	const mockFetch = mock(() =>
		Promise.resolve({
			json: () =>
				Promise.resolve({
					openid: "oExistingUser",
					session_key: "new-skey",
					errcode: 0,
				}),
		}),
	);
	globalThis.fetch = mockFetch as unknown as typeof fetch;

	const existingAccount = {
		id: "acc-1",
		userId: "user-existing",
		providerId: "wx-miniprogram",
		accountId: "oExistingUser",
	};

	const updateCalled: Array<Record<string, unknown>> = [];

	const mockInternalAdapter = {
		createSession: mock(() =>
			Promise.resolve({ token: "token-returning-user" }),
		),
	};

	const mockAdapter = {
		findOne: mock(() => Promise.resolve(existingAccount)),
		update: mock((opts: { update: Record<string, unknown> }) => {
			updateCalled.push(opts.update);
			return Promise.resolve({});
		}),
	};

	const plugin = wxMiniprogram({ ...baseOptions, storeSessionKey: false });
	const endpoint = plugin.endpoints.wxLogin;
	const inputCtx = createInputCtx({
		body: { code: "valid-code" },
		context: {
			adapter: mockAdapter,
			internalAdapter: mockInternalAdapter,
		},
	});

	await endpoint(inputCtx as Parameters<typeof endpoint>[0]);

	expect(updateCalled.length).toBe(1);
	expect(updateCalled[0]?.accessToken).toBeUndefined();
	expect(updateCalled[0]?.accessTokenExpiresAt).toBeUndefined();
});

test("POST /wx-miniprogram/update-profile - body 为空时直接返回 success", async () => {
	const plugin = wxMiniprogram(baseOptions);
	const endpoint = plugin.endpoints.wxUpdateProfile;

	const updateMock = mock(() => Promise.resolve({}));
	const session = createSession();

	const inputCtx = createInputCtx({
		body: {},
		context: {
			session,
			adapter: { update: updateMock },
			authCookies: { sessionToken: { name: "session" } },
		},
	});

	const result = await endpoint(inputCtx as Parameters<typeof endpoint>[0]);
	expect(result.success).toBe(true);
	expect(updateMock).not.toHaveBeenCalled();
});

test("POST /wx-miniprogram/update-profile - 更新 nickName 成功", async () => {
	const plugin = wxMiniprogram(baseOptions);
	const endpoint = plugin.endpoints.wxUpdateProfile;

	const updateMock = mock(() => Promise.resolve({}));
	const session = createSession();

	const inputCtx = createInputCtx({
		body: { nickName: "张三" },
		context: {
			session,
			adapter: { update: updateMock },
			authCookies: { sessionToken: { name: "session" } },
		},
	});

	const result = await endpoint(inputCtx as Parameters<typeof endpoint>[0]);
	expect(result.success).toBe(true);
	expect(updateMock).toHaveBeenCalled();
	const callArg = updateMock.mock.calls[0]![0] as {
		update: Record<string, string>;
	};
	expect(callArg.update.name).toBe("张三");
});

test("POST /wx-miniprogram/decrypt-phone - storeSessionKey=false 时返回 400", async () => {
	const plugin = wxMiniprogram({ ...baseOptions, storeSessionKey: false });
	const endpoint = plugin.endpoints.wxDecryptPhone;

	const session = createSession();
	const inputCtx = createInputCtx({
		body: { encryptedData: "test", iv: "test" },
		context: {
			session,
			authCookies: { sessionToken: { name: "session" } },
		},
	});

	await expect(
		endpoint(inputCtx as Parameters<typeof endpoint>[0]),
	).rejects.toThrow("storeSessionKey is disabled");
});

test("POST /wx-miniprogram/decrypt-phone - session_key 过期时返回 401", async () => {
	const plugin = wxMiniprogram(baseOptions);
	const endpoint = plugin.endpoints.wxDecryptPhone;

	const session = createSession();
	const mockAdapter = {
		findOne: mock(() =>
			Promise.resolve({
				accessToken: "old-session-key",
				accessTokenExpiresAt: new Date(Date.now() - 10000),
			}),
		),
	};

	const inputCtx = createInputCtx({
		body: { encryptedData: "test", iv: "test" },
		context: {
			session,
			adapter: mockAdapter,
			authCookies: { sessionToken: { name: "session" } },
		},
	});

	await expect(
		endpoint(inputCtx as Parameters<typeof endpoint>[0]),
	).rejects.toThrow("wx_session_key_expired");
});

test("POST /wx-miniprogram/decrypt-phone - 无 account 时返回 401", async () => {
	const plugin = wxMiniprogram(baseOptions);
	const endpoint = plugin.endpoints.wxDecryptPhone;

	const session = createSession();
	const mockAdapter = {
		findOne: mock(() => Promise.resolve(null)),
	};

	const inputCtx = createInputCtx({
		body: { encryptedData: "test", iv: "test" },
		context: {
			session,
			adapter: mockAdapter,
			authCookies: { sessionToken: { name: "session" } },
		},
	});

	await expect(
		endpoint(inputCtx as Parameters<typeof endpoint>[0]),
	).rejects.toThrow("wx_session_key_expired");
});
