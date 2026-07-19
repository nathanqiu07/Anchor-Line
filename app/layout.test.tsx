import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import RootLayout from "./layout";

describe("RootLayout", () => {
  test("opts into smooth scroll handling for the document element", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <main>Anchor Lines</main>
      </RootLayout>,
    );

    expect(html).toMatch(/<html[^>]*data-scroll-behavior="smooth"/);
  });
});
