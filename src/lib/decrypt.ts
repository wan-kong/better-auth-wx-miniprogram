import { createDecipheriv } from "crypto";
import { WxErrors } from "./errors";
import type { WxDecryptPhoneResponse } from "../types";

/**
 * 使用 session_key 解密微信加密数据（如手机号）。
 * 算法：AES-128-CBC，PKCS#7 padding
 */
export function decryptWxData(
	encryptedData: string,
	iv: string,
	sessionKey: string,
): Record<string, unknown> {
	try {
		const keyBuffer = Buffer.from(sessionKey, "base64");
		const ivBuffer = Buffer.from(iv, "base64");
		const encryptedBuffer = Buffer.from(encryptedData, "base64");

		const decipher = createDecipheriv("aes-128-cbc", keyBuffer, ivBuffer);
		decipher.setAutoPadding(true);

		const decrypted = Buffer.concat([
			decipher.update(encryptedBuffer),
			decipher.final(),
		]);

		return JSON.parse(decrypted.toString("utf8")) as Record<string, unknown>;
	} catch {
		throw WxErrors.DECRYPT_FAILED();
	}
}

/**
 * 解密手机号，返回结构化数据。
 */
export function decryptPhoneNumber(
	encryptedData: string,
	iv: string,
	sessionKey: string,
): WxDecryptPhoneResponse {
	const data = decryptWxData(encryptedData, iv, sessionKey);

	return {
		phoneNumber: data.phoneNumber as string,
		purePhoneNumber: data.purePhoneNumber as string,
		countryCode: data.countryCode as string,
	};
}
