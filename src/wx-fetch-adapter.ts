import type { FetchEsque } from "@better-fetch/fetch";

/**
 * wx-fetch-adapter
 *
 * Wraps WeChat Miniprogram's wx.request with a Fetch-compatible function for
 * better-fetch customFetchImpl.
 */

type WxRequestMethod =
	| "GET"
	| "POST"
	| "PUT"
	| "DELETE"
	| "PATCH"
	| "HEAD"
	| "OPTIONS";

interface WxRequestSuccessResult {
	data: unknown;
	statusCode: number;
	header?: Record<string, string>;
}

interface WxRequestFailResult {
	errMsg: string;
}

interface WxRequestOptions {
	url: string;
	method: WxRequestMethod;
	data?: unknown;
	header: Record<string, string>;
	success: (result: WxRequestSuccessResult) => void;
	fail: (result: WxRequestFailResult) => void;
}

declare const wx: {
	request(options: WxRequestOptions): void;
};

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
	const defaults: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (!headers) return defaults;

	if (typeof Headers !== "undefined" && headers instanceof Headers) {
		const obj: Record<string, string> = {};
		headers.forEach((value, key) => {
			obj[key] = value;
		});
		return { ...defaults, ...obj };
	}

	if (Array.isArray(headers)) {
		const obj: Record<string, string> = {};
		for (const [key, value] of headers) {
			obj[key] = value;
		}
		return { ...defaults, ...obj };
	}

	return { ...defaults, ...(headers as Record<string, string>) };
}

function normalizeBody(body?: BodyInit | null): unknown {
	if (!body) return undefined;

	if (typeof body === "string") {
		try {
			return JSON.parse(body);
		} catch {
			return body;
		}
	}

	return body;
}

function normalizeResponseHeaders(
	headers: Record<string, string>,
): Record<string, string> {
	const normalized: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		normalized[key] = value;
		normalized[key.toLowerCase()] = value;
	}
	return normalized;
}

function buildResponse(
	body: unknown,
	status: number,
	headers: Record<string, string>,
	url = "",
): Response {
	const normalizedHeaders = normalizeResponseHeaders(headers);
	const bodyStr =
		typeof body === "string" ? body : JSON.stringify(body ?? null);
	const bodyParsed =
		typeof body === "string"
			? (() => {
				try {
					return JSON.parse(body);
				} catch {
					return body;
				}
			})()
			: body;

	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: String(status),
		redirected: false,
		type: "basic" as ResponseType,
		url,
		bodyUsed: false,
		body: null,
		headers: {
			get: (key: string) => normalizedHeaders[key.toLowerCase()] ?? null,
			has: (key: string) => key.toLowerCase() in normalizedHeaders,
			forEach: (cb: (value: string, key: string, parent: Headers) => void) => {
				for (const [key, value] of Object.entries(headers)) {
					cb(value, key, {} as Headers);
				}
			},
			append: () => { },
			delete: () => { },
			set: () => { },
			entries: () => Object.entries(headers)[Symbol.iterator](),
			keys: () => Object.keys(headers)[Symbol.iterator](),
			values: () => Object.values(headers)[Symbol.iterator](),
			[Symbol.iterator]: () => Object.entries(headers)[Symbol.iterator](),
		} as unknown as Headers,
		json: () => Promise.resolve(bodyParsed),
		text: () => Promise.resolve(bodyStr),
		arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
		blob: () => Promise.resolve(new Blob([bodyStr])),
		formData: () => Promise.reject(new Error("formData not supported")),
		clone: () => buildResponse(body, status, headers, url),
	} as Response;
}

export const wxFetchAdapter: FetchEsque = (
	input: string | URL | Request,
	init?: RequestInit,
): Promise<Response> => {
	const url = typeof input === "string" ? input : input.toString();
	const method = (init?.method ?? "GET").toUpperCase() as WxRequestMethod;
	const header = normalizeHeaders(init?.headers);
	const data = normalizeBody(init?.body);

	return new Promise((resolve) => {
		wx.request({
			url,
			method,
			data,
			header,
			success(result) {
				resolve(
					buildResponse(
						result.data,
						result.statusCode,
						result.header ?? {},
						url,
					),
				);
			},
			fail(result) {
				resolve(
					buildResponse(
						{ code: "NETWORK_ERROR", message: result.errMsg },
						0,
						{},
						url,
					),
				);
			},
		});
	});
};
