import type { Code2SessionResult, WxMiniprogramOptions } from "../types";
import { WxErrors } from "./errors";

/**
 * 调用微信 jscode2session 接口，用临时 code 换取 openid 和 session_key。
 */
export async function code2Session(
	code: string,
	options: Pick<
		WxMiniprogramOptions,
		"appId" | "appSecret" | "code2SessionUrl"
	>,
): Promise<Code2SessionResult> {
	const baseUrl =
		options.code2SessionUrl ?? "https://api.weixin.qq.com/sns/jscode2session";

	const url = new URL(baseUrl);
	url.searchParams.set("appid", options.appId);
	url.searchParams.set("secret", options.appSecret);
	url.searchParams.set("js_code", code);
	url.searchParams.set("grant_type", "authorization_code");

	let data: Record<string, unknown>;

	try {
		const res = await fetch(url.toString());
		data = (await res.json()) as Record<string, unknown>;
	} catch {
		throw WxErrors.WX_API_ERROR("network error");
	}

	if (data.errcode && data.errcode !== 0) {
		const errcode = data.errcode as number;
		const errmsg = (data.errmsg as string) ?? "unknown";

		if (errcode === 40029 || errcode === 40163) {
			throw WxErrors.CODE_INVALID();
		}
		throw WxErrors.WX_API_ERROR(errmsg);
	}

	return {
		openid: data.openid as string,
		session_key: data.session_key as string,
		unionid: data.unionid as string | undefined,
	};
}
