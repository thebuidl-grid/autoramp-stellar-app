import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use webpack instead of Turbopack to properly handle exclusions
  // Turbopack doesn't support webpack plugins needed to exclude problematic files
  webpack: (config, { webpack, isServer }) => {
    // Ignore problematic files from thread-stream package
    // These are test files and dev dependencies that shouldn't be bundled
    config.plugins = config.plugins || [];
    
    // Ignore test directory and problematic file types
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/test/,
        contextRegExp: /thread-stream$/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /\.(md|txt|zip|sh|LICENSE)$/,
        contextRegExp: /thread-stream$/,
      }),
      // Ignore test-only dependencies
      new webpack.IgnorePlugin({
        checkResource(resource: string) {
          const testDeps = ['tap', 'tape', 'desm', 'fastbench', 'why-is-node-running', 'pino-elasticsearch'];
          return testDeps.some(dep => resource.includes(dep));
        },
      })
    );

    // Set aliases for test-only dependencies and optional dependencies to false (webpack will ignore them)
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Test-only dependencies
      'tap': false,
      'tape': false,
      'desm': false,
      'fastbench': false,
      'why-is-node-running': false,
      'pino-elasticsearch': false,
      // Optional peer dependencies
      'pino-pretty': false,
      '@react-native-async-storage/async-storage': false,
    };

    return config;
  },
};

export default nextConfig;
