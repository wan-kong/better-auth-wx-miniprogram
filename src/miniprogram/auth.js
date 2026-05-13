/**
 * better-auth-wx-miniprogram/miniprogram
 *
 * 微信小程序端工具函数。
 *
 * 使用方式：
 *   import { createWxAuth } from "./utils/wx-auth";
 *   const auth = createWxAuth({ baseUrl: "https://your-server.com/api/auth" });
 *   const { token, user } = await auth.signIn();
 */

const STORAGE_KEY = "__ba_wx_token__";

/**
 * 创建小程序端 auth 实例。
 *
 * @param {object} config
 * @param {string} config.baseUrl - Better Auth 服务端基础 URL
 *                                  例如 "https://api.example.com/api/auth"
 */
export function createWxAuth(config) {
	const { baseUrl } = config;

	/**
	 * 封装 wx.request 为 Promise，自动带上 token。
	 * 收到 401 时清除本地 token（session 已过期）。
	 */
	function request(path, options = {}) {
		const token = wx.getStorageSync(STORAGE_KEY);

		return new Promise((resolve, reject) => {
			wx.request({
				url: `${baseUrl}${path}`,
				method: options.method ?? "GET",
				data: options.data,
				header: {
					"Content-Type": "application/json",
					...(token ? { Authorization: `Bearer ${token}` } : {}),
					...options.header,
				},
				success: (res) => {
					if (res.statusCode >= 200 && res.statusCode < 300) {
						resolve(res.data);
					} else {
						// session 过期，清除本地 token
						if (res.statusCode === 401) {
							wx.removeStorageSync(STORAGE_KEY);
						}
						const code = res.data?.code ?? `HTTP_${res.statusCode}`;
						reject(
							Object.assign(
								new Error(res.data?.message ?? `HTTP ${res.statusCode}`),
								{ code },
							),
						);
					}
				},
				fail: reject,
			});
		});
	}

	return {
		/**
		 * 微信一键静默登录。
		 *
		 * 自动调用 wx.login() 获取 code，发给服务端完成登录。
		 * 新用户由服务端通过 anonymous plugin 建立匿名身份（isAnonymous: true），
		 * 对小程序端完全透明，无需任何额外处理。
		 * 登录成功后 token 自动存入 wx.storage。
		 *
		 * @returns {Promise<{ token: string, user: object }>}
		 */
		async signIn() {
			const code = await new Promise((resolve, reject) => {
				wx.login({
					success: (res) => resolve(res.code),
					fail: reject,
				});
			});

			const result = await request("/wx-miniprogram/login", {
				method: "POST",
				data: { code },
			});

			wx.setStorageSync(STORAGE_KEY, result.token);
			return result;
		},

		/**
		 * 更新用户昵称和头像。
		 *
		 * 配合微信头像昵称填写组件使用：
		 *   <button open-type="chooseAvatar" bindchooseavatar="onChooseAvatar">
		 *   <input type="nickname" bindinput="onInputNickname">
		 *
		 * 注意：调用此方法不会改变 user.isAnonymous 状态。
		 * isAnonymous 只有在绑定真实认证方式（手机号/邮箱）后才变为 false。
		 *
		 * @param {{ nickName?: string, avatarUrl?: string }} profile
		 */
		async updateProfile(profile) {
			return request("/wx-miniprogram/update-profile", {
				method: "POST",
				data: profile,
			});
		},

		/**
		 * 解密并获取手机号。
		 *
		 * 配合 getPhoneNumber 按钮使用：
		 *   <button open-type="getPhoneNumber" bindgetphonenumber="onGetPhone">
		 *
		 * session_key 约 2 小时过期。若捕获到 WX_SESSION_KEY_EXPIRED 错误，
		 * 需重新调用 signIn() 刷新后让用户再次点击。
		 *
		 * 小程序页面示例：
		 *   Page({
		 *     async onGetPhone(e) {
		 *       const { encryptedData, iv } = e.detail;
		 *       try {
		 *         const { phoneNumber } = await auth.decryptPhone({ encryptedData, iv });
		 *         console.log(phoneNumber);
		 *       } catch (err) {
		 *         if (err.code === "WX_SESSION_KEY_EXPIRED") {
		 *           await auth.signIn();
		 *           wx.showToast({ title: "请再次点击获取手机号", icon: "none" });
		 *         }
		 *       }
		 *     }
		 *   });
		 *
		 * @param {{ encryptedData: string, iv: string }} data
		 * @returns {Promise<{ phoneNumber: string, purePhoneNumber: string, countryCode: string }>}
		 */
		async decryptPhone(data) {
			return request("/wx-miniprogram/decrypt-phone", {
				method: "POST",
				data,
			});
		},

		/**
		 * 退出登录，清除本地 token。
		 */
		signOut() {
			wx.removeStorageSync(STORAGE_KEY);
		},

		/**
		 * 获取本地存储的 token。
		 * @returns {string | null}
		 */
		getToken() {
			return wx.getStorageSync(STORAGE_KEY) || null;
		},

		/**
		 * 判断本地是否有 token（不验证服务端 session 有效性）。
		 * 关键操作请以服务端返回的 401 为准。
		 * @returns {boolean}
		 */
		isLoggedIn() {
			return !!wx.getStorageSync(STORAGE_KEY);
		},
	};
}
