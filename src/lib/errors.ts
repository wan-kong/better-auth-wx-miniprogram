import { APIError } from "better-auth/api";

export const WxErrors = {
	CODE_INVALID: () =>
		new APIError("UNAUTHORIZED", {
			message: "wx_code_invalid",
			code: "WX_CODE_INVALID",
		}),

	SESSION_KEY_EXPIRED: () =>
		new APIError("UNAUTHORIZED", {
			message: "wx_session_key_expired",
			code: "WX_SESSION_KEY_EXPIRED",
		}),

	DECRYPT_FAILED: () =>
		new APIError("BAD_REQUEST", {
			message: "wx_decrypt_failed",
			code: "WX_DECRYPT_FAILED",
		}),

	WX_API_ERROR: (errmsg: string) =>
		new APIError("BAD_GATEWAY", {
			message: `wx_api_error: ${errmsg}`,
			code: "WX_API_ERROR",
		}),

	ANONYMOUS_PLUGIN_MISSING: () =>
		new APIError("INTERNAL_SERVER_ERROR", {
			message: "anonymous plugin is required but not configured",
			code: "WX_ANONYMOUS_PLUGIN_MISSING",
		}),
} as const;
