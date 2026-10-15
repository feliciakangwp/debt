import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const PERSONAS = [
  'Branch Rep PSB', 'Branch Rep TIB', 'Branch Rep SIB', 'Branch Rep PCB', 'Branch Rep FIN',
  'Head PSB', 'Head TIB', 'Head SIB', 'Head PCB', 'Head FIN',
  'DY Head PSB', 'DY Head TIB', 'DY Head SIB', 'DY Head PCB', 'DY Head FIN',
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
// Debt Management's own Written Off / To Be Written Off tabs — capital "Be"
// distinguishes them from the Call For Return section's own "To be Written
// Off" tab (lowercase "be"), which is a separate, unrelated workflow.
const WRITE_OFF_TABS = ['Written Off', 'To Be Written Off'];
const FIN_WRITE_OFF_TABS = ['(FIN) Written Off', '(FIN) To Be Written Off'];
const FIN_DEBTOR_LIST_TAB = '(FIN) List of Debt Records';

// Nav order is fixed in Sidebar.tsx; each persona sees a subset of it.
// "Debtors Report" is reachable by both audiences: operational roles see
// their own branch, the finance team sees every branch on the same tab.
function expectedTabsFor(persona: string): string[] {
  const isFinanceOfficer = persona === 'Finance Officer';
  const isSuperAdminPersona = persona === 'Super Admin';
  const isFinBranchHeadOrDyHead = persona.endsWith('FIN') && persona !== 'Branch Rep FIN' && !isFinanceOfficer;

  if (isSuperAdminPersona || isFinBranchHeadOrDyHead) {
    return [
      'List of Debt Records', FIN_DEBTOR_LIST_TAB, 'Debtors Report', 'Arrears Report',
      ...WRITE_OFF_TABS, '(Fin) Arrears Report', ...FIN_WRITE_OFF_TABS, 'Nature of Arrears', 'Description',
      ...CFR_FIN_TABS, ...CFR_TABS,
    ];
  }
  if (isFinanceOfficer) {
    return [
      FIN_DEBTOR_LIST_TAB, 'Debtors Report', '(Fin) Arrears Report', ...FIN_WRITE_OFF_TABS,
      'Nature of Arrears', 'Description', ...CFR_FIN_TABS,
    ];
  }
  return ['List of Debt Records', 'Debtors Report', 'Arrears Report', ...WRITE_OFF_TABS, ...CFR_TABS];
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

async function gotoDebtRecords(page: Page) {
  await page.locator('nav ul li button', { hasText: 'List of Debt Records' }).click();
  await page.waitForTimeout(150);
}

async function openDebtorByName(page: Page, name: string) {
  await page.locator('table tbody tr', { hasText: name }).first().locator('button').click();
  const modal = page.locator('div.fixed.inset-0.z-50');
  await expect(modal).toBeVisible();
  return modal;
}

/** Same as openDebtorByName, but pages forward first in case the debtor
 * isn't on whichever page the table currently happens to be showing. */
async function openDebtorByNameAcrossPages(page: Page, name: string) {
  const row = await findRowAcrossPages(page, name);
  await row.locator('button').click();
  const modal = page.locator('div.fixed.inset-0.z-50');
  await expect(modal).toBeVisible();
  return modal;
}

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

/** The Debtor Details modal has "Details" / "Write Offs (N)" tabs — the
 * write-off form/summary, its records table, and the transaction ledger all
 * live under the latter, unmounted until it's clicked. The tab's own label
 * ("Write Offs (N)") contains "Write Off" as a substring, so callers must
 * use exact-text matches for the actual "Write Off" action button to avoid
 * matching this tab button too. */
async function openWriteOffsTab(modal: Locator) {
  await modal.locator('button', { hasText: /^Write Offs \(/ }).click();
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

test('Case Reference sits between Description and Amount/Total AR on List of Debt Records, (FIN) List of Debt Records and Debtors Report', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Super Admin');

  const checkBetweenDescriptionAndAmount = async (nextColumnLabel: string) => {
    const headers = (await page.locator('table thead th').allTextContents()).map((h) => h.replace('⇅', '').trim());
    const descIdx = headers.indexOf('Description');
    expect(descIdx, `expected a Description column, got ${headers}`).toBeGreaterThanOrEqual(0);
    expect(headers[descIdx + 1]).toBe('Case Reference');
    expect(headers[descIdx + 2]).toBe(nextColumnLabel);
  };

  await gotoTabExact(page, 'List of Debt Records');
  await checkBetweenDescriptionAndAmount('Amount');

  await page.locator('nav ul li button', { hasText: '(FIN) List of Debt Records' }).click();
  await page.waitForTimeout(150);
  await checkBetweenDescriptionAndAmount('Amount');

  await page.locator('nav ul li button', { hasText: 'Debtors Report' }).click();
  await page.waitForTimeout(150);
  await checkBetweenDescriptionAndAmount('Total AR');
});

test('Case Reference is the last data column on Arrears Report and (Fin) Arrears Report', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Finance Officer');

  await page.locator('nav ul li button', { hasText: '(Fin) Arrears Report' }).click();
  await page.waitForTimeout(150);
  const finLastHeader = (await page.locator('table thead th').last().textContent())?.trim();
  expect(finLastHeader?.startsWith('Case Reference'), '(Fin) Arrears Report last column').toBe(true);

  await setPersona(page, 'Branch Rep PSB');
  await page.locator('nav ul li button', { hasText: 'Arrears Report' }).click();
  await page.waitForTimeout(150);
  const lastHeader = (await page.locator('table thead th').last().textContent())?.trim();
  expect(lastHeader?.startsWith('Case Reference'), 'Arrears Report last column').toBe(true);
});

test('Finance team sees every branch on Debtors Report, branch roles see only their own', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'Finance Officer');
  await page.locator('nav ul li button', { hasText: 'Debtors Report' }).click();
  await page.waitForTimeout(150);
  const financeBranches = new Set(await collectAcrossPages(page, 'table tbody tr td:nth-child(2)'));
  expect(financeBranches.size, 'Finance Officer should see multiple branches').toBeGreaterThan(1);

  await setPersona(page, 'Branch Rep PSB');
  await page.locator('nav ul li button', { hasText: 'Debtors Report' }).click();
  await page.waitForTimeout(150);
  const branchRepBranches = new Set(await collectAcrossPages(page, 'table tbody tr td:nth-child(2)'));
  expect([...branchRepBranches]).toEqual(['PSB']);
});

test('New Debt Record requires Reviewer 1, and Reviewer 2 only when Reviewer 1 is a DY Head', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Branch Rep TIB');
  await gotoDebtRecords(page);

  await page.click('button:has-text("+ New")');
  const modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('input[placeholder="Free text"]').first().fill('CI Reviewer Rule Co');
  await modal.locator('input[type=text]').first().fill('500');
  await modal.locator('input[type=date]').first().fill('2025-01-01');
  const saveBtn = modal.locator('button:has-text("Save")');
  const selects = modal.locator('select');
  const reviewer1Select = selects.nth(3);
  const reviewer2Select = selects.nth(4);

  await expect(saveBtn).toBeDisabled();

  // DY Head as Reviewer 1 makes Reviewer 2 mandatory.
  await reviewer1Select.selectOption({ label: 'DY Head TIB' });
  await expect(reviewer2Select).toBeEnabled();
  await expect(saveBtn).toBeDisabled();
  await reviewer2Select.selectOption({ label: 'Head TIB' });
  await expect(saveBtn).toBeEnabled();

  // Switching Reviewer 1 to a Head clears and disables Reviewer 2 — no
  // longer required — and Save stays enabled.
  await reviewer1Select.selectOption({ label: 'Head TIB' });
  await expect(reviewer2Select).toBeDisabled();
  await expect(reviewer2Select).toHaveValue('');
  await expect(saveBtn).toBeEnabled();

  await modal.locator('button:has-text("Cancel")').click();
});

test('List of Debt Records only shows records the viewer is tagged on as Assigned To, Reviewer 1 or Reviewer 2', async ({ page }) => {
  await page.goto('/');

  // Lim Wee Keng (PSB) is seeded with Head PSB as Reviewer 1 and no
  // Reviewer 2 — so only Branch Rep PSB (Assigned To) and Head PSB
  // (Reviewer 1) should see it, not DY Head PSB or another branch's Head.
  await setPersona(page, 'Head TIB');
  await gotoDebtRecords(page);
  const namesForHeadTib = new Set(await collectAcrossPages(page, 'table tbody tr td:nth-child(3)'));
  expect(namesForHeadTib.has('Lim Wee Keng')).toBe(false);

  await setPersona(page, 'DY Head PSB');
  await gotoDebtRecords(page);
  const namesForDyHeadPsb = new Set(await collectAcrossPages(page, 'table tbody tr td:nth-child(3)'));
  expect(namesForDyHeadPsb.has('Lim Wee Keng')).toBe(false);

  await setPersona(page, 'Head PSB');
  await gotoDebtRecords(page);
  const namesForHeadPsb = new Set(await collectAcrossPages(page, 'table tbody tr td:nth-child(3)'));
  expect(namesForHeadPsb.has('Lim Wee Keng')).toBe(true);

  await setPersona(page, 'Branch Rep PSB');
  await gotoDebtRecords(page);
  const namesForBranchRep = new Set(await collectAcrossPages(page, 'table tbody tr td:nth-child(3)'));
  expect(namesForBranchRep.has('Lim Wee Keng')).toBe(true);
});

test('(FIN) List of Debt Records is a read-only, cross-branch view for Finance Officer and double-hatted Head/DY Head FIN', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'Finance Officer');
  await page.locator('nav ul li button', { hasText: FIN_DEBTOR_LIST_TAB }).click();
  await page.waitForTimeout(150);
  await expect(page.locator('h1')).toHaveText(FIN_DEBTOR_LIST_TAB);
  const branches = new Set(await collectAcrossPages(page, 'table tbody tr td:nth-child(5)'));
  expect(branches.size, 'should span multiple branches').toBeGreaterThan(1);
  await expect(page.locator('button:has-text("+ New")')).toHaveCount(0);
  await expect(page.locator('table thead input[type=checkbox]')).toHaveCount(0);

  // A Head not based in FIN doesn't double-hat as Finance, so no tab at all.
  await setPersona(page, 'Head PSB');
  await expect(page.locator('nav ul li button', { hasText: FIN_DEBTOR_LIST_TAB })).toHaveCount(0);

  // Head FIN double-hats as Finance Officer and gets the tab too.
  await setPersona(page, 'Head FIN');
  await expect(page.locator('nav ul li button', { hasText: FIN_DEBTOR_LIST_TAB })).toBeVisible();
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
  await setPersona(page, 'DY Head FIN');
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

  await setPersona(page, 'DY Head PCB');
  await gotoTabExact(page, 'Arrears');
  await page.click('button:has-text("Approve")');
  await page.waitForTimeout(200);
  await expect(page.locator('main').getByText('Supported', { exact: true }).first()).toBeVisible();

  await setPersona(page, 'Head PCB');
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

  await setPersona(page, 'DY Head FIN');
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

  await setPersona(page, 'DY Head SIB');
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
  await expect(page.locator('main')).toContainText('Rejected by DY Head SIB');
  await expect(page.locator('main')).toContainText('Please recheck the figures');

  // The same rejection notice shows on Top 10 Debtors too, since it's the
  // same underlying submission record.
  await gotoTabExact(page, 'Top 10 Debtors');
  await expect(page.locator('main')).toContainText('Please recheck the figures');
});

test('Export button on every Call For Return / (Fin) Call For Return report tab downloads what is on screen', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'DY Head FIN');
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

test('seed debtors have a Case Reference and a Required Paid Date', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Branch Rep PSB');
  await gotoDebtRecords(page);

  const caseRefs = await collectAcrossPages(page, 'table tbody tr td:nth-child(2)');
  expect(caseRefs.length).toBeGreaterThan(0);
  expect(caseRefs.every((c) => c.trim() !== '' && c.trim() !== '-')).toBe(true);

  const dueDates = await collectAcrossPages(page, 'table tbody tr td:nth-child(9)');
  expect(dueDates.every((d) => d.trim() !== '-')).toBe(true);
});

test('Payments tab: a partial payment keeps Supported, a second payment that clears the balance marks Paid, and Reopen reverses it', async ({ page }) => {
  await page.goto('/');

  // Tay Boon Huat (PSB) is seeded Supported with Head PSB as Reviewer 1 and
  // a single $11,000 AR entry.
  const debtorName = 'Tay Boon Huat';

  await setPersona(page, 'Branch Rep PSB');
  await gotoDebtRecords(page);
  const modal = await openDebtorByNameAcrossPages(page, debtorName);
  await modal.locator('button', { hasText: /^Payments \(/ }).click();

  const dateInput = modal.locator('input[type=date]');
  const amountInput = modal.locator('input[type=number]');
  const submitBtn = modal.getByRole('button', { name: 'Submit', exact: true });

  // An amount bigger than the outstanding balance can't be submitted.
  await dateInput.fill('2027-01-01');
  await amountInput.fill('999999');
  await expect(submitBtn).toBeDisabled();

  // Partial payment of $4,000, leaving $7,000 outstanding.
  await amountInput.fill('4000');
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();
  await expect(modal.locator('td', { hasText: '$4,000' })).toBeVisible();
  await expect(modal.locator('span', { hasText: 'Supported' }).first()).toBeVisible();
  await expect(modal).toContainText('Outstanding balance: $7,000');

  // The field is still available for another payment — pay off the rest.
  await dateInput.fill('2027-02-01');
  await amountInput.fill('7000');
  await submitBtn.click();
  await expect(modal.locator('span', { hasText: 'Paid' }).first()).toBeVisible();
  await expect(modal).toContainText('This debtor has been fully paid off.');
  await modal.locator('button:has-text("✕")').click();

  // List of Debt Records' Amount column and Status both reflect it — a
  // fully knocked-off amount displays as "-", same as every other $0 cell.
  const row = await findRowAcrossPages(page, debtorName);
  await expect(row).toContainText('Paid');
  await expect(row.locator('td').nth(7)).toHaveText('-');

  // Reopening the second payment reverses it — back to Supported with the
  // $7,000 restored, and the reopened line stays visible, marked Voided.
  const reopenModal = await openDebtorByNameAcrossPages(page, debtorName);
  await reopenModal.locator('button', { hasText: /^Payments \(/ }).click();
  const paymentRows = reopenModal.locator('table').first().locator('tbody tr');
  await paymentRows.filter({ hasText: '$7,000' }).locator('button:has-text("Reopen")').click();
  await expect(paymentRows.filter({ hasText: '$7,000' })).toContainText('Voided');
  await expect(reopenModal.locator('span', { hasText: 'Supported' }).first()).toBeVisible();
  await expect(reopenModal).toContainText('Outstanding balance: $7,000');
});

