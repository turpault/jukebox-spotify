// Build script to create an inlined HTML file with all JavaScript embedded
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

async function buildInlined() {
  console.log("Building inlined HTML file for /app route...");
  
  // Read the base HTML file
  const htmlPath = join(process.cwd(), "public", "index.html");
  if (!existsSync(htmlPath)) {
    throw new Error(`HTML file not found: ${htmlPath}`);
  }
  
  let html = readFileSync(htmlPath, "utf-8");
  
  // Read the bundled JavaScript
  const jsPath = join(process.cwd(), "public", "dist", "index.js");
  if (!existsSync(jsPath)) {
    throw new Error(`JavaScript bundle not found: ${jsPath}. Please run 'bun run build:client' first.`);
  }
  
  const js = readFileSync(jsPath, "utf-8");
  
  // Add minimal polyfills for iOS 9 compatibility before the inlined script
  // Note: Most polyfills should be in the bundle, but we add basic ones as fallback
  const polyfillsScript = `  <!-- Polyfills for older browsers (iOS 9) -->
  <script>
    // Basic polyfills that might be needed
    if (typeof Promise === 'undefined') {
      // Load Promise polyfill if needed
      var promiseScript = document.createElement('script');
      promiseScript.src = 'https://cdn.jsdelivr.net/npm/es6-promise@4/dist/es6-promise.auto.min.js';
      document.head.appendChild(promiseScript);
    }
    // Polyfill for fetch API
    if (typeof fetch === 'undefined') {
      var fetchScript = document.createElement('script');
      fetchScript.src = 'https://cdn.jsdelivr.net/npm/whatwg-fetch@3.6.2/dist/fetch.umd.js';
      document.head.appendChild(fetchScript);
    }
    // Polyfill for Object.assign
    if (typeof Object.assign !== 'function') {
      Object.assign = function (target) {
        if (target == null) {
          throw new TypeError('Cannot convert undefined or null to object');
        }
        var to = Object(target);
        for (var index = 1; index < arguments.length; index++) {
          var nextSource = arguments[index];
          if (nextSource != null) {
            for (var nextKey in nextSource) {
              if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                to[nextKey] = nextSource[nextKey];
              }
            }
          }
        }
        return to;
      };
    }
    // Polyfill for String.includes
    if (!String.prototype.includes) {
      String.prototype.includes = function(search, start) {
        'use strict';
        if (typeof start !== 'number') {
          start = 0;
        }
        if (start + search.length > this.length) {
          return false;
        } else {
          return this.indexOf(search, start) !== -1;
        }
      };
    }
    // Polyfill for String.startsWith
    if (!String.prototype.startsWith) {
      String.prototype.startsWith = function(searchString, position) {
        position = position || 0;
        return this.substr(position, searchString.length) === searchString;
      };
    }
    // Polyfill for String.endsWith
    if (!String.prototype.endsWith) {
      String.prototype.endsWith = function(searchString, length) {
        if (length === undefined || length > this.length) {
          length = this.length;
        }
        return this.substring(length - searchString.length, length) === searchString;
      };
    }
    // Polyfill for Array.from
    if (!Array.from) {
      Array.from = function(arrayLike) {
        return Array.prototype.slice.call(arrayLike);
      };
    }
    // Polyfill for Object.entries
    if (!Object.entries) {
      Object.entries = function(obj) {
        var ownProps = Object.keys(obj);
        var i = ownProps.length;
        var resArray = new Array(i);
        while (i--) {
          resArray[i] = [ownProps[i], obj[ownProps[i]]];
        }
        return resArray;
      };
    }
  </script>
`;

  // Find the script tag and replace it with inlined JavaScript
  const scriptTagRegex = /<script[^>]*src="[^"]*"[^>]*><\/script>/;
  const scriptMatch = html.match(scriptTagRegex);
  if (!scriptMatch) {
    throw new Error("Could not find script tag in HTML");
  }
  
  const scriptIndex = html.indexOf(scriptMatch[0]);
  const beforeScript = html.substring(0, scriptIndex);
  const afterScript = html.substring(scriptIndex + scriptMatch[0].length);
  
  // Escape </script> sequences in JavaScript to prevent premature script tag closure
  const escapedJs = js.replace(/<\/script>/gi, '<\\/script>');
  
  // Create the inlined version with polyfills and inlined JavaScript
  // Don't split by newlines since the bundle is minified - just inline it directly
  const inlinedHtml = beforeScript + 
    polyfillsScript +
    "  <!-- Inlined JavaScript bundle for iOS 9 compatibility -->\n" +
    "  <script>\n" +
    escapedJs + "\n" +
    "  </script>\n" +
    afterScript;
  
  // Write the inlined HTML file
  const outputPath = join(process.cwd(), "public", "app.html");
  writeFileSync(outputPath, inlinedHtml, "utf-8");
  
  console.log(`Inlined HTML file created at: ${outputPath}`);
  console.log(`JavaScript bundle size: ${(js.length / 1024).toFixed(2)} KB`);
  console.log(`Total HTML size: ${(inlinedHtml.length / 1024).toFixed(2)} KB`);
}

buildInlined().catch((error) => {
  console.error("Error building inlined HTML:", error);
  process.exit(1);
});

