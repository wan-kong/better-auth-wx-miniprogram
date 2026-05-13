import { test, expect } from "bun:test";
import { createCipheriv, randomBytes } from "crypto";
import { decryptWxData, decryptPhoneNumber } from "../src/lib/decrypt";

function encryptTestData(
	data: Record<string, unknown>,
	sessionKey: string,
	iv: string,
): string {
	const keyBuffer = Buffer.from(sessionKey, "base64");
	const ivBuffer = Buffer.from(iv, "base64");
	const plaintext = JSON.stringify(data);

	const cipher = createCipheriv("aes-128-cbc", keyBuffer, ivBuffer);
	cipher.setAutoPadding(true);

	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);

	return encrypted.toString("base64");
}

test("使用合法 session_key + iv 正确解密", () => {
	// 生成合法的 128-bit key 和 iv
	const sessionKey = Buffer.from(randomBytes(16)).toString("base64");
	const iv = Buffer.from(randomBytes(16)).toString("base64");

	const testData = {
		phoneNumber: "13800138000",
		purePhoneNumber: "13800138000",
		countryCode: "86",
	};
	const encryptedData = encryptTestData(testData, sessionKey, iv);

	const result = decryptWxData(encryptedData, iv, sessionKey);

	expect(result.phoneNumber).toBe("13800138000");
	expect(result.purePhoneNumber).toBe("13800138000");
	expect(result.countryCode).toBe("86");
});

test("session_key 错误时抛出 WX_DECRYPT_FAILED", () => {
	const validKey = Buffer.from(randomBytes(16)).toString("base64");
	const wrongKey = Buffer.from(randomBytes(16)).toString("base64");
	const iv = Buffer.from(randomBytes(16)).toString("base64");

	const testData = { phoneNumber: "13800138000" };
	const encryptedData = encryptTestData(testData, validKey, iv);

	expect(() => decryptWxData(encryptedData, iv, wrongKey)).toThrow(
		"wx_decrypt_failed",
	);
});

test("iv 错误时抛出 WX_DECRYPT_FAILED", () => {
	const sessionKey = Buffer.from(randomBytes(16)).toString("base64");
	const validIv = Buffer.from(randomBytes(16)).toString("base64");
	const wrongIv = Buffer.from(randomBytes(16)).toString("base64");

	const testData = { phoneNumber: "13800138000" };
	const encryptedData = encryptTestData(testData, sessionKey, validIv);

	expect(() => decryptWxData(encryptedData, wrongIv, sessionKey)).toThrow(
		"wx_decrypt_failed",
	);
});

test("encryptedData 格式错误时抛出 WX_DECRYPT_FAILED", () => {
	const sessionKey = Buffer.from(randomBytes(16)).toString("base64");
	const iv = Buffer.from(randomBytes(16)).toString("base64");

	expect(() => decryptWxData("not-valid-base64!!!", iv, sessionKey)).toThrow(
		"wx_decrypt_failed",
	);
});

test("encryptedData 内容不是合法 JSON 时抛出 WX_DECRYPT_FAILED", () => {
	const sessionKey = Buffer.from(randomBytes(16)).toString("base64");
	const iv = Buffer.from(randomBytes(16)).toString("base64");

	// 加密一段非 JSON 数据
	const keyBuffer = Buffer.from(sessionKey, "base64");
	const ivBuffer = Buffer.from(iv, "base64");
	const cipher = createCipheriv("aes-128-cbc", keyBuffer, ivBuffer);
	cipher.setAutoPadding(true);
	const encrypted = Buffer.concat([cipher.update("not json"), cipher.final()]);

	expect(() =>
		decryptWxData(encrypted.toString("base64"), iv, sessionKey),
	).toThrow("wx_decrypt_failed");
});

test("decryptPhoneNumber 返回结构包含 phoneNumber、purePhoneNumber、countryCode", () => {
	const sessionKey = Buffer.from(randomBytes(16)).toString("base64");
	const iv = Buffer.from(randomBytes(16)).toString("base64");

	const testData = {
		phoneNumber: "+8613800138000",
		purePhoneNumber: "13800138000",
		countryCode: "86",
	};
	const encryptedData = encryptTestData(testData, sessionKey, iv);

	const result = decryptPhoneNumber(encryptedData, iv, sessionKey);

	expect(result.phoneNumber).toBe("+8613800138000");
	expect(result.purePhoneNumber).toBe("13800138000");
	expect(result.countryCode).toBe("86");
});
