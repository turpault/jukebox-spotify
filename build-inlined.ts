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
  
  // Add polyfills for iOS 9 compatibility before the inlined script
  const polyfillsScript = `  <!-- Polyfills for older browsers (iOS 9) -->
  <script src="https://cdn.jsdelivr.net/npm/core-js@3/bundle.min.js"></script>
  <script>
    // Polyfill for fetch API (core-js doesn't include fetch)
    if (typeof fetch === 'undefined') {
      document.write('<script src="https://cdn.jsdelivr.net/npm/whatwg-fetch@3.6.2/dist/fetch.umd.js"><\\/script>');
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
  
  // Create the inlined version with polyfills and inlined JavaScript
  const inlinedHtml = beforeScript + 
    polyfillsScript +
    "  <!-- Inlined JavaScript bundle for iOS 9 compatibility -->\n" +
    "  <script>\n" +
    js.split("\n").map(line => "    " + line).join("\n") + "\n" +
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

