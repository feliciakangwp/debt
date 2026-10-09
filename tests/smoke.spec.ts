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

test('Branch Rep can create and submit a debt record end to end, with a Head as Reviewer 1', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Branch Rep PSB');
  await gotoDebtRecords(page);

  await page.click('button:has-text("+ New")');
  const modal = page.locator('div.fixed.inset-0.z-50');
  await modal.locator('input[placeholder="Free text"]').first().fill('CI Smoke Test Co');
  await modal.locator('input[type=text]').first().fill('1000');
  await modal.locator('input[type=date]').first().fill('2025-01-01');

  // Reviewer 1 = a Head needs no Reviewer 2, and Save should still be
  // disabled until a Reviewer 1 is picked at all.
  const saveBtn = modal.locator('button:has-text("Save")');
  await expect(saveBtn).toBeDisabled();
  const selects = modal.locator('select');
  await selects.nth(3).selectOption({ label: 'Head PSB' });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
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

  // Head PSB, as the named Reviewer 1, sees it and can approve it straight
  // to Supported — no Reviewer 2 needed since Reviewer 1 is already a Head.
  await setPersona(page, 'Head PSB');
  await gotoDebtRecords(page);
  const headRow = await findRowAcrossPages(page, 'CI Smoke Test Co');
  await headRow.locator('input[type=checkbox]').check();
  await page.click('button:has-text("Approve")');
  await page.waitForTimeout(200);
  const approvedRow = await findRowAcrossPages(page, 'CI Smoke Test Co');
  await expect(approvedRow.locator('text=Supported')).toBeVisible();
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

test('Debt record approval: both a Head and a DY Head approve straight to Supported; Reviewer 2 never acts', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Branch Rep TIB');
  await gotoDebtRecords(page);

  const createRecord = async (name: string, reviewer1: string, reviewer2?: string) => {
    await page.click('button:has-text("+ New")');
    const modal = page.locator('div.fixed.inset-0.z-50');
    await modal.locator('input[placeholder="Free text"]').first().fill(name);
    await modal.locator('input[type=text]').first().fill('750');
    await modal.locator('input[type=date]').first().fill('2025-01-01');
    const selects = modal.locator('select');
    await selects.nth(3).selectOption({ label: reviewer1 });
    if (reviewer2) await selects.nth(4).selectOption({ label: reviewer2 });
    await modal.locator('button:has-text("Save")').click();
    await page.waitForTimeout(200);
  };

  await createRecord('CI Direct Head Co', 'Head TIB');
  await createRecord('CI DY Head Co', 'DY Head TIB', 'Head TIB');

  for (const name of ['CI Direct Head Co', 'CI DY Head Co']) {
    const row = await findRowAcrossPages(page, name);
    await row.locator('input[type=checkbox]').check();
  }
  await page.click('button:has-text("Submit")');
  await page.waitForTimeout(200);

  // Head TIB approves the direct one straight to Supported.
  await setPersona(page, 'Head TIB');
  await gotoDebtRecords(page);
  const directRow = await findRowAcrossPages(page, 'CI Direct Head Co');
  await expect(directRow.locator('text=Pending Review')).toBeVisible();
  await directRow.locator('input[type=checkbox]').check();
  await page.click('button:has-text("Approve")');
  await page.waitForTimeout(200);
  const directRowAfter = await findRowAcrossPages(page, 'CI Direct Head Co');
  await expect(directRowAfter.locator('text=Supported')).toBeVisible();

  // Head TIB is only Reviewer 2 on the DY Head record — informational only,
  // never part of the active approval chain — so it's not approvable by
  // them, now or after DY Head TIB (the actual Reviewer 1) approves it.
  const dyHeadRowForHead = await findRowAcrossPages(page, 'CI DY Head Co');
  await expect(dyHeadRowForHead.locator('input[type=checkbox]')).toHaveCount(0);

  // DY Head TIB, the record's actual Reviewer 1, approves it — straight to
  // Supported, same as a Head would, with no intermediate step for
  // Reviewer 2 to act on.
  await setPersona(page, 'DY Head TIB');
  await gotoDebtRecords(page);
  const dyHeadRow = await findRowAcrossPages(page, 'CI DY Head Co');
  await dyHeadRow.locator('input[type=checkbox]').check();
  await page.click('button:has-text("Approve")');
  await page.waitForTimeout(200);
  const dyHeadRowAfter = await findRowAcrossPages(page, 'CI DY Head Co');
  await expect(dyHeadRowAfter.locator('text=Supported')).toBeVisible();

  // Head TIB, still only tagged as Reviewer 2, has nothing to approve now
  // that it's Supported either.
  await setPersona(page, 'Head TIB');
  await gotoDebtRecords(page);
  const dyHeadRowForHead2 = await findRowAcrossPages(page, 'CI DY Head Co');
  await expect(dyHeadRowForHead2.locator('input[type=checkbox]')).toHaveCount(0);
});

test('List of Debt Records only shows records the viewer is tagged on as Assigned To, Reviewer 1 or Reviewer 2', async ({ page }) => {
  await page.goto('/');

  // Lim Wee Keng (PSB) is seeded with Head PSB as Reviewer 1 and no
  // Reviewer 2 — so only Branch Rep PSB (Assigned To) and Head PSB
  // (Reviewer 1) should see it, not DY Head PSB or another branch's Head.
  await setPersona(page, 'Head TIB');
  await gotoDebtRecords(page);
  const namesForHeadTib = new Set(await collectAcrossPages(page, 'table tbody tr td:nth-child(4)'));
  expect(namesForHeadTib.has('Lim Wee Keng')).toBe(false);

  await setPersona(page, 'DY Head PSB');
  await gotoDebtRecords(page);
  const namesForDyHeadPsb = new Set(await collectAcrossPages(page, 'table tbody tr td:nth-child(4)'));
  expect(namesForDyHeadPsb.has('Lim Wee Keng')).toBe(false);

  await setPersona(page, 'Head PSB');
  await gotoDebtRecords(page);
  const namesForHeadPsb = new Set(await collectAcrossPages(page, 'table tbody tr td:nth-child(4)'));
  expect(namesForHeadPsb.has('Lim Wee Keng')).toBe(true);

  await setPersona(page, 'Branch Rep PSB');
  await gotoDebtRecords(page);
  const namesForBranchRep = new Set(await collectAcrossPages(page, 'table tbody tr td:nth-child(4)'));
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

  // Before any CFR submit, the CFR status must still read Draft here — it's
  // a separate approval process from the Debt Record's own status.
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

test('Reports tab auto-generates once a period closes, scoped per branch and consolidated for (Fin)', async ({ page }) => {
  await page.goto('/');

  await setPersona(page, 'DY Head FIN');
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
  await setPersona(page, 'DY Head FIN');
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

test('seed data covers every branch with 20 debt records each, including TIB, SIB and FIN', async ({ page }) => {
  await page.goto('/');

  for (const branch of ['PSB', 'TIB', 'SIB', 'PCB', 'FIN']) {
    await setPersona(page, `Branch Rep ${branch}`);
    await gotoDebtRecords(page);
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
  await gotoDebtRecords(page);
  await expect(page.locator('main')).not.toContainText('OLD CACHED DEBTOR');
  const names = new Set(await collectAcrossPages(page, 'table tbody tr button'));
  expect(names.size).toBe(20);
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

test('Write Off on a debt record goes Branch Rep submits -> Pending -> its named Reviewer 1 supports -> Supported, then locks', async ({ page }) => {
  await page.goto('/');

  // Chandra Sekaran (TIB) is seeded with DY Head TIB as Reviewer 1 and Head
  // TIB as Reviewer 2 — Head TIB can see the record (tagged as Reviewer 2)
  // but only DY Head TIB, the actual Reviewer 1, can Support its write-off.
  const debtorName = 'Chandra Sekaran';

  await setPersona(page, 'Branch Rep TIB');
  await gotoDebtRecords(page);
  const modal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(modal);
  await expect(modal.locator('label', { hasText: 'Write Off' }).first()).toBeVisible();
  await modal.getByRole('button', { name: 'Write Off', exact: true }).click();

  // Pick a write-off date comfortably after today so Days in Arrears (from
  // the earliest arrear on record) comes out positive. Write off the full
  // $45,000 balance — the write-off amount can never exceed what's still
  // outstanding.
  await modal.locator('input[type=date]').fill('2029-06-01');
  await modal.locator('input[type=number]').fill('45000');
  const daysBox = modal.locator('div.bg-slate-100');
  await expect(daysBox).not.toHaveText('No arrears on record');
  const daysText = (await daysBox.innerText()).trim();
  expect(Number(daysText)).toBeGreaterThan(0);
  await modal.getByPlaceholder('Free text').last().fill('Debtor untraceable, exhausted all recovery options');

  const submitBtn = modal.getByRole('button', { name: 'Submit', exact: true });
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();
  await expect(modal.locator('span', { hasText: 'Request Write Off' }).first()).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Write Off', exact: true })).toBeHidden();
  await modal.locator('button:has-text("✕")').click();

  // Head TIB is tagged on the record (Reviewer 2) and can see the write-off,
  // but can't act on it — only the record's actual Reviewer 1 can.
  await setPersona(page, 'Head TIB');
  await gotoDebtRecords(page);
  const headModal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(headModal);
  await expect(headModal.locator('span', { hasText: 'Request Write Off' }).first()).toBeVisible();
  await expect(headModal.locator('button:has-text("Support")')).toBeHidden();
  await headModal.locator('button:has-text("✕")').click();

  // DY Head TIB, the record's named Reviewer 1, supports it.
  await setPersona(page, 'DY Head TIB');
  await gotoDebtRecords(page);
  const reviewerModal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(reviewerModal);
  await reviewerModal.locator('button:has-text("Support")').click();
  await expect(reviewerModal.locator('span', { hasText: 'Supported' }).first()).toBeVisible();
  await reviewerModal.locator('button:has-text("✕")').click();

  // The full balance was written off, so there's nothing left to write off
  // and no Write Off button — a repeat write-off is only offered while a
  // balance remains (covered by the knock-off/repeat test below).
  await setPersona(page, 'Branch Rep TIB');
  await gotoDebtRecords(page);
  const finalModal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(finalModal);
  await expect(finalModal.getByRole('button', { name: 'Write Off', exact: true })).toBeHidden();
  await expect(finalModal.locator('span', { hasText: 'Supported' }).first()).toBeVisible();
  await expect(finalModal).toContainText('fully written off');
});

test('Reviewer 1 can reject a Request Write Off, sending it back to To Be Written Off and still editable', async ({ page }) => {
  await page.goto('/');

  // Nurul Huda (SIB) is seeded with DY Head SIB as Reviewer 1.
  const debtorName = 'Nurul Huda';

  await setPersona(page, 'Branch Rep SIB');
  await gotoDebtRecords(page);
  const modal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(modal);
  await modal.getByRole('button', { name: 'Write Off', exact: true }).click();
  await modal.locator('input[type=date]').fill('2027-04-01');
  await modal.locator('input[type=number]').fill('2200');
  await modal.getByPlaceholder('Free text').last().fill('Reject check');
  await modal.locator('button:has-text("Submit")').last().click();
  await expect(modal.locator('span', { hasText: 'Request Write Off' }).first()).toBeVisible();
  await modal.locator('button:has-text("✕")').click();

  await setPersona(page, 'DY Head SIB');
  await gotoDebtRecords(page);
  const reviewerModal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(reviewerModal);
  await reviewerModal.locator('button:has-text("Reject")').click();
  await expect(reviewerModal.locator('span', { hasText: 'To Be Written Off' }).first()).toBeVisible();
  await reviewerModal.locator('button:has-text("✕")').click();

  // Back to To Be Written Off: Branch Rep can edit and resubmit it.
  await setPersona(page, 'Branch Rep SIB');
  await gotoDebtRecords(page);
  const afterRejectModal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(afterRejectModal);
  await expect(afterRejectModal.locator('span', { hasText: 'To Be Written Off' }).first()).toBeVisible();
  await expect(afterRejectModal.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
});

test('Debt record popup shows the Reviewers section, already filled in, for Draft, Pending Review and Supported lines', async ({ page }) => {
  await page.goto('/');
  await setPersona(page, 'Branch Rep PSB');
  await gotoDebtRecords(page);

  // Draft: Koh Teck Whye — Reviewer 1 = DY Head PSB, Reviewer 2 = Head PSB.
  const draftRow = page.locator('table tbody tr', { hasText: 'Koh Teck Whye' }).first();
  await draftRow.locator('button').click();
  const draftModal = page.locator('div.fixed.inset-0.z-50');
  await expect(draftModal.locator('label', { hasText: 'Reviewers' })).toBeVisible();
  const draftSelects = draftModal.locator('select');
  await expect(draftSelects.nth(3)).toHaveValue('DY_HEAD_PSB');
  await expect(draftSelects.nth(4)).toHaveValue('HEAD_PSB');
  await draftModal.locator('button:has-text("Cancel")').click();

  // Pending Review: Ravi Chandran — Reviewer 1 = Head PSB, no Reviewer 2.
  const pendingRow = page.locator('table tbody tr', { hasText: 'Ravi Chandran' }).first();
  await pendingRow.locator('button').click();
  const pendingModal = page.locator('div.fixed.inset-0.z-50');
  const pendingSelects = pendingModal.locator('select');
  await expect(pendingSelects.nth(3)).toHaveValue('HEAD_PSB');
  await pendingModal.locator('button:has-text("Cancel")').click();

  // Supported: Lim Wee Keng — Reviewer 1 = Head PSB — now shown read-only
  // in the Debtor Details popup (not just the edit form).
  const supportedModal = await openDebtorByName(page, 'Lim Wee Keng');
  await expect(supportedModal.locator('label', { hasText: 'Reviewers' })).toBeVisible();
  await expect(supportedModal).toContainText('Branch Rep PSB');
  await expect(supportedModal).toContainText('Head PSB');
  await supportedModal.locator('button:has-text("✕")').click();
});

test('Case Reference is locked once Supported — only Request to Edit (approved by the record\'s Reviewer 1) can change it', async ({ page }) => {
  await page.goto('/');

  // Lim Wee Keng (PSB) is seeded with Head PSB as Reviewer 1.
  const debtorName = 'Lim Wee Keng';

  await setPersona(page, 'Branch Rep PSB');
  await gotoDebtRecords(page);
  const modal = await openDebtorByName(page, debtorName);
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

  await setPersona(page, 'Head PSB');
  await gotoDebtRecords(page);
  const reviewerModal = await openDebtorByName(page, debtorName);
  await expect(reviewerModal).toContainText(originalCaseReference);
  await expect(reviewerModal).toContainText('CI-CASE-REF-999');
  await reviewerModal.locator('button:has-text("Approve")').click();
  await page.waitForTimeout(200);

  await setPersona(page, 'Branch Rep PSB');
  await gotoDebtRecords(page);
  const finalModal = await openDebtorByName(page, debtorName);
  await expect(finalModal).toContainText('CI-CASE-REF-999');
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

test('Write Off Save keeps it editable as To Be Written Off, visible only to tagged personas on the Debt Management tab', async ({ page }) => {
  await page.goto('/');

  // Chua Beng Huat (SIB) is seeded with Head SIB as Reviewer 1 and no
  // Reviewer 2 — so only Branch Rep SIB (Assigned To) and Head SIB
  // (Reviewer 1) are tagged on it, not DY Head SIB.
  const debtorName = 'Chua Beng Huat';

  await setPersona(page, 'Branch Rep SIB');
  await gotoDebtRecords(page);
  const modal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(modal);
  await modal.getByRole('button', { name: 'Write Off', exact: true }).click();
  await modal.locator('input[type=date]').fill('2027-03-01');
  await modal.locator('input[type=number]').fill('2000');
  await modal.getByPlaceholder('Free text').last().fill('Saved as draft first');
  await modal.locator('button:has-text("Save"):not([disabled])').click();

  await expect(modal.locator('span', { hasText: 'To Be Written Off' }).first()).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await modal.locator('button:has-text("✕")').click();

  const toBeWrittenOffHeaders = [
    'Status', 'SB/Dept', 'Name of Debtor', 'Nature of Arrears', 'Description',
    'Amount to be Written off', 'Days in Arrears', 'Reason for Write off',
  ];

  // Shows up in the new "To Be Written Off" Debt Management tab for the two
  // personas actually tagged on the record.
  for (const persona of ['Branch Rep SIB', 'Head SIB']) {
    await setPersona(page, persona);
    await page.getByRole('button', { name: 'To Be Written Off', exact: true }).click();
    await expect(page.locator('table thead th')).toContainText(toBeWrittenOffHeaders);
    const names = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
    expect(names.some((n) => n.trim() === debtorName), `${persona} should see ${debtorName}`).toBe(true);
  }

  // DY Head SIB isn't tagged on this record (not Assigned To, Reviewer 1 or
  // Reviewer 2), so it's not on their To Be Written Off tab.
  await setPersona(page, 'DY Head SIB');
  await page.getByRole('button', { name: 'To Be Written Off', exact: true }).click();
  const namesForDyHead = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
  expect(namesForDyHead.some((n) => n.trim() === debtorName)).toBe(false);

  // Finance Officer sees it on the cross-branch "(FIN) To Be Written Off"
  // tab instead, regardless of tagging.
  await setPersona(page, 'Finance Officer');
  await page.getByRole('button', { name: '(FIN) To Be Written Off', exact: true }).click();
  const namesForFinance = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
  expect(namesForFinance.some((n) => n.trim() === debtorName)).toBe(true);

  // Submitting from the read-only summary (without reopening the form)
  // moves it to Request Write Off — still shown on the To Be Written Off
  // tab, which merges both pre-approval statuses together.
  await setPersona(page, 'Branch Rep SIB');
  await gotoDebtRecords(page);
  const modal2 = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(modal2);
  await modal2.locator('button:has-text("Submit")').click();
  await expect(modal2.locator('span', { hasText: 'Request Write Off' }).first()).toBeVisible();
  await modal2.locator('button:has-text("✕")').click();

  await page.getByRole('button', { name: 'To Be Written Off', exact: true }).click();
  const namesAfter = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
  expect(namesAfter.some((n) => n.trim() === debtorName)).toBe(true);
});

test('a Supported write-off knocks the amount off Total in Arrears, appears on the Write Off tab and ledger, and can repeat', async ({ page }) => {
  await page.goto('/');

  // Devi Krishnan (PCB) is seeded with DY Head PCB as Reviewer 1 and a
  // single $15,000 AR entry, overdue by a few months.
  const debtorName = 'Devi Krishnan';

  await setPersona(page, 'Branch Rep PCB');
  await gotoDebtRecords(page);
  const modal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(modal);
  await modal.getByRole('button', { name: 'Write Off', exact: true }).click();
  await modal.locator('input[type=date]').fill('2027-02-01');
  await modal.locator('input[type=number]').fill('1500');
  await modal.getByPlaceholder('Free text').last().fill('Ledger and knock-off check');
  await modal.locator('button:has-text("Submit")').last().click();
  await modal.locator('button:has-text("✕")').click();

  await setPersona(page, 'DY Head PCB');
  await gotoDebtRecords(page);
  const reviewerModal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(reviewerModal);
  await reviewerModal.locator('button:has-text("Support")').click();
  await expect(reviewerModal.locator('span', { hasText: 'Supported' }).first()).toBeVisible();

  // Ledger shows the Arrears entry plus the Write Off row that knocked it down.
  const ledgerText = await reviewerModal.locator('table').last().innerText();
  expect(ledgerText).toContain('Arrears');
  expect(ledgerText).toContain('Write Off');
  await reviewerModal.locator('button:has-text("✕")').click();

  // List of Debt Records' Amount column reflects the knock-off: 15,000 -
  // 1,500 = 13,500.
  const headers = (await page.locator('table thead th').allTextContents()).map((h) => h.replace('⇅', '').trim());
  const amountColIdx = headers.indexOf('Amount');
  const row = page.locator('table tbody tr', { hasText: debtorName }).first();
  const amountAfter = (await row.locator('td').nth(amountColIdx).innerText()).trim();
  expect(amountAfter).toBe('$13,500');

  // Shows up on the "Written Off" tab now that it's Supported (DY Head PCB
  // is tagged on this record as Reviewer 1).
  await page.getByRole('button', { name: 'Written Off', exact: true }).first().click();
  await expect(
    page.locator('table thead th'),
  ).toContainText(['Status', 'SB/Dept', 'Name of Debtor', 'Nature of Arrears', 'Description', 'Amount of Write off', 'Days in Arrears', 'Reason for Write off']);
  const rowNames = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
  expect(rowNames.some((n) => n.trim() === debtorName)).toBe(true);

  // Write-off is repeatable: with $13,500 still outstanding, Branch Rep sees
  // the "Write Off" button again (not locked out just because one write-off
  // was already Supported), and a write-off history entry for the first one.
  await setPersona(page, 'Branch Rep PCB');
  await gotoDebtRecords(page);
  const repeatModal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(repeatModal);
  await expect(repeatModal.getByRole('button', { name: 'Write Off', exact: true })).toBeVisible();
  await expect(repeatModal).toContainText('$1,500');
  await repeatModal.locator('button:has-text("✕")').click();
});

test('Debt Management Written Off tab is scoped to tagged personas, with a cross-branch (FIN) copy for Finance', async ({ page }) => {
  await page.goto('/');

  // Devi Krishnan (PCB) — Reviewer 1 is DY Head PCB, Reviewer 2 is Head PCB
  // (mandatory, since Reviewer 1 is a DY Head).
  const debtorName = 'Devi Krishnan';

  await setPersona(page, 'Branch Rep PCB');
  await gotoDebtRecords(page);
  const modal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(modal);
  await modal.getByRole('button', { name: 'Write Off', exact: true }).click();
  await modal.locator('input[type=date]').fill('2027-05-01');
  await modal.locator('input[type=number]').fill('1200');
  await modal.getByPlaceholder('Free text').last().fill('FIN written off visibility check');
  await modal.locator('button:has-text("Submit")').last().click();
  await modal.locator('button:has-text("✕")').click();

  await setPersona(page, 'DY Head PCB');
  await gotoDebtRecords(page);
  const reviewerModal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(reviewerModal);
  await reviewerModal.locator('button:has-text("Support")').click();
  await expect(reviewerModal.locator('span', { hasText: 'Supported' }).first()).toBeVisible();
  await reviewerModal.locator('button:has-text("✕")').click();

  const writtenOffHeaders = [
    'Status', 'SB/Dept', 'Name of Debtor', 'Nature of Arrears', 'Description',
    'Amount of Write off', 'Days in Arrears', 'Reason for Write off',
  ];

  // Branch Rep PCB (Assigned To) and Head PCB (Reviewer 2, informational
  // only but still tagged) both see it on the Written Off tab.
  for (const persona of ['Branch Rep PCB', 'Head PCB']) {
    await setPersona(page, persona);
    await page.getByRole('button', { name: 'Written Off', exact: true }).first().click();
    await expect(page.locator('table thead th')).toContainText(writtenOffHeaders);
    const names = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
    expect(names.some((n) => n.trim() === debtorName), `${persona} should see ${debtorName}`).toBe(true);
  }

  // A DY Head of another branch isn't tagged on this record, so it isn't on
  // their Written Off tab.
  await setPersona(page, 'DY Head PSB');
  await page.getByRole('button', { name: 'Written Off', exact: true }).first().click();
  const namesForBystander = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
  expect(namesForBystander.some((n) => n.trim() === debtorName)).toBe(false);

  // Finance Officer sees it on the cross-branch "(FIN) Written Off" tab
  // regardless of tagging.
  await setPersona(page, 'Finance Officer');
  await page.getByRole('button', { name: '(FIN) Written Off', exact: true }).click();
  const namesForFinance = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
  expect(namesForFinance.some((n) => n.trim() === debtorName)).toBe(true);
});

test('Written Off and To be Written Off Call For Return tabs pull from Debt Management write-offs and go through Submit -> Approve -> Approve', async ({ page }) => {
  await page.goto('/');

  // Chua Beng Huat (SIB) — Reviewer 1 is Head SIB — gets a fully Supported
  // write-off.
  const supportedDebtor = 'Chua Beng Huat';
  await setPersona(page, 'Branch Rep SIB');
  await gotoDebtRecords(page);
  let modal = await openDebtorByName(page, supportedDebtor);
  await openWriteOffsTab(modal);
  await modal.getByRole('button', { name: 'Write Off', exact: true }).click();
  await modal.locator('input[type=date]').fill('2027-01-01');
  await modal.locator('input[type=number]').fill('4000');
  await modal.getByPlaceholder('Free text').last().fill('CFR written off check');
  await modal.locator('button:has-text("Submit")').last().click();
  await modal.locator('button:has-text("✕")').click();

  await setPersona(page, 'Head SIB');
  await gotoDebtRecords(page);
  modal = await openDebtorByName(page, supportedDebtor);
  await openWriteOffsTab(modal);
  await modal.locator('button:has-text("Support")').click();
  await expect(modal.locator('span', { hasText: 'Supported' }).first()).toBeVisible();
  await modal.locator('button:has-text("✕")').click();

  // Nurul Huda (SIB) — Reviewer 1 is DY Head SIB — gets a To Be Written Off
  // (saved, not yet submitted) write-off.
  const toBeDebtor = 'Nurul Huda';
  await setPersona(page, 'Branch Rep SIB');
  await gotoDebtRecords(page);
  modal = await openDebtorByName(page, toBeDebtor);
  await openWriteOffsTab(modal);
  await modal.getByRole('button', { name: 'Write Off', exact: true }).click();
  await modal.locator('input[type=date]').fill('2026-12-01');
  await modal.locator('input[type=number]').fill('5000');
  await modal.getByPlaceholder('Free text').last().fill('CFR to-be-written-off check');
  await modal.locator('button:has-text("Save"):not([disabled])').click();
  await expect(modal.locator('span', { hasText: 'To Be Written Off' }).first()).toBeVisible();
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
  // nth=1: nth=0 is now Debt Management's own "Written Off" tab, which sits
  // before the Call For Return section in the sidebar.
  await gotoTabExact(page, 'Written Off', 1);
  await expect(page.locator('table thead th')).toContainText(writtenOffHeaders);
  let names = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
  expect(names.some((n) => n.trim() === supportedDebtor)).toBe(true);

  await gotoTabExact(page, 'To be Written Off');
  await expect(page.locator('table thead th')).toContainText(toBeWrittenOffHeaders);
  names = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
  expect(names.some((n) => n.trim() === toBeDebtor)).toBe(true);

  // Submit -> Approve -> Approve, same as every other CFR report tab — one
  // submission per branch per period, shared across all of that branch's
  // report tabs (including this one). This is the role-based CFR Arrears
  // Submission workflow (DY Head then Head of the branch), independent of
  // which specific personas are tagged as Reviewer 1/2 on individual debt
  // records.
  await page.click('button:has-text("Submit")');
  await page.waitForTimeout(200);
  await expect(page.locator('main').getByText('Pending Review', { exact: true }).first()).toBeVisible();

  await setPersona(page, 'DY Head SIB');
  await gotoTabExact(page, 'To be Written Off');
  await page.click('button:has-text("Approve")');
  await page.waitForTimeout(200);
  await expect(page.locator('main').getByText('Supported', { exact: true }).first()).toBeVisible();

  await setPersona(page, 'Head SIB');
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

test('List of Debt Records Status column shows only one status — a write-off in flight takes over from the debtor status', async ({ page }) => {
  await page.goto('/');

  // Lim Wee Keng (PSB) — Reviewer 1 is Head PSB.
  await setPersona(page, 'Branch Rep PSB');
  await gotoDebtRecords(page);
  const debtorName = 'Lim Wee Keng';
  const row = page.locator('table tbody tr', { hasText: debtorName }).first();
  await expect(row.locator('td').nth(2)).toContainText('Supported');

  const modal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(modal);
  await modal.getByRole('button', { name: 'Write Off', exact: true }).click();
  await modal.locator('input[type=date]').fill('2027-01-01');
  await modal.locator('input[type=number]').fill('1000');
  await modal.getByPlaceholder('Free text').last().fill('List status check');
  await modal.locator('button:has-text("Save"):not([disabled])').click();
  await modal.locator('button:has-text("✕")').click();
  await page.waitForTimeout(150);

  // Saved (not yet submitted): the list shows only "To Be Written Off" now —
  // not "Supported" too.
  const statusCell = row.locator('td').nth(2);
  await expect(statusCell).toContainText('To Be Written Off');
  await expect(statusCell).not.toContainText('Supported');

  const modal2 = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(modal2);
  await modal2.locator('button:has-text("Submit")').click();
  await modal2.locator('button:has-text("✕")').click();
  await page.waitForTimeout(150);

  // Submitted: only "Request Write Off" shows.
  await expect(statusCell).toContainText('Request Write Off');
  await expect(statusCell).not.toContainText('To Be Written Off');
  await expect(statusCell).not.toContainText('Supported');

  await setPersona(page, 'Head PSB');
  await gotoDebtRecords(page);
  const reviewerRow = page.locator('table tbody tr', { hasText: debtorName }).first();
  const reviewerModal = await openDebtorByName(page, debtorName);
  await openWriteOffsTab(reviewerModal);
  await reviewerModal.locator('button:has-text("Support")').click();
  await reviewerModal.locator('button:has-text("✕")').click();
  await page.waitForTimeout(150);

  // Approved: nothing left in flight, so the debtor's own status shows again.
  const reviewerStatusCell = reviewerRow.locator('td').nth(2);
  await expect(reviewerStatusCell).toContainText('Supported');
  await expect(reviewerStatusCell).not.toContainText('To Be Written Off');
  await expect(reviewerStatusCell).not.toContainText('Request Write Off');
});

test('Top 10 Written Off Call For Return tab pulls Supported write-offs, sorted by amount, capped at 10', async ({ page }) => {
  await page.goto('/');

  // Lim Wee Keng (PSB, Reviewer 1 = Head PSB) and Chong Siew Fong (PSB,
  // Reviewer 1 = DY Head PSB) each get a Supported write-off, approved by
  // their own named Reviewer 1.
  const smallerDebtor = { name: 'Lim Wee Keng', reviewer: 'Head PSB' };
  const biggerDebtor = { name: 'Chong Siew Fong', reviewer: 'DY Head PSB' };

  const writeOffAndSupport = async (debtorName: string, reviewer: string, amount: string) => {
    await setPersona(page, 'Branch Rep PSB');
    await gotoDebtRecords(page);
    const modal = await openDebtorByName(page, debtorName);
    await openWriteOffsTab(modal);
    await modal.getByRole('button', { name: 'Write Off', exact: true }).click();
    await modal.locator('input[type=date]').fill('2027-01-01');
    await modal.locator('input[type=number]').fill(amount);
    await modal.getByPlaceholder('Free text').last().fill('Top 10 write off check');
    await modal.locator('button:has-text("Submit")').last().click();
    await modal.locator('button:has-text("✕")').click();

    await setPersona(page, reviewer);
    await gotoDebtRecords(page);
    const reviewerModal = await openDebtorByName(page, debtorName);
    await openWriteOffsTab(reviewerModal);
    await reviewerModal.locator('button:has-text("Support")').click();
    await expect(reviewerModal.locator('span', { hasText: 'Supported' }).first()).toBeVisible();
    await reviewerModal.locator('button:has-text("✕")').click();
  };

  await writeOffAndSupport(smallerDebtor.name, smallerDebtor.reviewer, '1000');
  await writeOffAndSupport(biggerDebtor.name, biggerDebtor.reviewer, '30000');

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
  expect(names.some((n) => n.trim() === smallerDebtor.name)).toBe(true);
  expect(names.some((n) => n.trim() === biggerDebtor.name)).toBe(true);
  // Sorted by write-off amount descending — the bigger one comes first.
  expect(names[0].trim()).toBe(biggerDebtor.name);

  const rowCount = await page.locator('table tbody tr').count();
  expect(rowCount).toBeLessThanOrEqual(10);
});
