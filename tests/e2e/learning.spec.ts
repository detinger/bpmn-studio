import { test, expect } from './fixtures';
import { getConcept } from '../../src/data/lessons';

test.describe('learning path', () => {
  test('completing the exercise and knowledge check completes a concept', async ({ page, errors }) => {
    void errors;
    const concept = getConcept('process-basics')!;
    if (concept.exercise.kind !== 'mcq') throw new Error('expected a multiple-choice exercise');
    await page.goto('/#/learn/process-basics');
    await expect(page.getByRole('heading', { level: 1, name: concept.title })).toBeVisible();

    await page.getByRole('tab', { name: 'Exercise' }).click();
    for (const i of concept.exercise.correct) await page.locator('label.quiz-option').nth(i).click();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await expect(page.getByText('Correct!')).toBeVisible();

    await page.getByRole('tab', { name: 'Knowledge check' }).click();
    for (const q of concept.quiz) {
      const group = page.locator('fieldset', { hasText: q.question });
      for (const i of q.correct) await group.locator('label.quiz-option').nth(i).click();
    }
    await page.getByRole('button', { name: 'Submit answers' }).click();
    await expect(page.getByText(`${concept.quiz.length} of ${concept.quiz.length} correct`)).toBeVisible();
    await expect(page.getByText('Concept completed')).toBeVisible();

    await page.goto('/#/learn');
    await expect(page.getByText(/1 \/ 22 concepts/)).toBeVisible();
    await expect(page.locator('.badge-tile:not(.locked)', { hasText: 'Sharp mind' })).toBeVisible();
  });

  test('a wrong answer is explained and can be retried', async ({ page, errors }) => {
    void errors;
    const concept = getConcept('process-basics')!;
    const ex = concept.exercise;
    if (ex.kind !== 'mcq') throw new Error('expected a multiple-choice exercise');
    const wrong = ex.options.findIndex((_, i) => !ex.correct.includes(i));
    await page.goto('/#/learn/process-basics');
    await page.getByRole('tab', { name: 'Exercise' }).click();
    await page.locator('label.quiz-option').nth(wrong).click();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await expect(page.getByText('Not quite.')).toBeVisible();
    await expect(page.getByText(ex.explanation)).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('button', { name: 'Check answer' })).toBeDisabled();
  });

  test('starts a guided tutorial in the modeler', async ({ page, errors }) => {
    void errors;
    await page.goto('/#/learn');
    await page.locator('.card', { hasText: 'Your first process' }).getByRole('button', { name: /Start tutorial/ }).click();
    await expect(page).toHaveURL(/#\/modeler\/d-.*\?tutorial=first-process/);
    await expect(page.getByRole('tab', { name: /Tutorial/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.side-panel')).toContainText('Add a start event');
  });

  test('an encyclopedia entry runs its interactive demo', async ({ page, errors }) => {
    void errors;
    await page.goto('/#/encyclopedia/inclusive-gateway');
    await expect(page.getByRole('heading', { name: 'Interactive example' })).toBeVisible();
    await expect(page.locator('.mini-canvas .djs-element').first()).toBeVisible();
    await page.getByRole('button', { name: 'Start' }).first().click();
    await expect(page.locator('.mini-controls')).toContainText(/Running|Ready|Waiting|Completed/);
  });
});
