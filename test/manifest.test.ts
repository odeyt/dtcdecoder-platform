import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

// Native Next.js metadata-route (served at /manifest.webmanifest) — pure
// function, safe to call directly. Covers the PWA acceptance criteria: name,
// short_name, start_url, standalone display, and both required icon sizes.
describe("app manifest", () => {
  const result = manifest();

  it("has the expected name and short_name", () => {
    expect(result.name).toBe("DTCDecoder");
    expect(result.short_name).toBe("DTCDecoder");
  });

  it("has start_url and standalone display", () => {
    expect(result.start_url).toBe("/");
    expect(result.display).toBe("standalone");
  });

  it("includes a 192x192 and a 512x512 png icon", () => {
    const icon192 = result.icons?.find((i) => i.sizes === "192x192");
    const icon512 = result.icons?.find((i) => i.sizes === "512x512");
    expect(icon192).toMatchObject({ src: "/icons/icon-192.png", type: "image/png" });
    expect(icon512).toMatchObject({ src: "/icons/icon-512.png", type: "image/png" });
  });

  it("uses real brand colors, not placeholders", () => {
    expect(result.background_color).toBe("#08080a");
    expect(result.theme_color).toBe("#08080a");
  });
});
