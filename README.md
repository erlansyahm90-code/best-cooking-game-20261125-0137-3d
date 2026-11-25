# Junction Kitchen 3D

[![make.fun](https://make.fun/badge/best-cooking-game-20261125-0137.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137)
[![rank](https://make.fun/badge/best-cooking-game-20261125-0137/erlansyahm90-code/best-cooking-game-20261125-0137-3d/rank.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137)
[![reward](https://make.fun/badge/best-cooking-game-20261125-0137/erlansyahm90-code/best-cooking-game-20261125-0137-3d/reward.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137)

A 3D train-station cooking game for the [make.fun best cooking game bounty](https://make.fun/bounty/best-cooking-game-20261125-0137). Built in raw WebGL — no libraries, no engine, one hand-written shader and a mini mesh engine.

## The game

You are the chef of Junction Kitchen, a kitchen inside a railway station. Orders arrive as train departures on the departure board; passengers wait on the left platform with their ticket and a patience meter over their heads. Cook before their train leaves.

- **Route planning**: Pantry → Chopping Board → Stove → Plating Counter → Serving Window. The chef carries 2 items at once.
- **7 recipes** from shared ingredients, unlocked across **5 shifts** (Morning, Noon, Afternoon, Night, Midnight Rush).
- **Perfect-cook zone**: pull a pot off the stove in the green zone for bonus coins; leave it too long and it burns.
- **9 upgrades, 3 tiers each** (knife, stove + extra burner, plating, serving window tips, chef shoes, pantry, ingredient quality, warming station, **waiter who delivers ready plates to passengers**) — bought with serve coins between shifts.
- **Cooking Dash-style depth, original everything**: patience meters, express trains, VIP / hurried / relaxed passengers, combo meter, goal meter with 1–5 stars per shift, a sous-chef helper after 3 serves (auto-chops), a waiter who runs ready plates to the counter, and calming tea for a nearly-red order.
- **Sound, all synthesised (Web Audio, zero files)**: a 32-step train-yard waltz that changes per shift and quickens at Rush Hour, a sizzle loop while food is on the stove, a ding when a pot enters the perfect zone, a chop per knife stroke, bell + coins on serve, and a click on every button (M mutes).

## Controls

- **WASD / arrows** — move the chef (or click a station to walk there)
- **E / Space** — interact with the nearest station
- **T** — serve calming tea to the most urgent order
- **B** — recipe book, **U** — upgrade shop, **P** — pause, **M** — mute

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Screenshots are staged with `?scene=cover|chop|stove|shop` (the 4th shot is the upgrade shop, open over the kitchen). Tests: `node --test tests/`.

## License

MIT — see [LICENSE](LICENSE).
