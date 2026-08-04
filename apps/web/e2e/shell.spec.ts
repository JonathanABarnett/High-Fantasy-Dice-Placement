import { expect, type Page, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function openMatchLog(page: Page) {
  await page.getByRole('button', { name: 'Log' }).click();
  const log = page.locator('.log-panel');
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
  await expect(page.locator('.dice-panel')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Royal card market' }),
  ).toBeHidden();
  await expect(
    page.getByRole('region', { name: 'Your card hand' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Sound on' }).click();
  await expect(page.getByRole('button', { name: 'Sound off' })).toBeVisible();
  await page.getByRole('button', { name: 'Sound off' }).click();
  await expect(page.getByRole('button', { name: 'Sound on' })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.placement-guide')).toBeHidden();
  await page.locator('.die:not([disabled])').first().click();
  await expect(page.locator('.move-advisor')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Place at/ }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pressure' }).click();
  await expect(
    page.getByRole('region', { name: 'Round pressure' }),
  ).toContainText('8/8 slots left');
  await page
    .getByRole('region', { name: 'Round pressure' })
    .getByRole('button', { name: 'Close' })
    .click();
  await page.getByRole('button', { name: 'Log' }).click();
  await expect(page.locator('.log-panel')).toContainText('entries');
});

test('starts a human-versus-two-CPU match and rotates through every seat', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Players').selectOption('3');
  await expect(page.getByText('3 houses')).toBeVisible();
  await page.getByRole('button', { name: 'Start match' }).click();

  const standings = page.locator('.player-strip');
  await expect(page.locator('.turn-cue')).toContainText('Round 1 begins');
  await expect(standings.locator('.player')).toHaveCount(3);
  await expect(standings).toContainText('CPU 2');
  await expect(standings).toHaveClass(/player-strip-3/);

  await page.locator('.die:not([disabled])').first().click();
  await page
    .getByRole('button', { name: /Place at/ })
    .first()
    .click();
  await expect(page.locator('.turn-cue')).toContainText('Move committed');
  await expect(standings.locator('.player.active')).toContainText('CPU 2', {
    timeout: 3_000,
  });
  await expect(standings.locator('.player.active')).toContainText('Player', {
    timeout: 3_000,
  });
});

test('reserves separate space for the board and command rail', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2048, height: 1096 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.getByTestId('pixi-board')).toHaveAttribute(
    'data-ready',
    'true',
  );

  const [header, players, board, tray, hand, diceGroup, turnPlan] =
    await Promise.all([
      page.locator('.game-header').boundingBox(),
      page.locator('.player-strip').boundingBox(),
      page.locator('.board-stage').boundingBox(),
      page.locator('.dice-panel').boundingBox(),
      page.locator('.hand-dock').boundingBox(),
      page.locator('.player-pieces').boundingBox(),
      page.locator('.turn-summary').boundingBox(),
    ]);

  expect(header).not.toBeNull();
  expect(players).not.toBeNull();
  expect(board).not.toBeNull();
  expect(tray).not.toBeNull();
  expect(hand).not.toBeNull();
  expect(diceGroup).not.toBeNull();
  expect(turnPlan).not.toBeNull();

  expect(header!.y + header!.height).toBeLessThanOrEqual(players!.y + 1);
  expect(players!.y).toBeGreaterThanOrEqual(board!.y);
  expect(players!.y + players!.height).toBeLessThanOrEqual(
    board!.y + board!.height,
  );
  const verticalGeometry = JSON.stringify({ header, players, board, tray });
  expect(board!.y + board!.height, verticalGeometry).toBeLessThanOrEqual(
    tray!.y + 1,
  );
  const commandRailGeometry = JSON.stringify({ tray, hand });
  expect(hand!.x, commandRailGeometry).toBeGreaterThanOrEqual(tray!.x);
  expect(hand!.x + hand!.width, commandRailGeometry).toBeLessThanOrEqual(
    tray!.x + tray!.width,
  );
  expect(hand!.y, commandRailGeometry).toBeGreaterThanOrEqual(tray!.y);
  expect(hand!.y + hand!.height, commandRailGeometry).toBeLessThanOrEqual(
    tray!.y + tray!.height,
  );
  expect(diceGroup!.x + diceGroup!.width).toBeLessThanOrEqual(hand!.x + 1);
  expect(hand!.x + hand!.width).toBeLessThanOrEqual(turnPlan!.x + 1);

  await page.locator('.die:not([disabled])').first().click();
  await expect(page.locator('.hand-dock')).toBeHidden();
  await expect(page.locator('.move-advisor')).toBeVisible();
  const advisor = await page.locator('.move-advisor').boundingBox();
  expect(advisor).not.toBeNull();
  expect(advisor!.x).toBeGreaterThanOrEqual(tray!.x);
  expect(advisor!.x + advisor!.width).toBeLessThanOrEqual(
    tray!.x + tray!.width,
  );
  expect(advisor!.y).toBeGreaterThanOrEqual(tray!.y);
  expect(advisor!.y + advisor!.height).toBeLessThanOrEqual(
    tray!.y + tray!.height,
  );

  // Selecting the same die clears planning and restores the hand. Managing it
  // opens one centered modal instead of wedging a drawer behind the rail.
  await page.locator('.die.selected').click();
  await expect(page.locator('.hand-dock')).toBeVisible();
  await page
    .getByRole('button', { name: 'View full hand and card market' })
    .click();
  const cardsModal = page.getByRole('region', {
    name: 'Card hand and market',
  });
  const modalBox = await cardsModal.boundingBox();
  expect(modalBox).not.toBeNull();
  expect(modalBox!.x).toBeGreaterThanOrEqual(0);
  expect(modalBox!.y).toBeGreaterThanOrEqual(0);
  expect(modalBox!.x + modalBox!.width).toBeLessThanOrEqual(2048);
  expect(modalBox!.y + modalBox!.height).toBeLessThanOrEqual(1096);
  await cardsModal.getByRole('button', { name: 'Close' }).click();
  await expect(cardsModal).toBeHidden();
});

test('keeps the realm full-width at the compact table breakpoint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start match' }).click();

  const boardBox = await page.getByTestId('pixi-board').boundingBox();
  expect(boardBox?.width ?? 0).toBeGreaterThan(700);
  await expect(page.locator('.hand-dock')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cards' })).toBeVisible();

  const tray = await page.locator('.dice-panel').boundingBox();
  await page.locator('.die:not([disabled])').first().click();
  await expect(page.locator('.turn-summary')).toBeHidden();
  const advisor = await page.locator('.move-advisor').boundingBox();
  expect(advisor).not.toBeNull();
  expect(tray).not.toBeNull();
  expect(advisor!.x).toBeGreaterThanOrEqual(tray!.x);
  expect(advisor!.x + advisor!.width).toBeLessThanOrEqual(
    tray!.x + tray!.width,
  );
  expect(advisor!.y).toBeGreaterThanOrEqual(tray!.y);
  expect(advisor!.y + advisor!.height).toBeLessThanOrEqual(
    tray!.y + tray!.height,
  );

  await page.locator('.die[aria-pressed="true"]').click();
  await expect(page.locator('.turn-summary')).toBeVisible();
  await page.locator('.panel-shortcut').filter({ hasText: 'Cards' }).click();
  const cards = page.getByRole('region', { name: 'Card hand and market' });
  await expect(cards).toBeVisible();
  const cardsBox = await cards.boundingBox();
  expect(cardsBox).not.toBeNull();
  expect(cardsBox!.height).toBeLessThan(page.viewportSize()!.height * 0.75);
  await cards.getByRole('button', { name: 'Close' }).click();
});

test('keeps the realm playable while using the atlas and compact game menu', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start match' }).click();

  const playerStripBox = await page.locator('.player-strip').boundingBox();
  const atlasBox = await page.locator('.atlas-nav').boundingBox();
  const compactBoardBox = await page.locator('.board-stage').boundingBox();
  const compactTrayBox = await page.locator('.dice-panel').boundingBox();
  expect(playerStripBox).not.toBeNull();
  expect(atlasBox).not.toBeNull();
  expect(
    playerStripBox!.y + playerStripBox!.height,
    JSON.stringify({
      playerStripBox,
      atlasBox,
      compactBoardBox,
      compactTrayBox,
    }),
  ).toBeLessThanOrEqual(atlasBox!.y);

  await page.getByRole('button', { name: 'Heartlands' }).click();
  await expect(
    page.getByRole('button', { name: 'Heartlands' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'How to play' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(page.getByTestId('pixi-board')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
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

  // The command trays begin closed so the realm stays dominant; opening Cards
  // is the deliberate path to its item explanations.
  await page.locator('.panel-shortcut').filter({ hasText: 'Cards' }).click();
  const category = page.locator('.category-token').first();
  await expect(category).toHaveAttribute('data-tooltip', /one-use effect/i);
  await page
    .getByRole('region', { name: 'Card hand and market' })
    .getByRole('button', { name: 'Close' })
    .click();

  await page.locator('.die:not([disabled])').first().click();
  await expect(page.locator('.move-advisor')).toContainText(
    'Best routes for this die',
  );
  await expect(
    page.getByRole('button', { name: /Place at/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Inspect/ }).first(),
  ).toBeVisible();
});

test('pins location details and exposes preview icon explanations', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start match' }).click();

  // The decision dock beneath the board is the canonical location display.
  const preview = page.locator('.decision-dock');
  // Pixi owns the visual map while this transparent semantic control owns
  // keyboard/a11y input. Use its keyboard activation path so the test covers
  // the same reliable input route as a keyboard player.
  await expect(async () => {
    const crystalCavern = page.getByRole('button', {
      name: 'Inspect Crystal Cavern',
    });
    await crystalCavern.focus();
    await crystalCavern.press('Enter');
    await expect(
      preview.getByRole('heading', { name: 'Crystal Cavern' }),
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
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
  await expect(preview).toContainText(/Playable|Blocked/);
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
    'Track score and resources',
    'Start every turn in the tray',
    'Lift a die to plan',
    'Follow the highlighted slots',
    'Pin a location for full details',
    'Chain placements into momentum',
    'Play directly from your hand',
    'Open one system drawer at a time',
    'Hunt monsters for their spoils',
    'Wound the Elder Dragon together',
    'Bump rivals off contested slots',
    'Unlock upgrades at Forge Hall',
    'Claim the Crown Quests first',
    'Pass when your plans are complete',
    'Use the menu, log, and final reckoning',
  ];
  for (const title of remainingTitles) {
    const next = tutorial.getByRole('button', { name: 'Next' });
    await expect(next).toBeEnabled({ timeout: 10_000 });
    await next.click({ timeout: 10_000 });
    await expect(tutorial.getByRole('heading', { name: title })).toBeVisible();
    if (title === 'Unlock upgrades at Forge Hall') {
      // The overlay re-anchors its focus ring on a short timer, so read the
      // settled box rather than whichever value the step transition left.
      await expect(async () => {
        const boardBox = await page.getByTestId('pixi-board').boundingBox();
        const focusBox = await page.locator('.tutorial-focus').boundingBox();
        expect(focusBox?.width ?? 0).toBeLessThan((boardBox?.width ?? 0) / 3);
      }).toPass({ timeout: 10_000 });
      await expect(tutorial).toContainText('When Forge Hall is open');
    }
  }

  await tutorial.getByRole('button', { name: 'Begin playing' }).click();
  await expect(tutorial).not.toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(tutorial).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tutorial).not.toBeVisible();
});

test('supports keyboard-accessible placement controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.locator('.die:not([disabled])').first().click();
  const keyboardOptions = page.getByText('Keyboard placement options');
  await keyboardOptions.focus();
  await keyboardOptions.press('Enter');
  const legalLocation = page
    .locator('.accessible-actions button:not([disabled])')
    .first();
  await expect(legalLocation).toBeEnabled();
  await legalLocation.focus();
  await legalLocation.press('Enter');
  const log = await openMatchLog(page);
  await expect(log.getByText(/Player placed a die at/).first()).toBeVisible();
});

test('plays a faction card through the typed effect system', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.locator('.panel-shortcut').filter({ hasText: 'Cards' }).click();
  const cardsPanel = page.locator('.card-panel');
  await expect(
    cardsPanel.getByRole('heading', { name: 'Your hand' }),
  ).toBeVisible();
  await expect(cardsPanel.getByText('Revelation of Stars')).toBeVisible();
  await cardsPanel.getByRole('button', { name: 'Play card' }).click();
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
    const keyboardOptions = page.getByText('Keyboard placement options');
    await keyboardOptions.focus();
    await keyboardOptions.press('Enter');
    const forgeRoute = page
      .locator('.accessible-actions button')
      .filter({ hasText: 'Forge Hall' });
    if (await forgeRoute.isEnabled()) {
      await forgeRoute.focus();
      await forgeRoute.press('Enter');
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
