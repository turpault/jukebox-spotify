// Build script to bundle client code for iOS 9 compatibility
import { build } from "bun";
import { mkdir } from "fs/promises";

async function buildClient() {
  console.log("Building client bundle for iOS 9 compatibility...");
  
  // Ensure dist directory exists
  try {
    await mkdir("./public/dist", { recursive: true });
  } catch (e) {
    // Directory might already exist
  }
  
  await build({
    entrypoints: ["./src/index.tsx"],
    outdir: "./public/dist",
    target: "browser",
    minify: false, // Don't minify for easier debugging on iOS 9
    sourcemap: "inline",
    format: "iife", // Use IIFE format instead of ES modules for iOS 9 compatibility
    splitting: false,
    // Target ES5 for iOS 9 compatibility
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
    },
  });
  
  console.log("Client bundle built successfully!");
  console.log("Bundle location: ./public/dist/index.js");
}

buildClient().catch(console.error);

