import { expect, test } from '@playwright/test';

test('renders the public sign-in route', async ({ page }) => {
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/sign-in(?:\/|\?|$)/);
  await expect(page.locator('main')).toBeVisible();
});

test('rejects anonymous internal diagnostics requests', async ({ request }) => {
  const response = await request.get('/api/health', { maxRedirects: 0 });

  expect(response.status()).toBe(401);
});

test('rejects scheduled upload cleanup without the cron secret', async ({ request }) => {
  const response = await request.get('/api/recording-uploads/cleanup', { maxRedirects: 0 });
  expect(response.status()).toBe(401);
});

test('redirects anonymous sidebar showcase access to sign-in', async ({ page }) => {
  await page.goto('/component/sidebar', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/sign-in(?:\/|\?|$)/);
});
