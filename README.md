# better-auth-wx-miniprogram

[English](./README.md) | [中文](./README.zh-CN.md)

[Better Auth](https://better-auth.com) plugin for WeChat Miniprogram (微信小程序) login. Provides silent sign-in via `wx.login()`, profile updates, and phone number decryption — all with zero extra user-facing prompts.

## Features

- **Silent login** — `wx.login()` → `code2session` → anonymous user with zero user friction
- **Profile updates** — nickname & avatar via WeChat's `chooseAvatar` / `nickname` components
- **Phone decryption** — decrypt `getPhoneNumber` encrypted data with stored `session_key`
- **Rate limiting** — built-in rate limits on login (20/min) and phone decryption (10/min)
- **Client plugin** — typed `$fetch`-based client for web/Node.js
- **Miniprogram SDK** — zero-dependency `createWxAuth()` for the miniprogram side

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
import { createWxAuth } from "better-auth-wx-miniprogram/miniprogram";

const auth = createWxAuth({
  baseUrl: "https://your-server.com/api/auth",
});

// Silent sign-in
const { token, user } = await auth.signIn();

// Update profile after user picks avatar/nickname
await auth.updateProfile({ nickName: "Alice", avatarUrl: "https://..." });

// Decrypt phone number from getPhoneNumber button
const { phoneNumber } = await auth.decryptPhone({ encryptedData, iv });

// Sign out
auth.signOut();
```

### Client (web/Node.js with Better Auth client)

```ts
import { wxMiniprogramClient } from "better-auth-wx-miniprogram/client";

const { data } = await authClient.signIn({ code: "wx-login-code" });
// data: { token: string; user: User }
```

## API Endpoints

| Endpoint | Method | Auth | Description |
| --- | --- | --- | --- |
| `/wx-miniprogram/login` | POST | — | Exchange `wx.login()` code for session |
| `/wx-miniprogram/update-profile` | POST | Bearer | Update nickname & avatar |
| `/wx-miniprogram/decrypt-phone` | POST | Bearer | Decrypt phone number from `getPhoneNumber` |

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
