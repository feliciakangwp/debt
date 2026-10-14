import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'TEST_USER_EMAIL and TEST_USER_PASSWORD must be set (a real Supabase login) to run these tests.',
    );
  }

  await page.goto('/');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.click('button:has-text("Sign in")');
  await expect(page.locator('nav')).toBeVisible();

  await page.context().storageState({ path: authFile });
});
