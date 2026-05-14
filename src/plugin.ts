import type { BetterAuthPlugin } from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import * as z from "zod";
import { code2Session } from "./lib/code2session";
import { decryptPhoneNumber } from "./lib/decrypt";
import { WxErrors } from "./lib/errors";
import type { WxMiniprogramOptions } from "./types";

const PROVIDER_ID = "wx-miniprogram" as const;

/**
 * 微信小程序 Better Auth 插件（Server Side）
 *
 * 前置要求：
 *   必须同时在 auth 配置中启用 Better Auth 官方 anonymous plugin，
 *   且 anonymous plugin 需在本插件之前注册。
 *
 * 示例配置：
 *   import { anonymous } from "better-auth/plugins";
 *   import { wxMiniprogram } from "better-auth-wx-miniprogram";
 *
 *   betterAuth({
 *     plugins: [
 *       anonymous({ emailDomainName: "wx.placeholder.invalid" }),
 *       wxMiniprogram({ appId: "...", appSecret: "..." }),
 *     ]
 *   })
 *
 * Account 表字段映射（复用内置表，无需额外 schema）：
 *   accountId            ← openid
 *   idToken              ← unionid（可为空）
 *   accessToken          ← session_key（可选存储）
 *   accessTokenExpiresAt ← session_key 过期时间
 */
export function wxMiniprogram(options: WxMiniprogramOptions) {
	const opts = {
		storeSessionKey: true,
		...options,
	};

	return {
		id: PROVIDER_ID,

		// ✅ 不需要扩展 schema，新用户创建完全交给 anonymous plugin

		endpoints: {
			/**
			 * POST /api/auth/wx-miniprogram/login
			 *
			 * 接收小程序 wx.login() 返回的临时 code，完成登录流程。
			 *
			 * Request body:
			 *   { code: string }
			 *
			 * Response:
			 *   { token: string, user: User }
			 *
			 * 流程（新用户）：
			 *   1. code → code2Session → openid + session_key
			 *   2. 按 providerId + accountId 查找 account → 不存在
			 *   3. 调用 anonymous plugin 内部方法建立匿名 user（isAnonymous: true）
			 *   4. 将 openid 写入 account 表，关联该匿名 user
			 *   5. 返回 anonymous plugin 建立的 session token
			 *
			 * 流程（老用户）：
			 *   1. code → code2Session → openid + session_key
			 *   2. 按 providerId + accountId 查找 account → 存在
			 *   3. 更新 session_key
			 *   4. 建立新 session，返回 token
			 */
			wxLogin: createAuthEndpoint(
				"/wx-miniprogram/login",
				{
					method: "POST",
					body: z.object({
						code: z.string().min(1, "code is required"),
					}),
					metadata: {
						openapi: {
							summary: "WeChat Miniprogram Login",
							tags: ["wx-miniprogram"],
						},
					},
				},
				async (ctx) => {
					const { code } = ctx.body;

					// Step 1: 换取 openid + session_key
					const { openid, unionid, session_key } = await code2Session(
						code,
						opts,
					);

					// Step 2: 查找已有 account
					const existingAccount = await ctx.context.adapter.findOne({
						model: "account",
						where: [
							{ field: "providerId", value: PROVIDER_ID },
							{ field: "accountId", value: openid },
						],
					});

					let userId: string;

					if (existingAccount) {
						// ── 老用户路径 ──────────────────────────────────────────
						const acc = existingAccount as Record<string, unknown>;
						userId = acc.userId as string;

						await ctx.context.adapter.update({
							model: "account",
							where: [{ field: "id", value: acc.id as string }],
							update: {
								...(opts.storeSessionKey && {
									accessToken: session_key,
									accessTokenExpiresAt: new Date(Date.now() + 7200_000),
								}),
								...(unionid && { idToken: unionid }),
							},
						});

						// 建立新 session
						const session =
							await ctx.context.internalAdapter.createSession(userId);
						const user = await ctx.context.adapter.findOne({
							model: "user",
							where: [{ field: "id", value: userId }],
						});
						return ctx.json({ token: session.token, user });
					} else {
						// ── 新用户路径 ──────────────────────────────────────────
						// 确认 anonymous plugin 已配置
						const internalAdapter = ctx.context
							.internalAdapter as unknown as Record<string, unknown>;
						if (typeof internalAdapter.signInAnonymous !== "function") {
							throw WxErrors.ANONYMOUS_PLUGIN_MISSING();
						}

						// 通过 anonymous plugin 建立匿名用户
						// anonymous plugin 负责：生成占位 email、创建 user、建立 session
						const anonResult = (await internalAdapter.signInAnonymous(
							ctx.request,
						)) as {
							user: { id: string };
							session: { token: string };
						};
						userId = anonResult.user.id;

						// 将微信 account 关联到这个匿名用户
						await ctx.context.adapter.create({
							model: "account",
							data: {
								userId,
								providerId: PROVIDER_ID,
								accountId: openid,
								idToken: unionid ?? null,
								accessToken: opts.storeSessionKey ? session_key : null,
								accessTokenExpiresAt: opts.storeSessionKey
									? new Date(Date.now() + 7200_000)
									: null,
							},
						});

						// 复用 anonymous plugin 已建立的 session
						return ctx.json({
							token: anonResult.session.token,
							user: anonResult.user,
						});
					}
				},
			),

			/**
			 * POST /api/auth/wx-miniprogram/update-profile
			 *
			 * 更新用户昵称和头像（需登录态）。
			 *
			 * 微信新规：用户信息须通过头像昵称填写能力获取，不在登录时直接返回。
			 *
			 * 注意：调用此端点不会改变 user.isAnonymous 状态。
			 * isAnonymous 只有在通过 Better Auth linkAccount 绑定真实认证方式后才变为 false。
			 *
			 * Request headers:
			 *   Authorization: Bearer <token>
			 *
			 * Request body:
			 *   { nickName?: string, avatarUrl?: string }
			 */
			wxUpdateProfile: createAuthEndpoint(
				"/wx-miniprogram/update-profile",
				{
					method: "POST",
					use: [sessionMiddleware],
					body: z.object({
						nickName: z.string().max(64).optional(),
						avatarUrl: z.string().url().optional(),
					}),
				},
				async (ctx) => {
					const { nickName, avatarUrl } = ctx.body;
					const userId = ctx.context.session.user.id;

					const updateData: Record<string, string> = {};
					if (nickName !== undefined) updateData.name = nickName;
					if (avatarUrl !== undefined) updateData.image = avatarUrl;

					if (Object.keys(updateData).length === 0) {
						return ctx.json({ success: true });
					}

					await ctx.context.adapter.update({
						model: "user",
						where: [{ field: "id", value: userId }],
						update: updateData,
					});

					return ctx.json({ success: true });
				},
			),

			/**
			 * POST /api/auth/wx-miniprogram/decrypt-phone
			 *
			 * 解密手机号（需登录态 + storeSessionKey: true）。
			 *
			 * 前置条件：
			 *   - 小程序端使用 <button open-type="getPhoneNumber"> 获得 encryptedData 和 iv
			 *   - 服务端已存储 session_key（storeSessionKey: true）
			 *   - session_key 未过期（微信约 2 小时有效）
			 *
			 * 若 session_key 已过期（返回 WX_SESSION_KEY_EXPIRED），
			 * 需引导用户重新调用 wx.login() 刷新后再试。
			 *
			 * Request headers:
			 *   Authorization: Bearer <token>
			 *
			 * Request body:
			 *   { encryptedData: string, iv: string }
			 *
			 * Response:
			 *   { phoneNumber, purePhoneNumber, countryCode }
			 */
			wxDecryptPhone: createAuthEndpoint(
				"/wx-miniprogram/decrypt-phone",
				{
					method: "POST",
					use: [sessionMiddleware],
					body: z.object({
						encryptedData: z.string().min(1),
						iv: z.string().min(1),
					}),
				},
				async (ctx) => {
					if (!opts.storeSessionKey) {
						throw new APIError("BAD_REQUEST", {
							message: "storeSessionKey is disabled",
						});
					}

					const userId = ctx.context.session.user.id;

					const account = await ctx.context.adapter.findOne({
						model: "account",
						where: [
							{ field: "providerId", value: PROVIDER_ID },
							{ field: "userId", value: userId },
						],
					});

					const acc = account as Record<string, unknown> | null;

					if (!acc?.accessToken) {
						throw WxErrors.SESSION_KEY_EXPIRED();
					}

					if (
						acc.accessTokenExpiresAt &&
						new Date(acc.accessTokenExpiresAt as string) < new Date()
					) {
						throw WxErrors.SESSION_KEY_EXPIRED();
					}

					const result = decryptPhoneNumber(
						ctx.body.encryptedData,
						ctx.body.iv,
						acc.accessToken as string,
					);

					return ctx.json(result);
				},
			),
		},

		rateLimit: [
			{
				pathMatcher: (path: string) => path === "/wx-miniprogram/login",
				max: 20,
				window: 60,
			},
			{
				pathMatcher: (path: string) => path === "/wx-miniprogram/decrypt-phone",
				max: 10,
				window: 60,
			},
		],
	} satisfies BetterAuthPlugin;
}
