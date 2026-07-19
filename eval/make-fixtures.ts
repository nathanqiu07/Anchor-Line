import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright-core";

const lettersDirectory = join(process.cwd(), "eval", "letters");
const samplesDirectory = join(process.cwd(), "public", "samples");

function browserExecutable(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === "win32") return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return "google-chrome";
}

async function main(): Promise<void> {
  await mkdir(samplesDirectory, { recursive: true });
  const htmlFiles = (await readdir(lettersDirectory)).filter((file) => file.endsWith(".html")).sort();
  const browser = await chromium.launch({ executablePath: browserExecutable(), headless: true });

  try {
    for (const htmlFile of htmlFiles) {
      const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 900, height: 1125 } });
      await page.goto(pathToFileURL(join(lettersDirectory, htmlFile)).href, { waitUntil: "networkidle" });
      await page.screenshot({ path: join(samplesDirectory, htmlFile.replace(/\.html$/, ".png")), fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
