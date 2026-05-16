# better-auth-wx-miniprogram

English | [中文](./README.zh-CN.md)

[Better Auth](https://better-auth.com) plugin for WeChat Miniprogram (微信小程序) login. Provides silent sign-in via `wx.login()`, profile updates, and phone number decryption — all with zero extra user-facing prompts.

## Features

- **Silent login** — `wx.login()` → `code2session` → anonymous user with zero user friction
- **Profile updates** — nickname & avatar via WeChat's `chooseAvatar` / `nickname` components
- **Phone decryption** — decrypt `getPhoneNumber` encrypted data with stored `session_key`
- **Rate limiting** — built-in rate limits on login (20/min) and phone decryption (10/min)
- **Client plugin** — typed Better Auth client actions for miniprogram usage
- **wx-fetch-adapter** — use `wx.request` as Better Auth client's fetch layer

## Installation

```bash
bun add better-auth-wx-miniprogram
```

Requires `better-auth >= 1.0.0` and the [anonymous plugin](https://www.better-auth.com/docs/plugins/anonymous) to be enabled.

## Quick Start

### Server (Better Auth plugin)

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

**Important:** the `anonymous` plugin must be registered **before** `wxMiniprogram`.

### Miniprogram (WeChat app)

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

### Client (web/Node.js with Better Auth client)

```ts
import { wxMiniprogramClient } from "better-auth-wx-miniprogram/client";
import { wxFetchAdapter } from "better-auth-wx-miniprogram/wx-fetch-adapter";

const { data } = await authClient.wxMiniprogram.signIn({ code: "wx-login-code" });
// data: { token: string; user: User }
```

## API Endpoints

| Endpoint                         | Method | Auth   | Description                                |
| -------------------------------- | ------ | ------ | ------------------------------------------ |
| `/wx-miniprogram/login`          | POST   | —      | Exchange `wx.login()` code for session     |
| `/wx-miniprogram/update-profile` | POST   | Bearer | Update nickname & avatar                   |
| `/wx-miniprogram/decrypt-phone`  | POST   | Bearer | Decrypt phone number from `getPhoneNumber` |

## Options

```ts
interface WxMiniprogramOptions {
  appId: string;           // WeChat Miniprogram AppID
  appSecret: string;       // WeChat Miniprogram AppSecret (server-side only)
  storeSessionKey?: boolean; // Store session_key for phone decryption (default: true)
  code2SessionUrl?: string;  // Custom code2Session endpoint (for testing/proxying)
}
```

## How It Works

This plugin relies on Better Auth's `anonymous` plugin for user creation:

1. Miniprogram calls `wx.login()` → gets a temporary `code`
2. Server exchanges `code` for `openid` + `session_key` via WeChat's `jscode2session`
3. **New user:** `anonymous` plugin creates an anonymous user; this plugin links the WeChat `openid` as an account
4. **Returning user:** looks up the existing account by `openid`, creates a new session
5. A session token is returned to the miniprogram and stored in `wx.storage`

Users remain `isAnonymous: true` until they link a real authentication method (email/password, OAuth, etc.) via Better Auth's `linkAccount`.

## License

MIT
