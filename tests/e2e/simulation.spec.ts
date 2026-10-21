import { test, expect, openExample } from './fixtures';

test.describe('performance simulation', () => {
  test('runs a simulation experiment and shows the dashboard', async ({ page, errors }) => {
    void errors;
    await openExample(page, 'Claims handling — AS-IS');
    await page.getByRole('button', { name: 'Performance' }).click();
    await expect(page).toHaveURL(/#\/simulate\/d-/);
    await page.getByRole('button', { name: 'Run simulation' }).click();
    await expect(page.locator('.kpi', { hasText: 'Avg. cycle time' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.kpi', { hasText: 'Avg. cycle time' })).toContainText(/min|h/);
  });

  test('compares AS-IS and TO-BE under the same assumptions', async ({ page, errors }) => {
    void errors;
    await page.goto('/#/library');
    await page.locator('article', { hasText: 'Claims handling — AS-IS' }).getByRole('button', { name: /Open pair/ }).click();
    await expect(page).toHaveURL(/#\/compare\?asIs=/);
    await page.getByRole('button', { name: 'Run comparison' }).click();
    await expect(page.locator('.compare-table').first()).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('.compare-table').first()).toContainText(/cycle time/i);
  });

  test('compare challenge: decide with simulation evidence', async ({ page, errors }) => {
    void errors;
    await page.goto('/#/challenges/compare-pooling');
    await page.getByRole('button', { name: 'Run both simulations' }).click();
    await expect(page.locator('.compare-table')).toBeVisible({ timeout: 45_000 });
    await page.locator('label.quiz-option', { hasText: 'Pooled team' }).click();
    await page.locator('label.quiz-option', { hasText: 'Pooling: any free employee' }).click();
    await page.getByRole('button', { name: 'Check my answer' }).click();
    await expect(page.getByRole('heading', { name: 'Challenge solved!' })).toBeVisible();
  });
});
