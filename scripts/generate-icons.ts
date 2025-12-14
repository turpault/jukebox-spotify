import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { promisify } from "util";

// Convert SVG to PNG using ImageMagick
async function convertSvgToPng(svgPath: string, pngPath: string, size: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const convert = spawn("convert", [
      "-background", "none",
      "-resize", `${size}x${size}`,
      svgPath,
      pngPath
    ]);

    convert.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ImageMagick convert failed with code ${code}`));
      }
    });

    convert.on("error", (error) => {
      reject(error);
    });
  });
}

async function generateIcon(size: number, filename: string) {
  // Create a simple SVG icon with a jukebox/vinyl record theme
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2C1810;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#1A0F08;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0D0603;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#D4AF37;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#B8860B;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)" rx="${size * 0.1}"/>
  <!-- Vinyl record circle -->
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.35}" fill="#1a1a1a" stroke="url(#gold)" stroke-width="${size * 0.02}"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.15}" fill="url(#bg)"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.08}" fill="url(#gold)"/>
  <!-- Decorative lines -->
  <line x1="${size / 2}" y1="${size * 0.2}" x2="${size / 2}" y2="${size * 0.35}" stroke="url(#gold)" stroke-width="${size * 0.015}"/>
  <line x1="${size / 2}" y1="${size * 0.65}" x2="${size / 2}" y2="${size * 0.8}" stroke="url(#gold)" stroke-width="${size * 0.015}"/>
  <line x1="${size * 0.2}" y1="${size / 2}" x2="${size * 0.35}" y2="${size / 2}" stroke="url(#gold)" stroke-width="${size * 0.015}"/>
  <line x1="${size * 0.65}" y1="${size / 2}" x2="${size * 0.8}" y2="${size / 2}" stroke="url(#gold)" stroke-width="${size * 0.015}"/>
</svg>`;

  const rootDir = process.cwd();
  const publicDir = join(rootDir, "public");
  const svgPath = join(rootDir, `${filename}.svg`);
  const pngPath = join(publicDir, filename);
  
  // Write SVG to root directory
  await writeFile(svgPath, svg, "utf-8");
  
  // Convert SVG to PNG using ImageMagick
  await convertSvgToPng(svgPath, pngPath, size);
  
  // Clean up SVG file
  await unlink(svgPath);
  
  console.log(`Generated ${filename} (${size}x${size})`);
}

async function generateAllIcons() {
  console.log("Generating iOS home screen icons with ImageMagick...");
  
  try {
    // Generate all required icon sizes
    await generateIcon(180, "apple-touch-icon-180x180.png");
    await generateIcon(152, "apple-touch-icon-152x152.png");
    await generateIcon(120, "apple-touch-icon-120x120.png");
    await generateIcon(180, "apple-touch-icon.png"); // Default fallback
    await generateIcon(192, "icon-192x192.png");
    await generateIcon(512, "icon-512x512.png");
    
    console.log("All icons generated successfully as PNG files!");
  } catch (error) {
    console.error("Error generating icons:", error);
    process.exit(1);
  }
}

generateAllIcons();

