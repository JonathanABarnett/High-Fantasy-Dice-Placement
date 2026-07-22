import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('starts a deterministic human-versus-CPU match', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Realms of the Shattered Crown' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.getByText('Round 1 / 6')).toBeVisible();
  await expect(page.getByTestId('pixi-board')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Your dice' })).toBeVisible();
  await expect(page.locator('.placement-guide')).toContainText(
    '6 active regions · 8 contested slots',
  );
  await expect(
    page.getByRole('region', { name: 'Round pressure' }),
  ).toContainText('8/8 slots left');
});

test('explains resources and clearly marks die placement routes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start match' }).click();

  const materials = page
    .locator('.player')
    .first()
    .locator('.resource-materials');
  await expect(materials).toHaveAttribute(
    'data-tooltip',
    /primary cost for permanent die-face upgrades/i,
  );
  await materials.focus();
  await expect(materials).toBeFocused();

  const category = page.locator('.category-token').first();
  await expect(category).toHaveAttribute('data-tooltip', /one-use effect/i);

  await page.locator('.die:not([disabled])').first().click();
  const guide = page.locator('.placement-guide');
  await expect(guide).toContainText(/Value \d [A-Za-z]+ die selected/);
  await expect(guide).toContainText(/\d+ glowing locations can accept it/);
  await expect(guide).toContainText('Playable');
  await expect(guide).toContainText('Blocked');
});

test('pins location details and exposes preview icon explanations', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start match' }).click();

  await page.getByRole('button', { name: 'Inspect Crystal Cavern' }).click();

  const preview = page.locator('.location-preview');
  await expect(
    preview.getByRole('heading', { name: 'Crystal Cavern' }),
  ).toBeVisible();
  await expect(preview.locator('.resource-mana').first()).toHaveAttribute(
    'data-tooltip',
    /Arcane power used by magical cards/i,
  );
  await expect(preview.locator('.value-token').first()).toHaveAttribute(
    'data-tooltip',
    /Minimum value/i,
  );
  await expect(preview.locator('.affinity-arcane').first()).toHaveAttribute(
    'data-tooltip',
    /Accepted by magical locations/i,
  );
  await page.locator('.die:not([disabled])').first().click();
  await expect(preview).toContainText(/PLAYABLE|BLOCKED/);
});

test('guides a new player through the complete visual tutorial', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Learn to play' }).click();

  const tutorial = page.getByRole('dialog');
  await expect(tutorial).toBeVisible();
  await expect(
    tutorial.getByRole('heading', { name: 'Claim the Shattered Crown' }),
  ).toBeVisible();
  await expect(page.getByTestId('tutorial-overlay')).toBeVisible();

  const remainingTitles = [
    'Gather five resources',
    'Read and select your dice',
    'Place dice to gain rewards',
    'Inspect rewards and restrictions',
    'Play cards or visit the market',
    'Unlock upgrades at Forge Hall',
    'Pass when your plans are complete',
    'Follow the log and build your score',
  ];
  for (const title of remainingTitles) {
    await tutorial.getByRole('button', { name: 'Next' }).click();
    await expect(tutorial.getByRole('heading', { name: title })).toBeVisible();
    if (title === 'Unlock upgrades at Forge Hall') {
      const boardBox = await page.getByTestId('pixi-board').boundingBox();
      const focusBox = await page.locator('.tutorial-focus').boundingBox();
      expect(focusBox?.width ?? 0).toBeLessThan((boardBox?.width ?? 0) / 3);
      await expect(tutorial).toContainText('When Forge Hall is open');
    }
  }

  await tutorial.getByRole('button', { name: 'Begin playing' }).click();
  await expect(tutorial).not.toBeVisible();
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(tutorial).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tutorial).not.toBeVisible();
});

test('supports keyboard-accessible placement controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.locator('.die:not([disabled])').first().click();
  await page.getByText('Keyboard placement options').click();
  const legalLocation = page
    .locator('.accessible-actions button:not([disabled])')
    .first();
  await expect(legalLocation).toBeEnabled();
  await legalLocation.click();
  await expect(page.getByText(/Player placed a die at/).first()).toBeVisible();
});

test('plays a faction card through the typed effect system', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.getByRole('heading', { name: 'Your hand' })).toBeVisible();
  await expect(page.getByText('Revelation of Stars')).toBeVisible();
  await page.getByRole('button', { name: 'Play card' }).click();
  await expect(
    page.getByText('Player played Revelation of Stars.'),
  ).toBeVisible();
});

test('unlocks Forge Hall and permanently upgrades a die face', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.locator('.die:not([disabled])').first().click();
  await page.getByText('Keyboard placement options').click();
  await page.getByRole('button', { exact: true, name: 'Forge Hall' }).click();
  const forgePanel = page.getByRole('region', { name: 'Forge upgrades' });
  await expect(forgePanel).toBeVisible();
  const forgeButton = forgePanel.getByRole('button', { name: 'Forge' }).first();
  await expect(forgeButton).toBeEnabled({ timeout: 20_000 });
  await forgeButton.click();
  await expect(page.getByText(/Player forged Tempered Pair/)).toBeVisible();
});

test('can complete all six rounds by passing', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start match' }).click();

  for (let round = 1; round <= 6; round += 1) {
    await expect(page.getByText(`Round ${round} / 6`)).toBeVisible({
      timeout: 20_000,
    });
    const pass = page.getByRole('button', { name: 'Pass for this round' });
    await expect(pass).toBeEnabled({ timeout: 20_000 });
    await pass.click();
    if (round < 6) {
      await expect(page.getByText(`Round ${round + 1} / 6`)).toBeVisible({
        timeout: 20_000,
      });
    }
  }

  await expect(page.getByText('Match complete')).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByRole('button', { name: 'Play another match' }),
  ).toBeVisible();
});
