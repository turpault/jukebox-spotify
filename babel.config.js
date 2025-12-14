// Babel configuration for iOS 9 compatibility
module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          // Target iOS 9 Safari specifically
          ios: '9.0',
          safari: '9.0',
        },
        useBuiltIns: 'usage',
        corejs: {
          version: 3,
          proposals: false,
        },
        modules: false, // Keep modules as-is since we're bundling
        debug: false,
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

