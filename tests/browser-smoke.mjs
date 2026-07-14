import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const { createHeaderRule } = createRequire(import.meta.url)("../rules.js");

const extensionPath = resolve(process.env.EXTENSION_PATH ?? "dist/chrome-package");
const echoUrl = process.env.HEADER_ECHO_URL ?? "https://httpbingo.org/headers";
const browserExecutablePath = process.env.BROWSER_EXECUTABLE_PATH;
const echoHost = new URL(echoUrl).hostname;
const testHeaderName = "X-Gimme-Sum-Headers-Test";
const testHeaderValue = "gimme-sum-headers-browser-smoke";
const userDataDir = await mkdtemp(resolve(tmpdir(), "gimme-sum-headers-"));
const rule = createHeaderRule({
  scope: echoHost,
  headers: [{ name: testHeaderName, value: testHeaderValue }],
}, 1);

const manifestPath = join(extensionPath, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), `https://${echoHost}/*`])];
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

try {
  const context = await chromium.launchPersistentContext(userDataDir, {
    ...(browserExecutablePath ? { executablePath: browserExecutablePath } : { channel: "chromium" }),
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const ruleCount = await worker.evaluate(async (value) => {
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingRules.map((item) => item.id),
        addRules: [value],
      });
      return (await chrome.declarativeNetRequest.getDynamicRules()).length;
    }, rule);
    assert.equal(ruleCount, 1);

    const page = await context.newPage();
    await page.goto(echoUrl, { waitUntil: "domcontentloaded" });
    const response = JSON.parse(await page.locator("body").innerText());

    assert.deepEqual(response.headers[testHeaderName], [testHeaderValue]);
    console.log(`Verified ${testHeaderName} through extension ${extensionId}.`);

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`, { waitUntil: "domcontentloaded" });
    await optionsPage.getByRole("button", { name: "Add test site" }).click();
    await assert.doesNotReject(() => optionsPage.locator(".save-bar[data-unsaved='true']").waitFor());
    await optionsPage.getByRole("button", { name: "Save & test headers" }).click();
    await assert.doesNotReject(() => optionsPage.getByText("Saved. Choose Test headers to open the header echo.").waitFor());

    const testPagePromise = context.waitForEvent("page");
    await optionsPage.getByRole("button", { name: "Test headers" }).click();
    const testPage = await testPagePromise;
    await testPage.waitForURL(echoUrl);
    const testResponse = JSON.parse(await testPage.locator("body").innerText());
    assert.deepEqual(testResponse.headers[testHeaderName], [testHeaderValue]);

    await optionsPage.getByRole("button", { name: "Header check" }).click();
    await optionsPage.getByRole("button", { name: "Remove site" }).click();
    await optionsPage.getByRole("button", { name: "Done" }).click();
    const deleteHeaderSet = optionsPage.locator(".header-set-list-delete");
    await assert.doesNotReject(() => deleteHeaderSet.waitFor());
    optionsPage.once("dialog", (dialog) => dialog.accept());
    await deleteHeaderSet.click();
    assert.equal(await optionsPage.locator("#header-set-dialog").evaluate((dialog) => dialog.open), false);
    await assert.doesNotReject(() => optionsPage.getByText("No header sets yet. Create one, then select it for a site.").waitFor());
    console.log("Verified the options page shows unsaved state and handles removal clearly.");
  } finally {
    await context.close();
  }
} finally {
  await rm(userDataDir, { force: true, recursive: true });
}
