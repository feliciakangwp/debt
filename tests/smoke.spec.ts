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
const WRITE_OFF_TABS = ['Write Off', 'To Be Written Off'];
const ORIGINAL_FINANCE_ONLY_TABS = ['(Fin) Arrears Report', ...WRITE_OFF_TABS, 'Nature of Arrears', 'Description'];

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
    return ['Debtors Report', ...ORIGINAL_FINANCE_ONLY_TABS, ...CFR_FIN_TABS];
  }
  if (isFinBranchReviewerOrCpm) {
    return [
      'List of Debtors', 'Debtors Report', 'Arrears Report',
      ...ORIGINAL_FINANCE_ONLY_TABS, ...CFR_FIN_TABS, ...CFR_TABS,
    ];
  }
  return ['List of Debtors', 'Debtors Report', 'Arrears Report', ...WRITE_OFF_TABS, ...CFR_TABS];
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

/** DataTable now paginates at 10 rows — walks every page of the current
 * table via its "Next" button, collecting `cellSelector`'s text from each,
 * so assertions that need the whole dataset (not just page 1) still work. */
/** Finds a row containing `text`, paging forward from wherever the table
 * currently is until it's found (DataTable resets to page 1 whenever the
 * underlying rows change, e.g. after a status update, so this re-searches
 * from page 1 each time it's called). Returns an empty-match locator if
 * not found on any page. */
async function findRowAcrossPages(page: Page, text: string) {
  for (;;) {
    const row = page.locator('tr', { hasText: text }).first();
    if ((await row.count()) > 0) return row;
    const nextBtn = page.locator('button', { hasText: 'Next' });
    if ((await nextBtn.count()) === 0 || (await nextBtn.isDisabled())) return row;
    await nextBtn.click();
    await page.waitForTimeout(150);
  }
}

async function collectAcrossPages(page: Page, cellSelector: string): Promise<string[]> {
  const values: string[] = [];
  for (;;) {
    values.push(...(await page.locator(cellSelector).allTextContents()));
    const nextBtn = page.locator('button', { hasText: 'Next' });
    if ((await nextBtn.count()) === 0 || (await nextBtn.isDisabled())) break;
    await nextBtn.click();
    await page.waitForTimeout(150);
  }
  return values;
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
  const financeBranches = new Set(await collectAcrossPages(page, 'table tbody tr td:nth-child(3)'));
  expect(financeBranches.size, 'Finance Officer should see multiple branches').toBeGreaterThan(1);

  await setPersona(page, 'Branch Rep PSB');
  await page.locator('nav ul li button', { hasText: 'Debtors Report' }).click();
  await page.waitForTimeout(150);
  const branchRepBranches = new Set(await collectAcrossPages(page, 'table tbody tr td:nth-child(3)'));
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

  // New debtors are appended at the end of the list, so with 10-row
  // pagination it likely isn't on page 1 — page forward to find it.
  const draftRow = await findRowAcrossPages(page, 'CI Smoke Test Co');
  await expect(draftRow.locator('text=Draft')).toBeVisible();

  await draftRow.locator('input[type=checkbox]').check();
  await page.click('button:has-text("Submit")');
  await page.waitForTimeout(200);
  // Submitting changes the dataset, which resets pagination to page 1.
  const submittedRow = await findRowAcrossPages(page, 'CI Smoke Test Co');
  await expect(submittedRow.locator('text=Pending Review')).toBeVisible();
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

test('Call For Return Arrears is branch-scoped only — Finance Officer has no access to the section, FIN reviewers do not get a cross-branch view', async ({ page }) => {
  await page.goto('/');

  // Finance Officer no longer sees the "Call For Return" section at all —
  // only the single, consolidated "(Fin) Call For Return" copy of Arrears.
  await setPersona(page, 'Finance Officer');
  const arrearsMatches = (await page.locator('nav ul li button').allTextContents()).filter(
    (l) => l.trim() === 'Arrears',
  );
  expect(arrearsMatches).toHaveLength(1);
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
    expect(rowCount, `${tab} should have at least one row`).toBeGreaterThan(0);
    if (tab === 'Top 10 Debtors') {
      // Truncated to the top 10 by Total in Arrears; Arrears > 5 years has
      // no such cap — it's every debtor with a balance in that bucket.
      expect(rowCount, `${tab} should have at most 10 rows`).toBeLessThanOrEqual(10);
    }
  }
});

test('Top 10 Debtors / Arrears > 5 years Status column tracks the CFR submission, not the Debtor List status', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'Finance Officer');
  await page.locator('nav ul li button', { hasText: 'Call for Return Period' }).click();
  await page.click('button:has-text("+ New")');
  const modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('input').first().fill('SMOKE-STATUS-SPLIT');
  const dateInputs = modal.locator('input[type=date]');
  await dateInputs.nth(0).fill('2026-01-01');
  await dateInputs.nth(1).fill('2030-01-01');
  await modal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);

  // Seed debtors are all "Supported" on the Debtor List. Before any CFR
  // submit, the CFR status must still read Draft here — it's a separate
  // approval process from the Debtor List's own status.
  await setPersona(page, 'Branch Rep PSB');
  await gotoTabExact(page, 'Arrears > 5 years');
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  const statusCellsBefore = await page.locator('table tbody tr td:first-child').allTextContents();
  expect(statusCellsBefore.every((t) => t.trim() === 'Draft'), `expected all Draft, got ${statusCellsBefore}`).toBe(true);

  await page.click('button:has-text("Submit")');
  await page.waitForTimeout(200);
  const statusCellsAfter = await page.locator('table tbody tr td:first-child').allTextContents();
  expect(
    statusCellsAfter.every((t) => t.trim() === 'Pending Review'),
    `expected all Pending Review, got ${statusCellsAfter}`,
  ).toBe(true);

  // The (Fin) consolidated copy takes its per-row status from the same
  // branch submissions.
  await setPersona(page, 'Finance Officer');
  await gotoTabExact(page, 'Arrears > 5 years');
  await expect(page.locator('main')).toContainText('Pending Review');
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

test('Reports tab auto-generates once a period closes, scoped per branch and consolidated for (Fin)', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'Reviewer 1 FIN');
  await page.locator('nav ul li button', { hasText: 'Call for Return Period' }).click();
  await page.click('button:has-text("+ New")');
  const modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('input').first().fill('SMOKE-REPORTS-PERIOD');
  const dateInputs = modal.locator('input[type=date]');
  await dateInputs.nth(0).fill('2026-01-01');
  await dateInputs.nth(1).fill('2030-01-01');
  await modal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);

  // While the period is open, no reports are generated yet for it.
  await gotoTabExact(page, 'Reports');
  await expect(page.locator('main')).toContainText('No closed Call for Return periods yet.');

  // A branch visiting Arrears is what creates that branch's (and every
  // other branch's) CFR submission record for the period.
  await setPersona(page, 'Branch Rep PSB');
  await gotoTabExact(page, 'Arrears');
  await page.waitForTimeout(150);

  // Close the period by editing its End Date into the past.
  await setPersona(page, 'Reviewer 1 FIN');
  await page.locator('nav ul li button', { hasText: 'Call for Return Period' }).click();
  const periodRow = page.locator('tr', { hasText: 'SMOKE-REPORTS-PERIOD' }).first();
  await periodRow.locator('button', { hasText: 'SMOKE-REPORTS-PERIOD' }).click();
  const editModal = page.locator('div.fixed.inset-0.z-50');
  const editDates = editModal.locator('input[type=date]');
  await editDates.nth(0).fill('2020-01-01');
  await editDates.nth(1).fill('2020-06-01');
  await editModal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);
  await expect(periodRow.locator('span', { hasText: 'Closed' })).toBeVisible();

  const expectedReports = [
    'Arrears', 'Top 10 Debtors', 'Arrears > 5 Years', 'Loans & Advances',
    'Written Off', 'Top 10 Written Off', 'To be Written Off',
  ];

  // Branch Rep PSB's Call For Return Reports tab now lists all 7 reports
  // for this period.
  await setPersona(page, 'Branch Rep PSB');
  await gotoTabExact(page, 'Reports');
  await expect(page.locator('table tbody tr')).toHaveCount(7);
  const periodCol = await page.locator('table tbody tr td:nth-child(2)').allTextContents();
  expect(periodCol.every((t) => t.trim() === 'SMOKE-REPORTS-PERIOD')).toBe(true);
  const reportCol = (await page.locator('table tbody tr td:nth-child(3)').allTextContents()).map((t) => t.trim());
  expect(reportCol).toEqual(expectedReports);

  // Every branch got a submission record when Branch Rep PSB opened
  // Arrears, so Branch Rep TIB (who never visited anything for this
  // period) also sees their own 7 rows.
  await setPersona(page, 'Branch Rep TIB');
  await gotoTabExact(page, 'Reports');
  await expect(page.locator('table tbody tr')).toHaveCount(7);

  // The (Fin) consolidated Reports tab shows the same period/report list.
  await setPersona(page, 'Finance Officer');
  await gotoTabExact(page, 'Reports');
  await expect(page.locator('table tbody tr')).toHaveCount(7);

  // Selecting rows and downloading produces an xlsx file.
  await setPersona(page, 'Branch Rep PSB');
  await gotoTabExact(page, 'Reports');
  const checkboxes = page.locator('table tbody tr input[type=checkbox]');
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Download Excel")'),
  ]);
  expect(download.suggestedFilename()).toMatch(/^CallForReturn-Reports-.*\.xlsx$/);
});

test('seed data covers every branch with 20 debtors each, including TIB, SIB and FIN', async ({ page }) => {
  await page.goto('/');

  for (const branch of ['PSB', 'TIB', 'SIB', 'PCB', 'FIN']) {
    await setPersona(page, `Branch Rep ${branch}`);
    await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
    await page.waitForTimeout(150);
    // Rows are per AR entry, not per debtor — some seeded debtors have more
    // than one — so count distinct debtor names instead of raw row count.
    // Paginated at 10 rows, so walk every page to see them all.
    const names = new Set(await collectAcrossPages(page, 'table tbody tr button'));
    expect(names.size, `Branch Rep ${branch} should have 20 distinct seeded debtors`).toBe(20);
  }

  await setPersona(page, 'Finance Officer');
  await page.locator('nav ul li button', { hasText: 'Debtors Report' }).click();
  await page.waitForTimeout(150);
  const branches = new Set(await collectAcrossPages(page, 'table tbody tr td:nth-child(3)'));
  expect([...branches].sort()).toEqual(['FIN', 'PCB', 'PSB', 'SIB', 'TIB']);
});

test('a version bump on the persisted schema reseeds a returning browser\'s sample debtors', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const oldState = {
      natureList: [{ id: 'nat-tax', name: 'Tax', active: true }],
      descriptionList: [
        { id: 'desc-p-offence-motor-vehicle', name: 'P Offence – Motor Vehicle', natureId: 'nat-tax', active: true },
      ],
      debtors: [
        {
          id: 'old-debtor-1', status: 'SUPPORTED', branch: 'PSB', name: 'OLD CACHED DEBTOR',
          natureId: 'nat-tax', descriptionId: 'desc-p-offence-motor-vehicle',
          notInArrears: 0, arrears6m: 100, arrears6to12m: 0, arrears1to2y: 0, arrears2to3y: 0,
          arrears3to4y: 0, arrears4to5y: 0, arrears5yPlus: 0,
          reasonNonRecovery: '', recoverySteps: '', caseReference: '', auditLog: [],
        },
      ],
      personaId: 'FINANCE',
      simulatedToday: '2026-01-01',
      dataVersion: 2,
      callForReturnPeriods: [],
      cfrArrearsSubmissions: [],
    };
    localStorage.setItem('debt-management-module-v1', JSON.stringify(oldState));
  });
  await page.reload();

  await setPersona(page, 'Branch Rep PSB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  await page.waitForTimeout(150);
  await expect(page.locator('main')).not.toContainText('OLD CACHED DEBTOR');
  const names = new Set(await collectAcrossPages(page, 'table tbody tr button'));
  expect(names.size).toBe(20);
});

test('Export button on every Call For Return / (Fin) Call For Return report tab downloads what is on screen', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'Reviewer 1 FIN');
  await page.locator('nav ul li button', { hasText: 'Call for Return Period' }).click();
  await page.click('button:has-text("+ New")');
  const modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('input').first().fill('SMOKE-EXPORT-PERIOD');
  const dateInputs = modal.locator('input[type=date]');
  await dateInputs.nth(0).fill('2026-01-01');
  await dateInputs.nth(1).fill('2030-01-01');
  await modal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);

  // Every report tab in both sections has a working Export button, exporting
  // the currently visible rows.
  const reportTabs = ['Arrears', 'Top 10 Debtors', 'Arrears > 5 years'];
  for (const tab of reportTabs) {
    await gotoTabExact(page, tab, 0); // (Fin) Call For Return copy
    await page.waitForTimeout(150);
    const onScreenRows = await page.locator('table tbody tr').count();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export")'),
    ]);
    expect(download.suggestedFilename()).toMatch(/^FinCallForReturn-.*\.xlsx$/);
    expect(onScreenRows, `${tab} should have rows to export`).toBeGreaterThan(0);
  }

  // Placeholder report tabs (no real data model yet) still expose the
  // button and export a "not yet built" note instead of erroring.
  await gotoTabExact(page, 'Loans and Advances', 0);
  const [placeholderDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Export")'),
  ]);
  expect(placeholderDownload.suggestedFilename()).toBe('FinCallForReturn-LoansAndAdvances.xlsx');

  // The branch-scoped "Call For Return" copies also have the button.
  await setPersona(page, 'Branch Rep PSB');
  await gotoTabExact(page, 'Arrears');
  const [branchDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Export")'),
  ]);
  expect(branchDownload.suggestedFilename()).toMatch(/^CallForReturn-Arrears-.*\.xlsx$/);
});

test('Write Off on a debtor goes Branch Rep submits -> Pending -> Reviewer 1 supports -> Supported, then locks', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'Branch Rep TIB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  const firstRow = page.locator('table tbody tr').first();
  const debtorName = (await firstRow.locator('button').innerText()).trim();
  await firstRow.locator('button').click();

  const modal = page.locator('div.fixed.inset-0.z-50');
  await expect(modal.locator('label', { hasText: 'Write Off' })).toBeVisible();
  await modal.locator('button:has-text("Write Off")').click();

  // Pick a write-off date comfortably after today so Days in Arrears (from
  // the earliest arrear on record) comes out positive. This debtor's single
  // AR entry is $4,000, so write off the full balance — the write-off amount
  // can never exceed what's still outstanding.
  await modal.locator('input[type=date]').fill('2027-06-01');
  await modal.locator('input[type=number]').fill('4000');
  const daysBox = modal.locator('div.bg-slate-100');
  await expect(daysBox).not.toHaveText('No arrears on record');
  const daysText = (await daysBox.innerText()).trim();
  expect(Number(daysText)).toBeGreaterThan(0);
  await modal.getByPlaceholder('Free text').last().fill('Debtor untraceable, exhausted all recovery options');

  const submitBtn = modal.locator('button:has-text("Submit")');
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();
  await expect(modal.locator('span', { hasText: 'Request for Write Off' })).toBeVisible();
  await expect(modal.locator('button:has-text("Write Off")')).toBeHidden();
  await modal.locator('button:has-text("✕")').click();

  // CPM (read-only for Write Off) sees it but can't act on it.
  await setPersona(page, 'CPM TIB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  await page.locator('table tbody tr', { hasText: debtorName }).first().locator('button').click();
  const cpmModal = page.locator('div.fixed.inset-0.z-50');
  await expect(cpmModal.locator('span', { hasText: 'Request for Write Off' })).toBeVisible();
  await expect(cpmModal.locator('button:has-text("Support")')).toBeHidden();
  await cpmModal.locator('button:has-text("✕")').click();

  // Reviewer 1 supports it.
  await setPersona(page, 'Reviewer 1 TIB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  await page.locator('table tbody tr', { hasText: debtorName }).first().locator('button').click();
  const reviewerModal = page.locator('div.fixed.inset-0.z-50');
  await reviewerModal.locator('button:has-text("Support")').click();
  await expect(reviewerModal.locator('span', { hasText: 'Supported' }).first()).toBeVisible();
  await reviewerModal.locator('button:has-text("✕")').click();

  // The full balance was written off, so there's nothing left to write off
  // and no Write Off button — a repeat write-off is only offered while a
  // balance remains (covered by the knock-off/repeat test below).
  await setPersona(page, 'Branch Rep TIB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  await page.locator('table tbody tr', { hasText: debtorName }).first().locator('button').click();
  const finalModal = page.locator('div.fixed.inset-0.z-50');
  await expect(finalModal.locator('button:has-text("Write Off")')).toBeHidden();
  await expect(finalModal.locator('span', { hasText: 'Supported' }).first()).toBeVisible();
  await expect(finalModal).toContainText('fully written off');
});

test('Case Reference is locked once Supported — only Request to Edit can change it', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'Branch Rep PSB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  const firstRow = page.locator('table tbody tr').first();
  const debtorName = (await firstRow.locator('button').innerText()).trim();
  await firstRow.locator('button').click();

  const modal = page.locator('div.fixed.inset-0.z-50');
  const caseRefLabel = modal.locator('label', { hasText: 'Case Reference' });
  await expect(caseRefLabel).toBeVisible();
  // Outside Request to Edit, Case Reference is a read-only display, not an
  // editable input — Save (which only ever touches Reason/Recovery Steps
  // now) cannot change it.
  const caseRefBlock = caseRefLabel.locator('xpath=..');
  await expect(caseRefBlock.locator('input')).toHaveCount(0);
  const originalCaseReference = (await caseRefBlock.locator('.text-slate-700').innerText()).trim();

  await modal.locator('button:has-text("Request to Edit")').click();
  const caseRefInput = caseRefBlock.locator('input');
  await expect(caseRefInput).toBeVisible();
  await caseRefInput.fill('CI-CASE-REF-999');
  await modal.locator('button:has-text("Submit")').click();
  await page.waitForTimeout(200);

  await setPersona(page, 'Reviewer 1 PSB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  await page.locator('table tbody tr', { hasText: debtorName }).first().locator('button').click();
  const reviewerModal = page.locator('div.fixed.inset-0.z-50');
  await expect(reviewerModal).toContainText(originalCaseReference);
  await expect(reviewerModal).toContainText('CI-CASE-REF-999');
  await reviewerModal.locator('button:has-text("Approve")').click();
  await page.waitForTimeout(200);

  await setPersona(page, 'Branch Rep PSB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  await page.locator('table tbody tr', { hasText: debtorName }).first().locator('button').click();
  const finalModal = page.locator('div.fixed.inset-0.z-50');
  await expect(finalModal).toContainText('CI-CASE-REF-999');
});

test('seed debtors have a Case Reference and a Required Paid Date', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Branch Rep PSB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();

  const caseRefs = await collectAcrossPages(page, 'table tbody tr td:nth-child(2)');
  expect(caseRefs.length).toBeGreaterThan(0);
  expect(caseRefs.every((c) => c.trim() !== '' && c.trim() !== '-')).toBe(true);

  const dueDates = await collectAcrossPages(page, 'table tbody tr td:nth-child(9)');
  expect(dueDates.every((d) => d.trim() !== '-')).toBe(true);
});

test('Write Off Save keeps it editable as To be Written Off, visible in the new Debt Management tabs', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'Branch Rep SIB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  const firstRow = page.locator('table tbody tr').first();
  const debtorName = (await firstRow.locator('button').innerText()).trim();
  await firstRow.locator('button').click();

  const modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('button:has-text("Write Off")').click();
  await modal.locator('input[type=date]').fill('2027-03-01');
  await modal.locator('input[type=number]').fill('2000');
  await modal.getByPlaceholder('Free text').last().fill('Saved as draft first');
  await modal.locator('button:has-text("Save"):not([disabled])').click();

  await expect(modal.locator('span', { hasText: 'To be Written Off' })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await modal.locator('button:has-text("✕")').click();

  // Shows up in the new "To Be Written Off" tab under Debt Management, for
  // Branch Rep, Reviewer 1, CPM and the finance team alike.
  for (const persona of ['Branch Rep SIB', 'Reviewer 1 SIB', 'CPM SIB', 'Finance Officer']) {
    await setPersona(page, persona);
    await page.getByRole('button', { name: 'To Be Written Off', exact: true }).click();
    await expect(
      page.locator('table thead th'),
    ).toContainText(['SB/Dept', 'Name of Debtor', 'Nature of Arrears', 'Description', 'Amount to be Written off', 'Days in Arrears', 'Reason for Write off']);
    const names = await page.locator('table tbody tr td:nth-child(2)').allTextContents();
    expect(names.some((n) => n.trim() === debtorName), `${persona} should see ${debtorName}`).toBe(true);
  }

  // Submitting from the read-only summary (without reopening the form)
  // moves it to Pending and off the To Be Written Off tab.
  await setPersona(page, 'Branch Rep SIB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  await page.locator('table tbody tr', { hasText: debtorName }).first().locator('button').click();
  const modal2 = page.locator('div.fixed.inset-0.z-50');
  await modal2.locator('button:has-text("Submit")').click();
  await expect(modal2.locator('span', { hasText: 'Request for Write Off' })).toBeVisible();
  await modal2.locator('button:has-text("✕")').click();

  await page.getByRole('button', { name: 'To Be Written Off', exact: true }).click();
  const namesAfter = await page.locator('table tbody tr td:nth-child(2)').allTextContents();
  expect(namesAfter.some((n) => n.trim() === debtorName)).toBe(false);
});

test('a Supported write-off knocks the amount off Total in Arrears, appears on the Write Off tab and ledger, and can repeat', async ({ page }) => {
  await page.goto('/');

  // Devi Krishnan (PCB) is seeded with a single $15,000 AR entry, overdue by
  // a few months — one debtor now carries exactly one AR line.
  const debtorName = 'Devi Krishnan';

  await setPersona(page, 'Branch Rep PCB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  await page.locator('table tbody tr', { hasText: debtorName }).first().locator('button').click();
  const modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('button:has-text("Write Off")').click();
  await modal.locator('input[type=date]').fill('2027-02-01');
  await modal.locator('input[type=number]').fill('1500');
  await modal.getByPlaceholder('Free text').last().fill('Ledger and knock-off check');
  await modal.locator('button:has-text("Submit")').last().click();
  await modal.locator('button:has-text("✕")').click();

  await setPersona(page, 'Reviewer 1 PCB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  await page.locator('table tbody tr', { hasText: debtorName }).first().locator('button').click();
  const reviewerModal = page.locator('div.fixed.inset-0.z-50');
  await reviewerModal.locator('button:has-text("Support")').click();
  await expect(reviewerModal.locator('span', { hasText: 'Supported' }).first()).toBeVisible();

  // Ledger shows the Arrears entry plus the Write Off row that knocked it down.
  const ledgerText = await reviewerModal.locator('table').last().innerText();
  expect(ledgerText).toContain('Arrears');
  expect(ledgerText).toContain('Write Off');
  await reviewerModal.locator('button:has-text("✕")').click();

  // List of Debtors' Amount column reflects the knock-off: 15,000 - 1,500 = 13,500.
  const headers = (await page.locator('table thead th').allTextContents()).map((h) => h.replace('⇅', '').trim());
  const amountColIdx = headers.indexOf('Amount');
  const row = page.locator('table tbody tr', { hasText: debtorName }).first();
  const amountAfter = (await row.locator('td').nth(amountColIdx).innerText()).trim();
  expect(amountAfter).toBe('$13,500');

  // Shows up on the "Write Off" tab now that it's Supported.
  await page.getByRole('button', { name: 'Write Off', exact: true }).click();
  await expect(
    page.locator('table thead th'),
  ).toContainText(['SB/Dept', 'Name of Debtor', 'Nature of Arrears', 'Description', 'Amount of Write off', 'Days in Arrears', 'Reason for Write off']);
  const rowNames = await page.locator('table tbody tr td:nth-child(2)').allTextContents();
  expect(rowNames.some((n) => n.trim() === debtorName)).toBe(true);

  // Write-off is repeatable: with $13,500 still outstanding, Branch Rep sees
  // the "Write Off" button again (not locked out just because one write-off
  // was already Supported), and a write-off history entry for the first one.
  await setPersona(page, 'Branch Rep PCB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  await page.locator('table tbody tr', { hasText: debtorName }).first().locator('button').click();
  const repeatModal = page.locator('div.fixed.inset-0.z-50');
  await expect(repeatModal.locator('button:has-text("Write Off")')).toBeVisible();
  await expect(repeatModal).toContainText('Write-off history');
  await expect(repeatModal).toContainText('$1,500');
  await repeatModal.locator('button:has-text("✕")').click();
});

test('Written Off and To be Written Off Call For Return tabs pull from Debt Management write-offs and go through Submit -> Approve -> Approve', async ({ page }) => {
  await page.goto('/');

  // Chua Beng Huat (SIB) gets a fully Supported write-off.
  const supportedDebtor = 'Chua Beng Huat';
  await setPersona(page, 'Branch Rep SIB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  await page.locator('table tbody tr', { hasText: supportedDebtor }).first().locator('button').click();
  let modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('button:has-text("Write Off")').click();
  await modal.locator('input[type=date]').fill('2027-01-01');
  await modal.locator('input[type=number]').fill('4000');
  await modal.getByPlaceholder('Free text').last().fill('CFR written off check');
  await modal.locator('button:has-text("Submit")').last().click();
  await modal.locator('button:has-text("✕")').click();

  await setPersona(page, 'Reviewer 1 SIB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  await page.locator('table tbody tr', { hasText: supportedDebtor }).first().locator('button').click();
  modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('button:has-text("Support")').click();
  await expect(modal.locator('span', { hasText: 'Supported' }).first()).toBeVisible();
  await modal.locator('button:has-text("✕")').click();

  // Nurul Huda (SIB) gets a To be Written Off (saved, not yet submitted) write-off.
  const toBeDebtor = 'Nurul Huda';
  await setPersona(page, 'Branch Rep SIB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  await page.locator('table tbody tr', { hasText: toBeDebtor }).first().locator('button').click();
  modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('button:has-text("Write Off")').click();
  await modal.locator('input[type=date]').fill('2026-12-01');
  await modal.locator('input[type=number]').fill('5000');
  await modal.getByPlaceholder('Free text').last().fill('CFR to-be-written-off check');
  await modal.locator('button:has-text("Save"):not([disabled])').click();
  await expect(modal.locator('span', { hasText: 'To be Written Off' })).toBeVisible();
  await modal.locator('button:has-text("✕")').click();

  // Open a Call for Return period.
  await setPersona(page, 'Finance Officer');
  await page.locator('nav ul li button', { hasText: 'Call for Return Period' }).click();
  await page.click('button:has-text("+ New")');
  const periodModal = page.locator('div.fixed.inset-0.z-50');
  await periodModal.locator('input').first().fill('SMOKE-WRITEOFF-CFR-PERIOD');
  const dateInputs = periodModal.locator('input[type=date]');
  await dateInputs.nth(0).fill('2026-01-01');
  await dateInputs.nth(1).fill('2030-01-01');
  await periodModal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);

  const writtenOffHeaders = [
    'Status', 'SB/Dept', 'Name of Debtor', 'Nature of Arrears', 'Description',
    'Amount of Write Off', 'Days in Arrears', 'Reasons for write off',
  ];
  const toBeWrittenOffHeaders = [
    'Status', 'SB/Dept', 'Name of Debtor', 'Nature of Arrears', 'Description',
    'Amount to be Written Off', 'Days in Arrears', 'Reasons for write off',
  ];

  await setPersona(page, 'Branch Rep SIB');
  await gotoTabExact(page, 'Written Off');
  await expect(page.locator('table thead th')).toContainText(writtenOffHeaders);
  let names = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
  expect(names.some((n) => n.trim() === supportedDebtor)).toBe(true);

  await gotoTabExact(page, 'To be Written Off');
  await expect(page.locator('table thead th')).toContainText(toBeWrittenOffHeaders);
  names = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
  expect(names.some((n) => n.trim() === toBeDebtor)).toBe(true);

  // Submit -> Approve -> Approve, same as every other CFR report tab — one
  // submission per branch per period, shared across all of that branch's
  // report tabs (including this one).
  await page.click('button:has-text("Submit")');
  await page.waitForTimeout(200);
  await expect(page.locator('main').getByText('Pending Review', { exact: true }).first()).toBeVisible();

  await setPersona(page, 'Reviewer 1 SIB');
  await gotoTabExact(page, 'To be Written Off');
  await page.click('button:has-text("Approve")');
  await page.waitForTimeout(200);
  await expect(page.locator('main').getByText('Supported', { exact: true }).first()).toBeVisible();

  await setPersona(page, 'CPM SIB');
  await gotoTabExact(page, 'To be Written Off');
  await page.click('button:has-text("Approve")');
  await page.waitForTimeout(200);
  await expect(page.locator('main').getByText('Approved', { exact: true }).first()).toBeVisible();

  // The (Fin) consolidated copies show the same rows, across branches.
  await setPersona(page, 'Finance Officer');
  await gotoTabExact(page, 'Written Off');
  names = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
  expect(names.some((n) => n.trim() === supportedDebtor)).toBe(true);

  await gotoTabExact(page, 'To be Written Off');
  names = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
  expect(names.some((n) => n.trim() === toBeDebtor)).toBe(true);
});

test('List of Debtors Status column shows an in-flight write-off status alongside the debtor status', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'Branch Rep PSB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  const debtorName = 'Lim Wee Keng';
  const row = page.locator('table tbody tr', { hasText: debtorName }).first();
  await row.locator('button').click();
  const modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('button:has-text("Write Off")').click();
  await modal.locator('input[type=date]').fill('2027-01-01');
  await modal.locator('input[type=number]').fill('1000');
  await modal.getByPlaceholder('Free text').last().fill('List status check');
  await modal.locator('button:has-text("Save"):not([disabled])').click();
  await modal.locator('button:has-text("✕")').click();
  await page.waitForTimeout(150);

  // Saved (not yet submitted) shows "To be Written Off" right in the list,
  // alongside the debtor's own "Supported" status.
  await expect(row).toContainText('To be Written Off');
  await expect(row).toContainText('Supported');

  await row.locator('button').click();
  const modal2 = page.locator('div.fixed.inset-0.z-50');
  await modal2.locator('button:has-text("Submit")').click();
  await modal2.locator('button:has-text("✕")').click();
  await page.waitForTimeout(150);
  await expect(row).toContainText('Request for Write Off');

  await setPersona(page, 'Reviewer 1 PSB');
  await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
  const reviewerRow = page.locator('table tbody tr', { hasText: debtorName }).first();
  await reviewerRow.locator('button').click();
  const reviewerModal = page.locator('div.fixed.inset-0.z-50');
  await reviewerModal.locator('button:has-text("Support")').click();
  await reviewerModal.locator('button:has-text("✕")').click();
  await page.waitForTimeout(150);

  // Once Supported it's history, not an in-flight write-off — the list only
  // shows the debtor's own status again.
  await expect(reviewerRow.locator('span', { hasText: 'To be Written Off' })).toHaveCount(0);
  await expect(reviewerRow.locator('span', { hasText: 'Request for Write Off' })).toHaveCount(0);
});

test('Top 10 Written Off Call For Return tab pulls Supported write-offs, sorted by amount, capped at 10', async ({ page }) => {
  await page.goto('/');

  const smallerDebtor = 'Lim Wee Keng';
  const biggerDebtor = 'Chong Siew Fong';

  const writeOffAndSupport = async (debtorName: string, amount: string) => {
    await setPersona(page, 'Branch Rep PSB');
    await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
    await page.locator('table tbody tr', { hasText: debtorName }).first().locator('button').click();
    const modal = page.locator('div.fixed.inset-0.z-50');
    await modal.locator('button:has-text("Write Off")').click();
    await modal.locator('input[type=date]').fill('2027-01-01');
    await modal.locator('input[type=number]').fill(amount);
    await modal.getByPlaceholder('Free text').last().fill('Top 10 write off check');
    await modal.locator('button:has-text("Submit")').last().click();
    await modal.locator('button:has-text("✕")').click();

    await setPersona(page, 'Reviewer 1 PSB');
    await page.locator('nav ul li button', { hasText: 'List of Debtors' }).click();
    await page.locator('table tbody tr', { hasText: debtorName }).first().locator('button').click();
    const reviewerModal = page.locator('div.fixed.inset-0.z-50');
    await reviewerModal.locator('button:has-text("Support")').click();
    await expect(reviewerModal.locator('span', { hasText: 'Supported' }).first()).toBeVisible();
    await reviewerModal.locator('button:has-text("✕")').click();
  };

  await writeOffAndSupport(smallerDebtor, '1000');
  await writeOffAndSupport(biggerDebtor, '30000');

  await setPersona(page, 'Finance Officer');
  await page.locator('nav ul li button', { hasText: 'Call for Return Period' }).click();
  await page.click('button:has-text("+ New")');
  const periodModal = page.locator('div.fixed.inset-0.z-50');
  await periodModal.locator('input').first().fill('SMOKE-TOP10-WRITEOFF-PERIOD');
  const dateInputs = periodModal.locator('input[type=date]');
  await dateInputs.nth(0).fill('2026-01-01');
  await dateInputs.nth(1).fill('2030-01-01');
  await periodModal.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);

  await setPersona(page, 'Branch Rep PSB');
  await gotoTabExact(page, 'Top 10 Written Off');
  await expect(page.locator('table thead th')).toContainText([
    'Status', 'SB/Dept', 'Name of Debtor', 'Nature of Arrears', 'Description',
    'Amount of Write Off', 'Days in Arrears', 'Reasons for write off',
  ]);

  const names = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
  expect(names.some((n) => n.trim() === smallerDebtor)).toBe(true);
  expect(names.some((n) => n.trim() === biggerDebtor)).toBe(true);
  // Sorted by write-off amount descending — the bigger one comes first.
  expect(names[0].trim()).toBe(biggerDebtor);

  const rowCount = await page.locator('table tbody tr').count();
  expect(rowCount).toBeLessThanOrEqual(10);
});
