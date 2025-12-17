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
        useBuiltIns: 'usage', // Automatically inject polyfills where needed
        corejs: 3, // Use core-js version 3
        modules: false, // Keep modules as-is since we're bundling with Bun first
        debug: true,
        forceAllTransforms: true, // Force all transforms for maximum compatibility
        // Include all necessary polyfills for iOS 9
        include: [
          // String methods
          'es.string.includes',
          'es.string.starts-with',
          'es.string.ends-with',
          // Array methods
          'es.array.from',
          'es.array.includes',
          // Object methods
          'es.object.assign',
          'es.object.entries',
          'es.object.keys',
          // Promise
          'es.promise',
          // Symbol
          'es.symbol',
          'es.symbol.iterator',
        ],
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
    // Explicitly include optional chaining plugin
    '@babel/plugin-transform-optional-chaining',
    // Include nullish coalescing for completeness
    '@babel/plugin-transform-nullish-coalescing-operator',
  ],
};

