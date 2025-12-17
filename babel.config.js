// Babel configuration for iOS 9 compatibility
module.exports = {
  // Disable minification and keep code readable
  compact: false,
  minified: false,
  retainLines: true,
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          // Target iOS 9 Safari specifically
          ios: '9.0',
          safari: '9.0',
        },
        useBuiltIns: false, // Don't auto-inject polyfills (we'll include core-js manually in HTML)
        modules: false, // Keep modules as-is since we're bundling with Bun first
        debug: true,
        forceAllTransforms: true, // Force all transforms for maximum compatibility
        // Explicitly disable features that iOS 9 doesn't support
        exclude: [],
      },
    ],
    [
      '@babel/preset-react',
      {
        runtime: 'classic', // Use classic runtime for better iOS 9 compatibility
      },
    ],
    '@babel/preset-typescript',
  ],
  plugins: [
    // Additional plugins for better ES5 compatibility
    '@babel/plugin-transform-arrow-functions',
    '@babel/plugin-transform-template-literals',
    '@babel/plugin-transform-shorthand-properties',
    '@babel/plugin-transform-destructuring',
  ],
};

