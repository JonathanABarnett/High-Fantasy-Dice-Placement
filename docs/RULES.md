# Implemented Rules

## Match setup

One human and one CPU each select a faction and receive five six-sided dice: Arcane, Martial, Nature, Influence, and Neutral. Each player begins with 2 gold and 1 of every other resource. A match lasts six rounds. The human is first player in round one; first player alternates each round.

## Rounds and turns

At the start of a round, all dice are returned and rolled from the match’s seeded random stream. For the default two-player game, six of the twelve regions open with eight contested slots between them. Larger player counts open more space based on the number of dice in the match, while still keeping fewer slots than total dice. Each round also reserves several low-minimum, no-cost routes so low rolls remain usable. The open regions rotate deterministically from the match seed. Players alternate turns. On a turn, the active player may place one ready die, play a card, acquire a market card, forge a die upgrade when eligible, or pass for the remainder of the round. After all players pass, locations clear and the next round starts automatically. Passing in round six triggers final scoring.

## Placement legality

Every board location has two slots. A slot can require a minimum rolled value, one of several affinities, resources, or a combination. Costs are paid before rewards. Occupied slots, placed dice, failed requirements, unaffordable costs, wrong-turn actions, and actions by passed players are rejected by the engine with stable reason codes. The debug UI calls this validator to highlight legal slots.

Selecting a die places the board in route-preview mode. Open locations receive a written Playable, Blocked, or Full badge; inactive regions and spare slots display Sealed. Each empty open slot displays a check or cross beside shorthand for its value, affinity, and resource requirements. Resource, affinity, and card-category tokens provide the same explanations on hover and keyboard focus; color is supplementary rather than the only legality cue.

## Locations and rewards

Twelve locations are implemented: Crystal Cavern, Mage Tower, Ancient Library, Sacred Shrine, Dwarven Mines, Forge Hall, Goldgate Market, Harbor, Wildwood Grove, Ruined Stronghold, Dragon Pass, and Watchtower. Their data definitions provide distinct resource and victory-point rewards. Combat resolution and multi-die Dragon Pass requirements remain deferred.

## Cards and market

Each faction begins with one unique tactic. A seeded deck supplies a three-card market. Acquiring a card pays its cost, puts it in hand, and replenishes the market; playing a card resolves typed resource, victory-point, draw, or ready-die reroll effects. Played cards enter the discard pile. Allies and relics are worth 1 point after they are played.

## Forge and die faces

Placing at Forge Hall unlocks upgrades for the rest of that round. An upgrade pays its resource cost and permanently replaces one chosen face on one chosen die. Upgraded resource symbols grant their matching resource whenever that face is later placed; a masterwork symbol grants 1 victory point. Enhancements also contribute their printed end-game score.

## Faction passives

- **Arcanum Conclave:** an Arcane die at an Arcane location gains 1 extra mana.
- **Ember Dominion:** a Martial die at a Martial location gains 1 victory point.
- **Verdant Covenant:** Nature dice reduce minimum-value requirements by 1, to a minimum of 1.
- **Stonebound League:** placement at Forge Hall gains 1 extra material.

Each faction also begins with its own executable starting tactic.

## CPU

The CPU enumerates actions from the engine, evaluates placements, card effects and costs, market acquisitions, upgrades, faction alignment, die efficiency, and victory points, then resolves equal scores with seeded randomness. It never submits an action that bypasses validation.

## Scoring

Final score is the sum of victory-point tokens, up to 3 points from resource reserves (1 per 5 resources), faction scoring, played ally/relic cards, and permanent die enhancements. Arcanum scores per 3 mana, Ember per 2 Martial placements, Verdant per 3 resource types held, and Stonebound per 3 materials. All players tied for the highest score are winners.

## Saves

The debug client can save and restore authoritative state in local storage. Schema-v3 saves include the seed, current RNG state, round, active and sealed board regions, turn, placements, resources, dice faces, hands, market, deck, discard pile, upgrades, and scoring progress. Transient selection and animation state are excluded.
