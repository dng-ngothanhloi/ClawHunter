import { test, expect } from '@playwright/test';

test.describe('Claw Hunters dApp - Smoke Tests', () => {
  test('should load dashboard page', async ({ page }) => {
    await page.goto('/');
    
    // Check page title
    await expect(page).toHaveTitle(/Claw Hunters/);
    
    // Check main heading
    await expect(page.locator('h1')).toContainText('Revenue Sharing Dashboard');
    
    // Check navigation exists
    await expect(page.locator('nav')).toBeVisible();
    
    // Check quick action buttons
    await expect(page.locator('text=Claim Rewards')).toBeVisible();
    await expect(page.locator('text=CHG Staking')).toBeVisible();
    await expect(page.locator('text=Machines')).toBeVisible();
  });

  test('should navigate between pages', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to claim center
    await page.click('text=Claim Rewards');
    await expect(page).toHaveURL('/claim');
    await expect(page.locator('h1')).toContainText('Claim Center');
    
    // Navigate to machines
    await page.click('text=Machines');
    await expect(page).toHaveURL('/machines');
    await expect(page.locator('h1')).toContainText('Claw Machines');
    
    // Navigate to staking
    await page.click('text=CHG Staking');
    await expect(page).toHaveURL('/staking');
    await expect(page.locator('h1')).toContainText('CHG Staking');
  });

  test('should show wallet connection requirement', async ({ page }) => {
    await page.goto('/claim');
    
    // Should show wallet connection required message
    await expect(page.locator('text=Wallet Connection Required')).toBeVisible();
    await expect(page.locator('text=Connect Wallet')).toBeVisible();
  });

  test('should display responsive design', async ({ page }) => {
    // Test desktop view
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    
    // Sidebar should be visible on desktop
    await expect(page.locator('nav')).toBeVisible();
    
    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Sidebar should be hidden on mobile
    // (Implementation would need mobile menu toggle)
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API failure
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' })
      });
    });
    
    await page.goto('/');
    
    // Should not crash and show appropriate error handling
    await expect(page.locator('h1')).toContainText('Revenue Sharing Dashboard');
  });

  test('should load without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Filter out expected errors (like missing API endpoints in test)
    const criticalErrors = errors.filter(error => 
      !error.includes('fetch') && 
      !error.includes('NetworkError') &&
      !error.includes('404')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });
});
