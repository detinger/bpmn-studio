import { test, expect } from './fixtures';

test.describe('challenges', () => {
  test('finds a deadlock and explains it', async ({ page, errors }) => {
    void errors;
    await page.goto('/#/challenges/deadlock-credit');
    await page.locator('.mini-canvas [data-element-id="Join"]').click();
    await expect(page.getByText('Selected element:')).toContainText('Parallel Gateway');
    await page.locator('label.quiz-option').first().click();
    await page.getByRole('button', { name: 'Check my answer' }).click();
    await expect(page.getByRole('heading', { name: 'Challenge solved!' })).toBeVisible();

    await page.goto('/#/challenges');
    await expect(page.locator('a.card', { hasText: 'The hidden deadlock' })).toContainText('Solved');
  });

  test('a wrong location is explained, not just marked wrong', async ({ page, errors }) => {
    void errors;
    await page.goto('/#/challenges/deadlock-credit');
    await page.locator('.mini-canvas [data-element-id="Register"]').click();
    await page.locator('label.quiz-option').nth(1).click();
    await page.getByRole('button', { name: 'Check my answer' }).click();
    await expect(page.getByRole('heading', { name: 'Not solved yet' })).toBeVisible();
    await expect(page.getByText(/is not where the execution blocks/)).toBeVisible();
    await expect(page.getByText('Suggested next concept:')).toBeVisible();
  });

  test('predicts executions per scenario', async ({ page, errors }) => {
    void errors;
    await page.goto('/#/challenges/predict-order');
    const valid = page.locator('fieldset', { hasText: 'The order is valid.' });
    for (const name of ['Check order', 'Pack goods', 'Send invoice', 'Ship order']) await valid.locator('label.quiz-option', { hasText: name }).click();
    const invalid = page.locator('fieldset', { hasText: 'The order is invalid.' });
    for (const name of ['Check order', 'Notify customer']) await invalid.locator('label.quiz-option', { hasText: name }).click();
    await page.getByRole('button', { name: 'Check my predictions' }).click();
    await expect(page.getByRole('heading', { name: 'Challenge solved!' })).toBeVisible();
  });

  test('fix challenge: opens the broken model in the modeler and assesses it', async ({ page, errors }) => {
    void errors;
    await page.goto('/#/challenges/fix-loop');
    await page.getByRole('button', { name: /Start in the modeler/ }).click();
    await expect(page).toHaveURL(/#\/modeler\/d-.*\?challenge=fix-loop/);
    await page.getByRole('button', { name: 'Check my solution' }).click();
    await expect(page.getByRole('heading', { name: 'Not solved yet' })).toBeVisible();
    await expect(page.locator('.side-panel')).toContainText('The review result is a decision');

    await page.goto('/#/challenges/fix-loop');
    await expect(page.getByRole('button', { name: /Continue in the modeler/ })).toBeVisible();
  });
});
