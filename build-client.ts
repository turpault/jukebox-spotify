// Build script to bundle client code for iOS 9 compatibility
import { build } from "bun";
import { mkdir } from "fs/promises";
import { spawn } from "child_process";
import { promisify } from "util";

const exec = promisify(require("child_process").exec);

async function buildClient() {
  console.log("Building client bundle for iOS 9 compatibility...");
  
  // Ensure dist directory exists
  try {
    await mkdir("./public/dist", { recursive: true });
  } catch (e) {
    // Directory might already exist
  }
  
  // Step 1: Bundle with Bun
  console.log("Step 1: Bundling with Bun...");
  await build({
    entrypoints: ["./src/index.tsx"],
    outdir: "./public/dist",
    target: "browser",
    minify: false, // Don't minify for easier debugging on iOS 9
    sourcemap: false, // We'll add sourcemap after Babel
    format: "iife", // Use IIFE format instead of ES modules for iOS 9 compatibility
    splitting: false,
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
    },
  });
  
  console.log("Bun bundle created at ./public/dist/index.js");
  
  // Step 2: Transpile with Babel to ES5
  console.log("Step 2: Transpiling to ES5 with Babel for iOS 9...");
  try {
    // Use bunx to run babel (works better with Bun)
    // --compact=false ensures readable output (not minified)
    // --retain-lines helps with debugging
    const { stdout, stderr } = await exec(
      `bunx babel ./public/dist/index.js --out-file ./public/dist/index.js --config-file ./babel.config.js --source-maps inline --compact=false --retain-lines`
    );
    if (stderr && !stderr.includes('warning')) {
      console.warn("Babel warnings:", stderr);
    }
    if (stdout) {
      console.log(stdout);
    }
    console.log("Babel transpilation complete!");
  } catch (error: any) {
    console.error("Babel transpilation failed:", error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
  
  console.log("Client bundle built and transpiled successfully!");
  console.log("Bundle location: ./public/dist/index.js");
  console.log("Ready for iOS 9 Safari!");
}

buildClient().catch(console.error);

