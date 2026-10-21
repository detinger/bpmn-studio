import { test as base, expect, type Page } from '@playwright/test';

/** Fails a test when the page logs errors or throws. */
export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    await use(errors);
    expect(errors, 'page errors').toEqual([]);
  }
});

export { expect };

/** Open an example from the library as a new diagram in the modeler. */
export async function openExample(page: Page, name: string) {
  await page.goto('/#/library');
  await page.locator('article', { has: page.getByRole('heading', { name, exact: true }) }).getByRole('button', { name: 'Open copy' }).click();
  await expect(page).toHaveURL(/#\/modeler\/d-/);
  await expect(page.locator('.canvas-area .djs-element').first()).toBeVisible();
}
