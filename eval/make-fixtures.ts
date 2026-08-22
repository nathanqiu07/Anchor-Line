import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright-core";

const lettersDirectory = join(process.cwd(), "eval", "letters");
const samplesDirectory = join(process.cwd(), "public", "samples");
// Kept out of eval/letters because run-eval.ts and the fixtures test glob every .json there.
const boxesDirectory = join(process.cwd(), "eval", "letter-boxes");

function browserExecutable(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === "win32") return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return "google-chrome";
}

async function main(): Promise<void> {
  await mkdir(samplesDirectory, { recursive: true });
  await mkdir(boxesDirectory, { recursive: true });
  const htmlFiles = (await readdir(lettersDirectory)).filter((file) => file.endsWith(".html")).sort();
  const browser = await chromium.launch({ executablePath: browserExecutable(), headless: true });

  try {
    for (const htmlFile of htmlFiles) {
      const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 900, height: 1125 } });
      await page.goto(pathToFileURL(join(lettersDirectory, htmlFile)).href, { waitUntil: "networkidle" });
      await page.screenshot({ path: join(samplesDirectory, htmlFile.replace(/\.html$/, ".png")), fullPage: true });

      // Capture where each line of the letter actually sits in the rendered page. This is the
      // only place real geometry exists: the renderer knows, the transcription does not, and
      // no character offset can recover it. Stored as fractions of the full-page box so the
      // UI can overlay them on the screenshot at any display width.
      const boxes = await page.evaluate(() => {
        const pageHeight = document.documentElement.scrollHeight;
        const pageWidth = document.documentElement.scrollWidth;
        const selector = "h1, h2, h3, p, tr, li, blockquote";
        return [...document.querySelectorAll(selector)]
          .map((element) => {
            const text = (element as HTMLElement).innerText ?? "";
            const rect = element.getBoundingClientRect();
            return {
              text,
              top: ((rect.top + window.scrollY) / pageHeight) * 100,
              height: (rect.height / pageHeight) * 100,
              left: ((rect.left + window.scrollX) / pageWidth) * 100,
              width: (rect.width / pageWidth) * 100,
            };
          })
          .filter((box) => box.text.trim().length > 0 && box.height > 0);
      });
      await writeFile(
        join(boxesDirectory, htmlFile.replace(/\.html$/, ".json")),
        `${JSON.stringify(boxes, null, 2)}\n`,
        "utf8",
      );
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
