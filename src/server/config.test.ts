import { describe, expect, it } from "vitest";
import { assertSafeExposure } from "./config.ts";

describe("server exposure policy", () => {
  it.each(["127.0.0.1", "localhost", "::1", "[::1]"])(
    "allows loopback host %s without a token",
    (host) => expect(() => assertSafeExposure(host, null)).not.toThrow(),
  );

  it("requires a token for a non-loopback bind", () => {
    expect(() => assertSafeExposure("0.0.0.0", null)).toThrow(/OWNER_TOKEN/);
    expect(() => assertSafeExposure("0.0.0.0", "secret")).not.toThrow();
  });
});
