# better-auth-wx-miniprogram

[English](./README.md) | [中文](./README.zh-CN.md)

[Better Auth](https://better-auth.com) 微信小程序登录插件。提供基于 `wx.login()` 的静默登录、用户资料更新、手机号解密等功能，全程无需用户额外操作。

## 特性

- **静默登录** — `wx.login()` → `code2session` → 匿名用户，用户无感知
- **资料更新** — 配合微信 `chooseAvatar` / `nickname` 组件更新昵称和头像
- **手机号解密** — 使用存储的 `session_key` 解密 `getPhoneNumber` 返回的加密数据
- **频率限制** — 内置限流：登录 20 次/分钟，手机号解密 10 次/分钟
- **客户端插件** — 面向小程序的 Better Auth 类型安全客户端 action
- **wx-fetch-adapter** — 将 `wx.request` 作为 Better Auth client 的 fetch 层

## 安装

```bash
bun add better-auth-wx-miniprogram
```

需要 `better-auth >= 1.0.0` 且启用 [anonymous 插件](https://www.better-auth.com/docs/plugins/anonymous)。

## 快速开始

### 服务端（Better Auth 插件）

```ts
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { wxMiniprogram } from "better-auth-wx-miniprogram";

export const auth = betterAuth({
  plugins: [
    anonymous({ emailDomainName: "wx.placeholder.invalid" }),
    wxMiniprogram({
      appId: process.env.WX_APP_ID!,
      appSecret: process.env.WX_APP_SECRET!,
    }),
  ],
});
```

**注意：** `anonymous` 插件必须注册在 `wxMiniprogram` **之前**。

### 小程序端（微信小程序）

```js
import { createAuthClient } from "better-auth/client";
import { anonymousClient } from "better-auth/client/plugins";
import { wxMiniprogramClient } from "better-auth-wx-miniprogram/client";
import { wxFetchAdapter } from "better-auth-wx-miniprogram/wx-fetch-adapter";

const authClient = createAuthClient({
  baseURL: "https://your-server.com/api/auth",
  disableDefaultFetchPlugins: true,
  fetchOptions: {
    customFetchImpl: wxFetchAdapter,
    onRequest(context) {
      const token = wx.getStorageSync("__ba_token__");
      if (token) {
        context.options.headers = {
          ...context.options.headers,
          Authorization: `Bearer ${token}`,
        };
      }
    },
  },
  plugins: [anonymousClient(), wxMiniprogramClient()],
});

const code = await new Promise((resolve, reject) =>
  wx.login({ success: (r) => resolve(r.code), fail: reject })
);
const { data } = await authClient.wxMiniprogram.signIn({ code });
wx.setStorageSync("__ba_token__", data.token);

await authClient.wxMiniprogram.updateProfile({
  nickName: "Alice",
  avatarUrl: "https://...",
});

const { data: phone } = await authClient.wxMiniprogram.decryptPhone({
  encryptedData,
  iv,
});
```

### Web/Node.js 客户端

```ts
import { wxMiniprogramClient } from "better-auth-wx-miniprogram/client";
import { wxFetchAdapter } from "better-auth-wx-miniprogram/wx-fetch-adapter";

const { data } = await authClient.wxMiniprogram.signIn({ code: "wx-login-code" });
// data: { token: string; user: User }
```

## API 端点

| 端点 | 方法 | 认证 | 说明 |
| --- | --- | --- | --- |
| `/wx-miniprogram/login` | POST | — | 用 `wx.login()` code 换取 session |
| `/wx-miniprogram/update-profile` | POST | Bearer | 更新昵称和头像 |
| `/wx-miniprogram/decrypt-phone` | POST | Bearer | 解密 `getPhoneNumber` 获取手机号 |

## 配置项

```ts
interface WxMiniprogramOptions {
  appId: string;              // 微信小程序 AppID
  appSecret: string;          // 微信小程序 AppSecret（仅服务端使用）
  storeSessionKey?: boolean;  // 是否存储 session_key 用于手机号解密（默认：true）
  code2SessionUrl?: string;   // 自定义 code2Session 地址（用于测试或代理场景）
}
```

## 工作原理

本插件依赖 Better Auth 的 `anonymous` 插件来创建用户：

1. 小程序调用 `wx.login()` → 获得临时 `code`
2. 服务端通过微信 `jscode2session` 接口用 `code` 换取 `openid` + `session_key`
3. **新用户：** `anonymous` 插件创建匿名用户，本插件将微信 `openid` 关联为 account
4. **老用户：** 根据 `openid` 查找已有 account，创建新 session
5. session token 返回小程序并存入 `wx.storage`

用户将保持 `isAnonymous: true`，直到通过 Better Auth 的 `linkAccount` 绑定真实认证方式（邮箱/密码、OAuth 等）。

## License

MIT
