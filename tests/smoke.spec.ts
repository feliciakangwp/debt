import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const PERSONAS = [
  'Branch Rep PSB', 'Branch Rep TIB', 'Branch Rep SIB', 'Branch Rep PCB', 'Branch Rep FIN',
  'CPM PSB', 'CPM TIB', 'CPM SIB', 'CPM PCB', 'CPM FIN',
  'Reviewer 1 PSB', 'Reviewer 1 TIB', 'Reviewer 1 SIB', 'Reviewer 1 PCB', 'Reviewer 1 FIN',
  'Finance Officer',
];

const OPERATIONAL_TABS = ['List of Debtors', 'Debtors Report', 'Arrears Report'];
const FINANCE_TABS = ['(Fin) Debtors Report', '(Fin) Arrears Report', 'Nature of Arrears', 'Description'];

function expectedTabsFor(persona: string): string[] {
  const isFinanceOfficer = persona === 'Finance Officer';
  const isFinBranch = persona.endsWith('FIN') && persona !== 'Branch Rep FIN';
  if (isFinanceOfficer) return FINANCE_TABS;
  if (isFinBranch) return [...OPERATIONAL_TABS, ...FINANCE_TABS];
  return OPERATIONAL_TABS;
}

async function setPersona(page: Page, label: string) {
  await page.locator('select').first().selectOption({ label });
  await page.waitForTimeout(150);
}

test.describe('no console errors and no blank pages across every persona x tab', () => {
  for (const persona of PERSONAS) {
    test(`${persona}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
      });

      await page.goto('/');
      await setPersona(page, persona);

      const navButtons = page.locator('nav ul li button');
      const count = await navButtons.count();
      expect(count, `${persona} should see at least one tab`).toBeGreaterThan(0);

      const labels = await navButtons.allTextContents();
      expect(labels.map((l) => l.trim())).toEqual(expectedTabsFor(persona));

      for (let i = 0; i < count; i++) {
        await navButtons.nth(i).click();
        await page.waitForTimeout(150);
        const bodyText = await page.evaluate(() => document.body.innerText);
        expect(bodyText.length, `${persona} / ${labels[i]} should render real content`).toBeGreaterThan(50);
      }

      expect(errors, `${persona} triggered console/page errors: ${errors.join('; ')}`).toEqual([]);
    });
  }
});

test('Case Reference is the first data column on the three report-style pages', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Finance Officer');

  for (const tab of ['(Fin) Debtors Report', '(Fin) Arrears Report']) {
    await page.locator('nav ul li button', { hasText: tab }).click();
    await page.waitForTimeout(150);
    const firstHeader = (await page.locator('table thead th').first().textContent())?.trim();
    expect(firstHeader?.startsWith('Case Reference'), `${tab} first column`).toBe(true);
  }
});

test('Branch Rep can create and submit a debtor end to end', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Branch Rep PSB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();

  await page.click('button:has-text("+ New")');
  const modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('input[placeholder="Free text"]').first().fill('CI Smoke Test Co');
  await modal.locator('input[type=text]').first().fill('1000');
  await modal.locator('input[type=date]').first().fill('2025-01-01');
  await modal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);

  const draftRow = page.locator('tr', { hasText: 'CI Smoke Test Co' }).first();
  await expect(draftRow.locator('text=Draft')).toBeVisible();

  await draftRow.locator('input[type=checkbox]').check();
  await page.click('button:has-text("Submit")');
  await page.waitForTimeout(200);
  await expect(draftRow.locator('text=Pending Review')).toBeVisible();
});
