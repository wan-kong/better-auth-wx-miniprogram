export interface WxMiniprogramOptions {
	/**
	 * 微信小程序 AppID
	 */
	appId: string;

	/**
	 * 微信小程序 AppSecret（仅服务端使用，不得泄露）
	 */
	appSecret: string;

	/**
	 * 是否在 account 表中持久化 session_key。
	 * 开启后可用于后续解密手机号等敏感数据。
	 * 默认：true
	 */
	storeSessionKey?: boolean;

	/**
	 * 自定义 code2Session 请求 URL。
	 * 用于测试或需要代理的场景。
	 */
	code2SessionUrl?: string;
}

export interface Code2SessionResult {
	openid: string;
	session_key: string;
	unionid?: string;
}

export interface WxLoginResponse {
	token: string;
	user: {
		id: string;
		name: string | null;
		email: string | null;
		image: string | null;
		createdAt: Date;
	};
}

export interface WxDecryptPhoneResponse {
	phoneNumber: string;
	purePhoneNumber: string;
	countryCode: string;
}
