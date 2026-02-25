import { test, expect } from '@playwright/test';

// We stub Tauri invoke via window.__TAURI__.invoke in the page context
// The webServer serves the built client (dist) so components load normally.

test('activation flow shows modal and activates', async ({ page }) => {
  // Stub tauri and vault APIs before any script runs
  await page.addInitScript(() => {
    // Provide a minimal `window.api` that LoginScreen expects
    // @ts-ignore
    window.api = {
      vaultExists: () => Promise.resolve(true),
      checkBio: () => Promise.resolve(false),
      hasBioSaved: () => Promise.resolve(false),
      unlockVault: (pwd) => Promise.resolve({ success: true, isNew: false }),
      loginBio: () => Promise.resolve(null),
      saveBio: () => Promise.resolve(true),
    };

    // Stub Tauri invoke internals used by tauri-api wrapper
    // @ts-ignore
    window.__TAURI_INTERNALS__ = {
      invoke: (cmd, args) => {
        if (cmd === 'check_license') return Promise.resolve({ activated: false });
        if (cmd === 'activate_license') {
          const k = args?.key || '';
          if (k && k.startsWith('LXFW.')) return Promise.resolve({ success: true, client: 'E2E Tester' });
          return Promise.resolve({ success: false, error: 'Invalid' });
        }
        return Promise.resolve(null);
      }
    };

    // Backwards compat alias
    // @ts-ignore
    window.__TAURI__ = { invoke: window.__TAURI_INTERNALS__.invoke };
  });

  // Navigate with the E2E flag so the app bypasses the login gate
  await page.goto('/?e2e=1');

  // Use a permissive selector for the activation title (match 'LexFlow')
  await expect(page.locator('h2', { hasText: /LexFlow/i })).toBeVisible({ timeout: 10000 });

  // Enter license using the LF textarea class
  await page.fill('.lf-textarea', 'LXFW.TEST_TOKEN');

  // Click the activation button (match 'Attiva' generically)
  await page.click('button:has-text("Attiva")');

  // Verify success message contains 'riuscita' (case-insensitive)
  await expect(page.locator('text=/riuscita/i')).toBeVisible({ timeout: 5000 });
});
