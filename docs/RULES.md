# Implemented Rules

## Match setup

One human and one CPU each select a faction and receive five six-sided dice: Arcane, Martial, Nature, Influence, and Neutral. Each player begins with 2 gold and 1 of every other resource. A match lasts six rounds. The human is first player in round one; first player alternates each round.

## Rounds and turns

At the start of a round, all dice are returned and rolled from the match’s seeded random stream. For the default two-player game, six of the twelve regions open with eight contested slots between them. Larger player counts open more space based on the number of dice in the match, while still keeping fewer slots than total dice. Each round also reserves several low-minimum, no-cost routes so low rolls remain usable. The open regions rotate deterministically from the match seed. Players alternate turns. On a turn, the active player may place one ready die, contest a rival-held slot by bumping, play a card, acquire a market card, forge a die upgrade when eligible, or pass for the remainder of the round. After all players pass, locations clear and the next round starts automatically. Passing in round six triggers final scoring.

## Placement legality

Every board location has two slots. A slot can require a minimum rolled value, one of several affinities, resources, or a combination. Costs are paid before rewards. Occupied slots, placed dice, failed requirements, unaffordable costs, wrong-turn actions, and actions by passed players are rejected by the engine with stable reason codes. The debug UI calls this validator to highlight legal slots.

Selecting a die places the board in route-preview mode. Open locations receive a written Playable, Blocked, or Full badge; inactive regions and spare slots display Sealed. Each empty open slot displays a check or cross beside shorthand for its value, affinity, and resource requirements. Resource, affinity, and card-category tokens provide the same explanations on hover and keyboard focus; color is supplementary rather than the only legality cue.

## Locations and rewards

Twelve locations are implemented: Crystal Cavern, Mage Tower, Ancient Library, Sacred Shrine, Dwarven Mines, Forge Hall, Goldgate Market, Harbor, Wildwood Grove, Ruined Stronghold, Dragon Pass, and Watchtower. Their data definitions provide distinct resource and victory-point rewards.

## Momentum runs

Placements within a round build a themed run. Placing at a location that shares a tag with your previous placement extends the run; placing anywhere else restarts it at one. A run pays victory points as it lengthens — 2 points at three links, 3 at four, and 4 at five — so the reward is for committing to a theme across a whole round rather than taking the best isolated slot each turn. Runs reset at the start of each round.

This is what makes the order of your placements matter: a slightly worse slot that keeps a run alive is often better than the best slot that breaks it.

## Monster hunts

Ruined Stronghold is a monster hunt. Each of its two slots is a distinct beast whose minimum value is its threat; placing a die there slays that beast. Unlike other locations, the die's value matters beyond the gate: every point by which the rolled value beats the threat loots one extra material. A natural six or a forged masterwork face lands a critical strike for bonus victory points.

At least one live monster hunt is guaranteed to be open every round. If the round's shuffle would have sealed them all, one is swapped in for an ordinary resource location, preserving the round's active-location and open-slot counts and its reserved low-roll routes.

## Raid bosses

Dragon Pass is a persistent raid. The Elder Dragon has a shared pool of 20 health that carries across rounds and is visible on the board and in the location preview. Any die placed at either slot wounds it by the die's rolled value, doubled by a natural six or a masterwork face. Wounds from both players accumulate into the same pool, so a rival can chip the beast down while you wait for a big die — but the player who lands the blow that empties the pool takes the entire bounty: 6 victory points and 3 gold from the hoard. Once slain, the pass reverts to an ordinary location for the rest of the match, and it no longer satisfies the guaranteed-hunt rule.

## The dragon's wrath

A raid boss takes its own turn. At the end of every round it survives, its hoard grows by 2 victory points, so the longer the Elder Dragon lives the richer the killing blow becomes — as high as 16 points in a long match. If nobody wounded it that round it also claws back 5 health, so leaving it alone costs real ground rather than merely postponing the fight. The board itself is unchanged by this, which keeps placement scarcity and low-roll routes exactly as they were.

The result is a clock: engage the beast and the prize is smaller but reachable, or let it grow and gamble that you, not your rival, will land the finishing blow.

## Bumping

A slot already held by a rival can be contested. Placing a die there with a strictly higher rolled value than the defending die, and paying one influence on top of any slot cost, drives the rival off and claims the slot and its reward. The bumped die returns to its owner ready to be placed again, so bumping costs tempo and influence rather than destroying a die outright. Because each bump requires a strictly higher value, exchanges terminate rather than looping.

## Crown quests

Three shared objectives are drawn from a seeded pool at match start and shown to both players. They are first-come: the moment a player satisfies a condition, they claim its victory points permanently and no one else can take it. Conditions are data-driven and cover monsters slain, resources amassed, upgrades forged, cards played, ally/relic cards played, and placements by location tag.

## Cards and market

Each faction begins with one unique tactic. A seeded deck supplies a three-card market. Acquiring a card pays its cost, puts it in hand, and replenishes the market; playing a card resolves its typed effects. Played cards enter the discard pile. Allies and relics are worth 1 point after they are played.

Card effects cover resources, victory points, draws, and rerolls, plus several that reach into the board or reward a plan you have already built:

- **Empower** raises a ready die's value for the rest of the round. A boosted die clears higher minimums, wins bumps, loots more overkill, and can even reach the value-6 threshold for a critical strike. The bonus is cleared when dice reroll, so it never becomes a permanent upgrade — that remains the Forge's job.
- **Siege** wounds the raid boss without spending a die on it, but it can never reduce the beast below 1 health. The killing blow, and its bounty, must still be struck with a die.
- **Steal** takes a resource from every rival, limited by what they actually hold. Unlike other income, it moves resources rather than creating them.
- **Trophies** convert monsters you personally slew into victory points, making earlier combat placements matter again later.
- **Forge payoffs** score your permanent die upgrades, pushing Forge Hall from a simple resource stop into a long-term engine.
- **Tag payoffs** reward previous placements at a kind of location, such as Veteran Captain paying gold for combat placements.

## Forge and die faces

Placing at Forge Hall unlocks upgrades for the rest of that round. An upgrade pays its resource cost and permanently replaces one chosen face on one chosen die. The upgrade shop now spans twelve faces: cheap reliability, value-5 and value-6 resource faces, flexible dual-symbol faces, and masterwork glory faces. Upgraded resource symbols grant their matching resource whenever that face is later placed; a masterwork symbol grants 1 victory point. Enhancements also contribute their printed end-game score.

## Faction passives

Each faction pulls on a different part of the game, so the same board rewards them differently.

- **Arcanum Conclave:** any placement at an Arcane location gains 1 extra mana, or 2 with an Arcane die. They bump rivals by spending 1 mana instead of 1 influence.
- **Ember Dominion:** a Martial die at a Martial location gains 1 victory point, and their dice deal 2 extra damage to raid bosses, making them the fastest dragonslayers.
- **Verdant Covenant:** they field a sixth Nature die. Nature dice reduce minimum-value requirements by 1, to a minimum of 1 — which also lowers a beast's effective threat and so increases overkill loot. They gain 1 influence whenever one of their dice is bumped.
- **Stonebound League:** placement at Forge Hall gains 1 extra material, and rivals must pay 1 extra influence to bump a Stonebound die.

Each faction also begins with its own executable starting tactic.

## Opponent difficulty

Three CPU tiers are selectable at setup. A **Squire** sees the board but picks from its merely-good moves rather than its best. A **Knight** always takes the strongest move it can find. A **Warlord** additionally weighs what each square is worth to _you_ — counting which of your ready dice could use a slot and how rich the location is — and will take a slightly weaker square to shut you out of a strong one. The tiers are verified to differ in actual strength, not just in label.

## CPU

The CPU enumerates actions from the engine, evaluates placements, card effects and costs, market acquisitions, upgrades, faction alignment, die efficiency, and victory points, then resolves equal scores with seeded randomness. It never submits an action that bypasses validation.

## Scoring

Final score is the sum of victory-point tokens — which include monster bounties, critical strikes, and claimed crown quests — plus up to 3 points from resource reserves (1 per 5 resources), faction scoring, played ally/relic cards, and permanent die enhancements. Arcanum scores per 2 mana, Ember per 2 Martial placements, Verdant 1 point per resource type they hold 3 or more of, and Stonebound per 5 materials. All players tied for the highest score are winners.

## Saves

The debug client can save and restore authoritative state in local storage. Schema-v4 saves include the seed, current RNG state, round, active and sealed board regions, turn, placements, resources, dice faces, hands, market, deck, discard pile, upgrades, shared objectives with their claim status, and accumulated raid damage. Transient selection and animation state are excluded. Schema-v3 saves are rejected rather than silently migrated.
