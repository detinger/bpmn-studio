import { readFile } from 'node:fs/promises';
import { test, expect, openExample } from './fixtures';

test.describe('modeler', () => {
  test('opens an example, edits with undo/redo and autosaves across reloads', async ({ page, errors }) => {
    void errors;
    await openExample(page, 'Order fulfillment');
    const task = page.locator('.canvas-area [data-element-id="Task_Notify"]');
    await expect(task).toBeVisible();

    await task.click();
    await page.keyboard.press('Delete');
    await expect(task).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(task).toHaveCount(1);
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(task).toHaveCount(0);

    const title = page.getByRole('textbox', { name: 'Diagram name' });
    await title.fill('My order process');
    await title.press('Enter');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Diagram name' })).toHaveValue('My order process');
    await expect(page.locator('.canvas-area [data-element-id="Task_Check"]')).toBeVisible();
    await expect(page.locator('.canvas-area [data-element-id="Task_Notify"]')).toHaveCount(0);
  });

  test('exports standard BPMN 2.0 XML with stable element ids', async ({ page, errors }) => {
    void errors;
    await openExample(page, 'Order fulfillment');
    await page.getByRole('button', { name: 'Export' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /BPMN 2\.0 XML/ }).click()]);
    const xml = await readFile((await download.path())!, 'utf8');
    expect(xml).toContain('http://www.omg.org/spec/BPMN/20100524/MODEL');
    expect(xml).toContain('id="Task_Check"');
    expect(xml).toContain('bpmndi:BPMNDiagram');
  });

  test('keeps the bpmn.io watermark visible (license requirement)', async ({ page, errors }) => {
    void errors;
    await openExample(page, 'Order fulfillment');
    const mark = page.locator('.canvas-area .bjs-powered-by');
    await expect(mark).toBeVisible();
    const onTop = await mark.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    });
    expect(onTop).toBe(true);
  });

  test('validates the model and explains issues', async ({ page, errors }) => {
    void errors;
    await openExample(page, 'Order fulfillment');
    await page.locator('.canvas-area [data-element-id="Task_Pack"]').click();
    await page.keyboard.press('Delete');
    await page.getByRole('tab', { name: /Issues/ }).click();
    await expect(page.locator('.issue').first()).toBeVisible();
    await expect(page.locator('.side-panel')).toContainText(/deadlock|synchroniz|join/i);
  });

  test('runs the token simulation', async ({ page, errors }) => {
    void errors;
    await openExample(page, 'Order fulfillment');
    await page.getByRole('button', { name: 'Simulate', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Exit simulation' })).toBeVisible();
    await expect(page.locator('.side-panel')).toContainText(/token/i);
  });
});
