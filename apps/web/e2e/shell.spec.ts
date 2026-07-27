import { expect, type Page, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function openMatchLog(page: Page) {
  const log = page.locator('.log-panel');
  const show = log.getByRole('button', { name: 'Show' });
  if (await show.isVisible()) await show.click();
  return log;
}

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
  await expect(
    page.getByRole('button', { name: 'Show' }).first(),
  ).toBeVisible();
  await expect(page.locator('.log-panel')).toContainText('entries');
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
  test.setTimeout(90_000);
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
    'Use the command center',
    'Place dice to gain rewards',
    'Inspect rewards and restrictions',
    'Open only the panels you need',
    'Hunt monsters for their spoils',
    'Wound the Elder Dragon together',
    'Bump rivals off contested slots',
    'Play cards, buy engines',
    'Unlock upgrades at Forge Hall',
    'Claim the Crown Quests first',
    'Pass when your plans are complete',
    'Follow the log and build your score',
  ];
  for (const title of remainingTitles) {
    const next = tutorial.getByRole('button', { name: 'Next' });
    await expect(next).toBeEnabled({ timeout: 10_000 });
    await next.click({ timeout: 10_000 });
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
  const log = await openMatchLog(page);
  await expect(log.getByText(/Player placed a die at/).first()).toBeVisible();
});

test('plays a faction card through the typed effect system', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.getByRole('heading', { name: 'Your hand' })).toBeVisible();
  await expect(page.getByText('Revelation of Stars')).toBeVisible();
  await page.getByRole('button', { name: 'Play card' }).click();
  const log = await openMatchLog(page);
  await expect(
    log.getByText('Player played Revelation of Stars.'),
  ).toBeVisible();
});

test('unlocks Forge Hall and permanently upgrades a die face', async ({
  page,
}) => {
  let foundForgeRoute = false;
  for (let seedIndex = 0; seedIndex < 40 && !foundForgeRoute; seedIndex += 1) {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page
      .getByLabel('Match seed')
      .fill(`shattered-crown-${seedIndex.toString().padStart(3, '0')}`);
    await page.getByRole('button', { name: 'Start match' }).click();
    await page.locator('.die:not([disabled])').first().click();
    await page.getByText('Keyboard placement options').click();
    const forgeRoute = page.getByRole('button', {
      exact: true,
      name: 'Forge Hall',
    });
    if (await forgeRoute.isEnabled()) {
      await forgeRoute.click();
      foundForgeRoute = true;
    }
  }
  expect(foundForgeRoute).toBe(true);
  const forgePanel = page.getByRole('region', { name: 'Forge upgrades' });
  await expect(forgePanel).toBeVisible();
  const forgeButton = forgePanel.getByRole('button', { name: 'Forge' }).first();
  await expect(forgeButton).toBeEnabled({ timeout: 20_000 });
  await forgeButton.click();
  const log = await openMatchLog(page);
  await expect(log.getByText(/Player forged Tempered Pair/)).toBeVisible();
});

test('can complete all six rounds by passing', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start match' }).click();
  const roundStatus = page.locator('.round-block strong');

  for (let passCount = 0; passCount < 6; passCount += 1) {
    if (await page.getByText('Match complete').isVisible()) break;
    const previousRound = await roundStatus.textContent();
    const pass = page.getByRole('button', { name: 'Pass for this round' });
    await expect(pass).toBeEnabled({ timeout: 60_000 });
    await pass.scrollIntoViewIfNeeded();
    await pass.click();
    await expect
      .poll(
        async () => {
          if (await page.getByText('Match complete').isVisible())
            return 'complete';
          return (await roundStatus.textContent()) ?? '';
        },
        { timeout: 90_000 },
      )
      .not.toBe(previousRound);
  }

  await expect(page.getByText('Match complete')).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByRole('button', { name: 'Play another match' }),
  ).toBeVisible();
});
