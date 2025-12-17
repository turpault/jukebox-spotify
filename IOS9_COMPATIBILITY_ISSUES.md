# iOS 9 Compatibility Issues

This document identifies JavaScript features and APIs used in the client code that may not be supported in iOS 9 Safari (released 2015).

## Critical Issues (Will Break on iOS 9)

### 1. Optional Chaining (`?.`) - ES2020
**Status:** ❌ Not supported in iOS 9
**Locations:**
- `src/JukeboxStateProvider.tsx`: Lines 754, 758, 769, 774, 780
- `src/App.tsx`: Lines 400, 452, 763, 780, 795
- `src/index.tsx`: Lines 100, 101, 120, 122, 123
- `src/ErrorBoundary.tsx`: Line 96
- `src/spotify.ts`: Multiple locations (332, 333, 418, 420, 422, 424, 426, 428, 430, 531, 532, 572, 573, 612, 613, 701, 712, 735, 877, 915)
- `src/Manage.tsx`: Lines 783, 814, 1065, 1076, 1096, 1107, 1127, 1138, 1158
- `src/tracing.ts`: Lines 58, 59, 60, 61, 186

**Solution:** Babel should transpile this, but need to verify `@babel/plugin-proposal-optional-chaining` is configured.

### 2. `Object.entries()` - ES2017
**Status:** ❌ Not supported in iOS 9
**Locations:**
- `src/Manage.tsx`: Lines 907, 926, 945

**Solution:** Need polyfill or replace with `Object.keys()` + `map()`:
```javascript
// Instead of: Object.entries(obj)
Object.keys(obj).map(key => [key, obj[key]])
```

### 3. `fetch()` API - Not natively supported
**Status:** ❌ Not natively supported in iOS 9
**Locations:** Used extensively throughout:
- `src/index.tsx`: Lines 32, 89, 114
- `src/JukeboxStateProvider.tsx`: Multiple locations
- `src/App.tsx`: Multiple locations
- `src/ErrorBoundary.tsx`: Line 36
- `src/spotify.ts`: Multiple locations

**Solution:** Need `whatwg-fetch` polyfill or include in HTML.

### 4. `Promise` - Limited support
**Status:** ⚠️ Limited support in iOS 9
**Locations:** Used extensively (async/await transpiles to Promises)

**Solution:** Need Promise polyfill (core-js or es6-promise).

## Moderate Issues (May Break on iOS 9)

### 5. `String.includes()` - ES6
**Status:** ⚠️ May not be supported in iOS 9 Safari
**Locations:**
- `src/JukeboxStateProvider.tsx`: Lines 415, 416, 417, 418, 428, 430, 723
- `src/App.tsx`: Line 341
- `src/spotify.ts`: Lines 31, 443, 763

**Solution:** Replace with `indexOf() !== -1` or add polyfill.

### 6. `String.startsWith()` - ES6
**Status:** ⚠️ May not be supported in iOS 9 Safari
**Locations:**
- `src/App.tsx`: Line 42
- `src/spotify.ts`: Lines 31, 459, 625
- `src/SpotifyIdsList.tsx`: Line 8

**Solution:** Replace with `indexOf() === 0` or add polyfill.

### 7. `String.endsWith()` - ES6
**Status:** ⚠️ May not be supported in iOS 9 Safari
**Locations:**
- `src/spotify.ts`: Line 247
- `src/Manage.tsx`: Lines 950, 953

**Solution:** Replace with custom function or add polyfill.

### 8. `Array.from()` - ES6
**Status:** ⚠️ May not be supported in iOS 9 Safari
**Locations:**
- `src/librespot-state.ts`: Line 259

**Solution:** Replace with `Array.prototype.slice.call()` or add polyfill.

### 9. `Object.assign()` - ES6
**Status:** ⚠️ May not be supported in iOS 9 Safari
**Locations:**
- `src/App.tsx`: Lines 807, 812, 826, 827, 838, 839, 854, 855, 868, 873

**Solution:** Add polyfill or use object spread (which Babel should transpile).

## Features That Should Be Transpiled by Babel

These should work if Babel is configured correctly:

### 10. Spread Operator (`...`) - ES6
**Status:** ✅ Should be transpiled
**Locations:** Used extensively (90+ locations)

**Verification:** Check Babel output to ensure it's transpiled.

### 11. Template Literals - ES6
**Status:** ✅ Should be transpiled (plugin configured)
**Locations:** Used extensively

**Note:** Already have `@babel/plugin-transform-template-literals` configured.

### 12. Arrow Functions - ES6
**Status:** ✅ Should be transpiled (plugin configured)
**Locations:** Used extensively

**Note:** Already have `@babel/plugin-transform-arrow-functions` configured.

### 13. `const`/`let` - ES6
**Status:** ✅ Should be transpiled
**Locations:** Used extensively

### 14. `async`/`await` - ES2017
**Status:** ✅ Should be transpiled
**Locations:** Used extensively

**Note:** Babel should transpile to Promises + generators.

## Recommended Actions

1. **Add polyfills to HTML:**
   - Include `core-js` or specific polyfills for:
     - `fetch()`
     - `Promise`
     - `Object.assign()`
     - `Array.from()`
     - `String.includes()`, `startsWith()`, `endsWith()`

2. **Verify Babel configuration:**
   - Ensure `@babel/plugin-proposal-optional-chaining` is included
   - Test that optional chaining is actually transpiled

3. **Replace `Object.entries()`:**
   - Replace with `Object.keys()` + `map()` pattern

4. **Add polyfill verification:**
   - Add runtime checks to ensure polyfills are loaded before app starts

5. **Test on iOS 9 device:**
   - Verify all features work after fixes

## Current Babel Configuration Status

✅ Configured:
- `@babel/plugin-transform-arrow-functions`
- `@babel/plugin-transform-template-literals`
- `@babel/plugin-transform-shorthand-properties`
- `@babel/plugin-transform-destructuring`
- `@babel/preset-env` with `forceAllTransforms: true` (should include optional chaining)

❓ Need to verify:
- Optional chaining transpilation (plugin is available but not explicitly listed)
- Spread operator transpilation (should be handled by preset-env)
- Polyfill injection (currently disabled, need to add manually)

⚠️ **Missing from Babel config:**
- `@babel/plugin-transform-optional-chaining` should be explicitly added to plugins array for safety

## Polyfill Recommendations

Add to `public/index.html` before the main script:

```html
<!-- Polyfills for iOS 9 -->
<script src="https://cdn.jsdelivr.net/npm/core-js@3/stable/index.js"></script>
<script src="https://cdn.jsdelivr.net/npm/whatwg-fetch@3.6.2/dist/fetch.umd.js"></script>
```

Or use a more targeted approach with only needed polyfills.

