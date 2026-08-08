import { expect, test, type Page } from "@playwright/test";

const secrets = [
  {
    name: "payments/prod/checkout-api/database-url",
    arn: "arn:database",
    updatedAt: "2026-08-01T00:00:00.000Z",
    tags: {},
  },
  {
    name: "payments/prod/checkout-api/stripe-api-key",
    arn: "arn:stripe",
    tags: {},
  },
  {
    name: "platform/prod/worker/service-config",
    arn: "arn:config",
    tags: {
      "tapioca:encoding": "base64",
      "tapioca:content-type": "application/json",
    },
  },
];

async function mockApi(page: Page): Promise<{ revealCalls: () => number }> {
  let reveals = 0;
  await page.route("**/api/secrets**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        context: { profile: "production", region: "us-east-1" },
        secrets,
      }),
    });
  });
  await page.route("**/api/reveal", async (route) => {
    reveals += 1;
    const request = route.request().postDataJSON() as { path: string };
    const json = request.path.endsWith("service-config");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        json
          ? {
              name: request.path,
              value: "eyJlbmFibGVkIjp0cnVlfQ==",
              decoded: { enabled: true },
              format: "json-base64",
            }
          : { name: request.path, value: "super-secret", format: "text" },
      ),
    });
  });
  return { revealCalls: () => reveals };
}

test("renders the approved three-pane read-only layout without fetching values", async ({ page }) => {
  const api = await mockApi(page);
  await page.goto("/#session-token");

  await expect(page.getByRole("heading", { name: "Tapioca Secrets" })).toBeVisible();
  await expect(page.getByText("production", { exact: true })).toBeVisible();
  await expect(page.getByText("us-east-1", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Domains e ambientes" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Secrets" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Detalhes do secret" })).toBeVisible();
  await expect(page.getByText("••••••••••••••••")).toBeVisible();
  expect(api.revealCalls()).toBe(0);
  await expect(page.getByRole("button", { name: /criar|editar|excluir/i })).toHaveCount(0);
});

test("fetches on reveal, then masks the value after 30 seconds", async ({ page }) => {
  await page.clock.install();
  const api = await mockApi(page);
  await page.goto("/#session-token");
  await page.getByRole("button", { name: "database-url" }).click();
  await page.getByRole("button", { name: "Revelar por 30s" }).click();
  await expect(page.getByText("super-secret", { exact: true })).toBeVisible();
  expect(api.revealCalls()).toBe(1);
  await page.clock.fastForward(30_100);
  await expect(page.getByText("super-secret", { exact: true })).toHaveCount(0);
  await expect(page.getByText("••••••••••••••••")).toBeVisible();
});

test("copies the raw value with a fresh fetch", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const api = await mockApi(page);
  await page.goto("/#session-token");
  await page.getByRole("button", { name: "database-url" }).click();
  await page.getByRole("button", { name: "Copiar" }).click();
  await expect(page.getByText("Secret copiado.")).toBeVisible();
  expect(api.revealCalls()).toBe(1);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("super-secret");
});

test("shows decoded JSON but copies base64 by default", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockApi(page);
  await page.goto("/#session-token");
  await page.getByRole("button", { name: "service-config" }).click();
  await page.getByRole("button", { name: "Revelar por 30s" }).click();
  await expect(page.getByText('"enabled": true', { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Copiar base64" }).click();
  await expect(page.getByText("Secret copiado.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "eyJlbmFibGVkIjp0cnVlfQ==",
  );
});

test("shows the exact aws login recovery command", async ({ page }) => {
  await page.route("**/api/secrets**", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Sessão expirada. Execute: aws login --profile production",
        code: "AUTH_REQUIRED",
      }),
    });
  });
  await page.goto("/#session-token");
  await expect(page.locator("code").getByText("aws login --profile production", { exact: true })).toBeVisible();
});

test("shows actionable recovery when the session expires during reveal", async ({ page }) => {
  await mockApi(page);
  await page.unroute("**/api/reveal");
  await page.route("**/api/reveal", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Sessão expirada. Execute: aws login --profile production",
        code: "AUTH_REQUIRED",
      }),
    });
  });
  await page.goto("/#session-token");
  await page.getByRole("button", { name: "Revelar por 30s" }).click();
  await expect(
    page.locator("code").getByText("aws login --profile production", { exact: true }),
  ).toBeVisible();
});
