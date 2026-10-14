// A handful of smoke tests act directly on specific named seed debtors
// (write-offs, approvals, payments, case-reference edits) instead of
// creating new rows, so cleanup-test-data.mjs's name-prefix delete never
// touches them and they drift further from their original seeded state
// every time the suite runs. This restores exactly those debtors — and
// only them — back to the values in database/supabase_setup.sql. Run once
// after the whole CI suite finishes, as a backstop; tests/smoke.spec.ts
// also resets them before every individual test, since several tests
// reuse the same named debtor and resetting only at the end of a run
// isn't enough to stop one test's mutation breaking a later test in the
// same run.
import { resetSeedDebtors } from './lib/seedDebtors.mjs';

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

if (!email || !password) {
  console.log('TEST_USER_EMAIL/TEST_USER_PASSWORD not set — skipping named-seed-debtor reset.');
  process.exit(0);
}

resetSeedDebtors({ email, password })
  .then((names) => {
    console.log(`Reset ${names.length} named seed debtor(s) to their original values: ${names.join(', ')}`);
  })
  .catch((err) => {
    console.error('Named-seed-debtor reset failed:', err);
    process.exit(1);
  });
