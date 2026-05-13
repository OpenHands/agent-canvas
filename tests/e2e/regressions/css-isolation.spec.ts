import { expect, test } from "@playwright/test";

test("scopes standalone styles to the agent server UI shell", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator("[data-agent-server-ui]").first()).toBeVisible();
  const layout = page.getByTestId("root-layout");
  await expect(layout).toBeVisible();

  const insideBackground = await layout.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  const outsideStyles = await page.evaluate(() => {
    const hostProbe = document.createElement("div");
    hostProbe.className = "bg-base text-content-2";
    hostProbe.textContent = "host";
    document.documentElement.appendChild(hostProbe);

    const styles = getComputedStyle(hostProbe);

    return {
      backgroundColor: styles.backgroundColor,
      color: styles.color,
    };
  });

  expect(insideBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(outsideStyles.backgroundColor).not.toBe(insideBackground);
});
