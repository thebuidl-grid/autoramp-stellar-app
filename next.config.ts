import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
	webpack: (config) => {
		// Ensure .mjs files in node_modules are handled correctly
		config.module.rules.push({
			test: /\.mjs$/,
			include: /node_modules/,
			type: "javascript/auto",
		});

		// Alias @floating-ui/utils to its ESM bundle to avoid resolver issues
		config.resolve.alias = {
			...(config.resolve?.alias ?? {}),
			"@floating-ui/utils": path.resolve(
				__dirname,
				"node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs"
			),
		};

		return config;
	},
	// Add an empty turbopack config to avoid the "webpack config with Turbopack" error
	turbopack: {},
};

export default nextConfig;
