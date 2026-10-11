import { expect, test } from '@playwright/test';

test('renders the public sign-in route', async ({ page }) => {
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/sign-in(?:\/|\?|$)/);
  await expect(page.locator('main')).toBeVisible();
});
