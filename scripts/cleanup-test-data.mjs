// Deletes the rows the Playwright smoke suite creates in the shared Supabase
// project. Every debtor the tests create is named "CI <something>" and every
// Call for Return period they create is named "SMOKE-<something>" (see
// tests/smoke.spec.ts) — nothing else gets created, so cleanup is scoped to
// exactly those two prefixes and never touches pre-existing/seeded rows.
const SUPABASE_URL = 'https://kjbhexhazwrzdydayubg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lNnosGNwmhuzFIV4B36fAw_-ZOfzcwW';

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

if (!email || !password) {
  console.log('TEST_USER_EMAIL/TEST_USER_PASSWORD not set — skipping test-data cleanup.');
  process.exit(0);
}

async function signIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign-in failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

function idList(rows) {
  return rows.map((r) => `"${r.id}"`).join(',');
}

async function rest(path, headers, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers, ...options });
  const text = await res.text();
  if (!res.ok) throw new Error(`${options.method ?? 'GET'} ${path} failed: ${res.status} ${text}`);
  // PostgREST returns an empty body for DELETE/PATCH/POST under
  // Prefer: return=minimal — status code alone (204 vs 201) isn't a
  // reliable signal of that, so just check whether there's anything to parse.
  return text ? JSON.parse(text) : [];
}

async function main() {
  const token = await signIn();
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const debtors = await rest('debtors?name=like.CI *&select=id', headers);
  if (debtors.length > 0) {
    const ids = idList(debtors);
    // audit_log has no foreign key to debtors, so it needs an explicit
    // sweep — debtor_ar_entries/debtor_write_offs/debtor_payments cascade
    // automatically when the debtor row is deleted.
    await rest(`audit_log?entity_type=eq.debtor&entity_id=in.(${ids})`, headers, { method: 'DELETE' });
    await rest(`debtors?id=in.(${ids})`, headers, { method: 'DELETE' });
    console.log(`Deleted ${debtors.length} test debtor(s): ${debtors.map((d) => d.id).join(', ')}`);
  } else {
    console.log('No test debtors ("CI ...") found.');
  }

  const periods = await rest('call_for_return_periods?name=like.SMOKE-*&select=id', headers);
  if (periods.length > 0) {
    const periodIds = idList(periods);
    const submissions = await rest(
      `cfr_arrears_submissions?period_id=in.(${periodIds})&select=id`,
      headers,
    );
    if (submissions.length > 0) {
      await rest(`audit_log?entity_type=eq.cfr_submission&entity_id=in.(${idList(submissions)})`, headers, {
        method: 'DELETE',
      });
    }
    // cfr_arrears_submissions cascades automatically when the period is deleted.
    await rest(`call_for_return_periods?id=in.(${periodIds})`, headers, { method: 'DELETE' });
    console.log(`Deleted ${periods.length} test period(s) and ${submissions.length} submission(s).`);
  } else {
    console.log('No test periods ("SMOKE-...") found.');
  }
}

main().catch((err) => {
  console.error('Test-data cleanup failed:', err);
  process.exit(1);
});
