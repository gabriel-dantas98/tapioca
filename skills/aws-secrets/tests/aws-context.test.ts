import { describe, expect, it } from "vitest";

import { resolveAwsContext } from "../src/aws/context.js";

describe("resolveAwsContext", () => {
  it("uses flags before environment and profile defaults", async () => {
    await expect(
      resolveAwsContext(
        {
          profile: "flag-profile",
          region: "sa-east-1",
          env: { AWS_PROFILE: "env-profile", AWS_REGION: "us-east-1" },
        },
        { loadProfileRegion: async () => "eu-west-1" },
      ),
    ).resolves.toEqual({ profile: "flag-profile", region: "sa-east-1" });
  });

  it("uses environment before profile defaults", async () => {
    await expect(
      resolveAwsContext(
        { env: { AWS_PROFILE: "production", AWS_DEFAULT_REGION: "us-west-2" } },
        { loadProfileRegion: async () => "eu-west-1" },
      ),
    ).resolves.toEqual({ profile: "production", region: "us-west-2" });
  });

  it("loads the selected profile region", async () => {
    let requestedProfile = "";
    const context = await resolveAwsContext(
      { profile: "production", env: {} },
      {
        loadProfileRegion: async (profile) => {
          requestedProfile = profile;
          return "us-east-2";
        },
      },
    );
    expect(requestedProfile).toBe("production");
    expect(context).toEqual({ profile: "production", region: "us-east-2" });
  });

  it("rejects a missing region", async () => {
    await expect(
      resolveAwsContext({ env: {} }, { loadProfileRegion: async () => undefined }),
    ).rejects.toMatchObject({ code: "REGION_REQUIRED" });
  });
});
