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
 * order (0 = the (Fin) Call For Return copy, 1 = the Call For Return copy). */
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

test('clicking a Call for Return Period row opens an editable popup and status updates live', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Reviewer 1 FIN');
  await page.locator('nav ul li button', { hasText: 'Call for Return Period' }).click();

  await page.click('button:has-text("+ New")');
  const newModal = page.locator('div.fixed.inset-0.z-50');
  await newModal.locator('input').first().fill('SMOKE-EDIT-PERIOD');
  const newDateInputs = newModal.locator('input[type=date]');
  await newDateInputs.nth(0).fill('2000-01-01');
  await newDateInputs.nth(1).fill('2000-06-01');
  await newModal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);

  const row = page.locator('tr', { hasText: 'SMOKE-EDIT-PERIOD' }).first();
  await expect(row.locator('span', { hasText: 'Closed' })).toBeVisible();

  await row.locator('button', { hasText: 'SMOKE-EDIT-PERIOD' }).click();
  const editModal = page.locator('div.fixed.inset-0.z-50');
  await expect(editModal.locator('h2')).toHaveText('Edit Call for Return Period');
  await expect(editModal.locator('input').first()).toBeDisabled();

  const editDateInputs = editModal.locator('input[type=date]');
  await editDateInputs.nth(0).fill('2026-01-01');
  await editDateInputs.nth(1).fill('2026-12-31');
  await expect(editModal.locator('span', { hasText: 'Open' })).toBeVisible();
  await editModal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);

  await expect(row.locator('span', { hasText: 'Open' })).toBeVisible();
  await expect(row).toContainText('2026-01-01');
  await expect(row).toContainText('2026-12-31');
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

test('sidebar sections can be collapsed and re-expanded by clicking their header', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Super Admin');

  const groupHeader = page.locator('nav > div > button', { hasText: '(Fin) Call For Return' });
  const periodTab = page.locator('nav ul li button', { hasText: 'Call for Return Period' });
  await expect(periodTab).toBeVisible();
  await groupHeader.click();
  await expect(periodTab).toBeHidden();
  await groupHeader.click();
  await expect(periodTab).toBeVisible();
});

test('Call For Return Arrears is branch-scoped only — Finance Officer and FIN reviewers do not get a cross-branch view', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'Finance Officer');
  await gotoTabExact(page, 'Arrears', 1);
  await expect(page.locator('main')).toContainText('No branch is assigned to this persona');

  // The consolidated (Fin) copy is unaffected — still cross-branch.
  await gotoTabExact(page, 'Arrears', 0);
  await expect(page.locator('main')).toContainText('Consolidated across all branches');

  await setPersona(page, 'Reviewer 1 FIN');
  await gotoTabExact(page, 'Arrears', 1);
  await expect(page.locator('main')).toContainText('Showing records for FIN only');
});

test('Top 10 Debtors and Arrears > 5 years pull individual debtor rows with the right columns', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Finance Officer');
  await page.locator('nav ul li button', { hasText: 'Call for Return Period' }).click();
  await page.click('button:has-text("+ New")');
  const modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('input').first().fill('SMOKE-TOP10-PERIOD');
  const dateInputs = modal.locator('input[type=date]');
  await dateInputs.nth(0).fill('2026-01-01');
  await dateInputs.nth(1).fill('2030-01-01');
  await modal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);

  const expectedColumns = [
    'Status', 'SB/Dept', 'Name of Debtor', 'Nature of Arrears', 'Description', 'Total in Arrears',
    'AR in Arrears ≤ 6 months', 'AR in Arrears (6-12 months)', 'AR in Arrears (1-2yrs)',
    'AR in Arrears (2-3yrs)', 'AR in Arrears (3-4yrs)', 'AR in Arrears (4-5yrs)', 'AR in Arrears ≥ 5 years',
  ];

  for (const tab of ['Top 10 Debtors', 'Arrears > 5 years']) {
    await gotoTabExact(page, tab, 0); // (Fin) Call For Return copy, consolidated across branches
    const headers = (await page.locator('table thead th').allTextContents()).map((h) => h.replace('⇅', '').trim());
    expect(headers, `${tab} columns`).toEqual(expectedColumns);
    const rowCount = await page.locator('table tbody tr').count();
    expect(rowCount, `${tab} should have at most 10 rows`).toBeLessThanOrEqual(10);
  }
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
  await expect(page.locator('main')).toContainText('Rejected by Reviewer 1 SIB');
  await expect(page.locator('main')).toContainText('Please recheck the figures');

  // The same rejection notice shows on Top 10 Debtors too, since it's the
  // same underlying submission record.
  await gotoTabExact(page, 'Top 10 Debtors');
  await expect(page.locator('main')).toContainText('Please recheck the figures');
});
