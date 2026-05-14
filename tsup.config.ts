import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		client: "src/client.ts",
		"wx-fetch-adapter": "src/wx-fetch-adapter.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	minify: true,
	clean: true,
	splitting: false,
});
