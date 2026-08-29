import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const PERSONAS = [
  'Branch Rep PSB', 'Branch Rep TIB', 'Branch Rep SIB', 'Branch Rep PCB', 'Branch Rep FIN',
  'CPM PSB', 'CPM TIB', 'CPM SIB', 'CPM PCB', 'CPM FIN',
  'Reviewer 1 PSB', 'Reviewer 1 TIB', 'Reviewer 1 SIB', 'Reviewer 1 PCB', 'Reviewer 1 FIN',
  'Finance Officer', 'Super Admin',
];

const CFR_FIN_TABS = [
  'Call for Return Period', 'Arrears', 'Top 10 Debtors', 'Arrears > 5 years',
  'Loans and Advances', 'Written Off', 'Top 10 Written Off', 'To be Written Off', 'Reports',
];
const CFR_TABS = [
  'Arrears', 'Top 10 Debtors', 'Arrears > 5 years', 'Loans and Advances',
  'Written Off', 'Top 10 Written Off', 'To be Written Off', 'Reports',
];
const ORIGINAL_FINANCE_ONLY_TABS = ['(Fin) Arrears Report', 'Nature of Arrears', 'Description'];

// Nav order is fixed in Sidebar.tsx; each persona sees a subset of it.
// "Debtors Report" is reachable by both audiences: operational roles see
// their own branch, the finance team sees every branch on the same tab.
function expectedTabsFor(persona: string): string[] {
  const isFinanceOfficer = persona === 'Finance Officer';
  const isSuperAdminPersona = persona === 'Super Admin';
  const isFinBranchReviewerOrCpm = persona.endsWith('FIN') && persona !== 'Branch Rep FIN' && !isFinanceOfficer;

  if (isSuperAdminPersona) {
    return [
      'List of Debtors', 'Debtors Report', 'Arrears Report',
      ...ORIGINAL_FINANCE_ONLY_TABS, ...CFR_FIN_TABS, ...CFR_TABS,
    ];
  }
  if (isFinanceOfficer) {
    return ['Debtors Report', ...ORIGINAL_FINANCE_ONLY_TABS, ...CFR_FIN_TABS, ...CFR_TABS];
  }
  if (isFinBranchReviewerOrCpm) {
    return [
      'List of Debtors', 'Debtors Report', 'Arrears Report',
      ...ORIGINAL_FINANCE_ONLY_TABS, ...CFR_FIN_TABS, ...CFR_TABS,
    ];
  }
  return ['List of Debtors', 'Debtors Report', 'Arrears Report', ...CFR_TABS];
}

async function setPersona(page: Page, label: string) {
  await page.locator('select').first().selectOption({ label });
  await page.waitForTimeout(150);
}

/** Exact-match nav click, since "Arrears" and friends appear in more than
 * one section for some personas. Pass `nth` to pick among duplicates in DOM
 * order (0 = the Debt Management (CFR-FIN) copy, 1 = the (CFR) copy). */
async function gotoTabExact(page: Page, label: string, nth = 0) {
  const nav = page.locator('nav ul li button');
  const labels = await nav.allTextContents();
  const matches = labels.map((l, i) => (l.trim() === label ? i : -1)).filter((i) => i !== -1);
  expect(matches.length, `expected a nav tab labeled "${label}"`).toBeGreaterThan(nth);
  await nav.nth(matches[nth]).click();
  await page.waitForTimeout(200);
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

  for (const tab of ['Debtors Report', '(Fin) Arrears Report']) {
    await page.locator('nav ul li button', { hasText: tab }).click();
    await page.waitForTimeout(150);
    const firstHeader = (await page.locator('table thead th').first().textContent())?.trim();
    expect(firstHeader?.startsWith('Case Reference'), `${tab} first column`).toBe(true);
  }
});

test('Finance team sees every branch on Debtors Report, branch roles see only their own', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'Finance Officer');
  await page.locator('nav ul li button', { hasText: 'Debtors Report' }).click();
  await page.waitForTimeout(150);
  const financeBranches = new Set(await page.locator('table tbody tr td:nth-child(3)').allTextContents());
  expect(financeBranches.size, 'Finance Officer should see multiple branches').toBeGreaterThan(1);

  await setPersona(page, 'Branch Rep PSB');
  await page.locator('nav ul li button', { hasText: 'Debtors Report' }).click();
  await page.waitForTimeout(150);
  const branchRepBranches = new Set(await page.locator('table tbody tr td:nth-child(3)').allTextContents());
  expect([...branchRepBranches]).toEqual(['PSB']);
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

test('Super Admin sees every tab with no restriction', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Super Admin');
  const labels = (await page.locator('nav ul li button').allTextContents()).map((l) => l.trim());
  expect(labels).toEqual(expectedTabsFor('Super Admin'));
});

test('Call for Return period status computes live from the simulated date', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Finance Officer');
  await page.locator('nav ul li button', { hasText: 'Call for Return Period' }).click();

  const today = await page.locator('input[type=date]').first().inputValue();

  await page.click('button:has-text("+ New")');
  const modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('input').first().fill('SMOKE-CLOSED-PERIOD');
  const dateInputs = modal.locator('input[type=date]');
  await dateInputs.nth(0).fill('2000-01-01');
  await dateInputs.nth(1).fill('2000-06-01');
  await modal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);

  const closedRow = page.locator('tr', { hasText: 'SMOKE-CLOSED-PERIOD' }).first();
  await expect(closedRow.locator('span', { hasText: 'Closed' })).toBeVisible();

  await page.click('button:has-text("+ New")');
  await modal.locator('input').first().fill('SMOKE-OPEN-PERIOD');
  await dateInputs.nth(0).fill(today);
  await dateInputs.nth(1).fill(today);
  await modal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);

  const openRow = page.locator('tr', { hasText: 'SMOKE-OPEN-PERIOD' }).first();
  await expect(openRow.locator('span', { hasText: 'Open' })).toBeVisible();
});

test('CFR arrears submission goes Draft -> Pending Review -> Supported -> Approved', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'Finance Officer');
  await page.locator('nav ul li button', { hasText: 'Call for Return Period' }).click();
  await page.click('button:has-text("+ New")');
  const modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('input').first().fill('SMOKE-CFR-CYCLE');
  const dateInputs = modal.locator('input[type=date]');
  await dateInputs.nth(0).fill('2026-01-01');
  await dateInputs.nth(1).fill('2030-01-01');
  await modal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);

  await setPersona(page, 'Branch Rep PCB');
  await gotoTabExact(page, 'Arrears');
  await expect(page.locator('main').getByText('Draft', { exact: true }).first()).toBeVisible();
  await page.click('button:has-text("Submit")');
  await page.waitForTimeout(200);
  await expect(page.locator('main').getByText('Pending Review', { exact: true }).first()).toBeVisible();

  await setPersona(page, 'Reviewer 1 PCB');
  await gotoTabExact(page, 'Arrears');
  await page.click('button:has-text("Approve")');
  await page.waitForTimeout(200);
  await expect(page.locator('main').getByText('Supported', { exact: true }).first()).toBeVisible();

  await setPersona(page, 'CPM PCB');
  await gotoTabExact(page, 'Arrears');
  await page.click('button:has-text("Approve")');
  await page.waitForTimeout(200);
  await expect(page.locator('main').getByText('Approved', { exact: true }).first()).toBeVisible();
});

test('Reviewer reject on CFR arrears sends it back to Draft', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'Finance Officer');
  await page.locator('nav ul li button', { hasText: 'Call for Return Period' }).click();
  await page.click('button:has-text("+ New")');
  const modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('input').first().fill('SMOKE-CFR-REJECT');
  const dateInputs = modal.locator('input[type=date]');
  await dateInputs.nth(0).fill('2026-01-01');
  await dateInputs.nth(1).fill('2030-01-01');
  await modal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);

  await setPersona(page, 'Branch Rep SIB');
  await gotoTabExact(page, 'Arrears');
  await page.click('button:has-text("Submit")');
  await page.waitForTimeout(200);

  await setPersona(page, 'Reviewer 1 SIB');
  await gotoTabExact(page, 'Arrears');
  await page.click('button:has-text("Reject")');
  await page.waitForTimeout(150);
  await page.fill(
    'input[placeholder="Explain why this submission is being rejected"]',
    'Please recheck the figures',
  );
  await page.click('button:has-text("Confirm Reject")');
  await page.waitForTimeout(200);

  await setPersona(page, 'Branch Rep SIB');
  await gotoTabExact(page, 'Arrears');
  await expect(page.locator('main').getByText('Draft', { exact: true }).first()).toBeVisible();
});
