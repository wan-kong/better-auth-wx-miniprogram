import type { BetterAuthClientPlugin } from "better-auth/client";
import type { BetterFetchOption } from "@better-fetch/fetch";
import type { wxMiniprogram } from "./plugin";
import type { WxLoginResponse, WxDecryptPhoneResponse } from "./types";

/**
 * 微信小程序 Better Auth Client Plugin
 *
 * 用于 Web/Node 端调用插件端点。
 * 小程序端请使用 better-auth-wx-miniprogram/miniprogram 工具函数。
 */
export function wxMiniprogramClient() {
	return {
		id: "wx-miniprogram",

		$InferServerPlugin: {} as ReturnType<typeof wxMiniprogram>,

		getActions: ($fetch: Function) => ({
			signIn: async (
				data: { code: string },
				fetchOptions?: BetterFetchOption,
			): Promise<{ data: WxLoginResponse | null; error: Error | null }> => {
				return $fetch("/wx-miniprogram/login", {
					method: "POST",
					body: data,
					...fetchOptions,
				});
			},

			updateProfile: async (
				data: { nickName?: string; avatarUrl?: string },
				fetchOptions?: BetterFetchOption,
			) => {
				return $fetch("/wx-miniprogram/update-profile", {
					method: "POST",
					body: data,
					...fetchOptions,
				});
			},

			decryptPhone: async (
				data: { encryptedData: string; iv: string },
				fetchOptions?: BetterFetchOption,
			): Promise<{
				data: WxDecryptPhoneResponse | null;
				error: Error | null;
			}> => {
				return $fetch("/wx-miniprogram/decrypt-phone", {
					method: "POST",
					body: data,
					...fetchOptions,
				});
			},
		}),
	} satisfies BetterAuthClientPlugin;
}
