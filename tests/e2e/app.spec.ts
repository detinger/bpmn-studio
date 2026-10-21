import { test, expect } from './fixtures';

const PAGES = [
  { path: '/#/', heading: /Understand processes/ },
  { path: '/#/learn', heading: 'Learn BPMN step by step' },
  { path: '/#/learn/xor-gateway', heading: 'Exclusive gateways' },
  { path: '/#/encyclopedia', heading: 'All BPMN elements' },
  { path: '/#/encyclopedia/parallel-gateway', heading: 'Parallel Gateway (AND)' },
  { path: '/#/challenges', heading: 'Solve process problems' },
  { path: '/#/challenges/build-order', heading: 'Order handling with a decision' },
  { path: '/#/library', heading: 'Your diagrams' },
  { path: '/#/simulate', heading: /Performance/i },
  { path: '/#/compare', heading: /AS-IS/i },
  { path: '/#/about', heading: 'BPMN Studio' }
];

test.describe('navigation and accessibility basics', () => {
  for (const p of PAGES) {
    test(`${p.path} renders with a heading, landmarks and named controls`, async ({ page, errors }) => {
      void errors;
      await page.goto(p.path);
      await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible();
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await page.waitForTimeout(300);
      const unnamed = await page.evaluate(() =>
        [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select')]
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .filter((el) => {
            const label = el.getAttribute('aria-label') || el.getAttribute('title') || (el as HTMLElement).innerText?.trim() || (el as HTMLInputElement).labels?.[0]?.innerText || el.getAttribute('placeholder');
            return !label;
          })
          .map((el) => el.outerHTML.slice(0, 120))
      );
      expect(unnamed).toEqual([]);
    });
  }

  test('switches between light and dark mode and remembers it', async ({ page, errors }) => {
    void errors;
    await page.goto('/#/');
    const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const before = await theme();
    await page.getByRole('button', { name: /Dark mode|Light mode/ }).click();
    expect(await theme()).not.toBe(before);
    const after = await theme();
    await page.reload();
    expect(await theme()).toBe(after);
  });
});
