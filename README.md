# AutoAcceptQuests (Vencord plugin)

A [Vencord](https://github.com/Vendicated/Vencord) user plugin that:

1. **Accepts** every available Discord Quest automatically.
2. **Completes "play a game" quests** by faking the game as running, so Discord counts the playtime.

Progress is logged to the console (`Ctrl+Shift+I` → Console → filter for `AutoAcceptQuests`).

> [!WARNING]
> Client mods and quest automation are against Discord's Terms of Service. Discord has been
> enforcing against quest automation, with reports of quest suspensions and account violations.
> Use this on an account you can afford to lose, at your own risk.

## What it does

| Feature | Details |
|---|---|
| Auto-accept | Enrolls in every unexpired quest you haven't accepted |
| Game quests | Spoofs the quest's game via Discord's `RunningGameStore`; Discord then sends the heartbeats and credits progress |
| Schedule | First check ~10 s after Discord starts, then every 30 minutes |
| Safety nets | 90 s wait for a first heartbeat, re-adds the fake game if Discord drops it or progress stalls for 3 min, restores your real game list when done |
| Not supported | Video, stream and activity quests are skipped |

Game quests run in real time. A 15-minute quest takes about 15 minutes, so keep Discord open.
It only works in the **Discord desktop app**.

## Requirements

- Windows, with the Discord desktop app installed
- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) 18 or newer
- [pnpm](https://pnpm.io/installation) (`npm install -g pnpm`)

User plugins are not available in the normal Vencord installer, so you build Vencord from source
and put this plugin inside it. That takes about five minutes.

## Install (step by step)

**1. Get this plugin**

```bash
git clone https://github.com/Dark00079/vencord-auto-accept-quests.git
```

**2. Get Vencord's source**

```bash
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
pnpm install --frozen-lockfile
```

**3. Copy the plugin into Vencord**

Create `src/userplugins` inside the Vencord folder if it doesn't exist, then copy the
`autoAcceptQuests` folder into it. You should end up with:

```
Vencord/
└── src/
    └── userplugins/
        └── autoAcceptQuests/
            └── index.ts
```

**4. Build**

```bash
pnpm build
```

**5. Inject into Discord**

Close Discord completely first (right-click its tray icon → Quit Discord), then:

```bash
pnpm inject
```

Pick your Discord install in the installer when asked.

**6. Enable the plugin**

1. Open Discord.
2. Go to **Settings → Vencord → Plugins**.
3. Search for **AutoAcceptQuests** and switch it on.
4. Restart Discord if it asks you to.

**7. Check that it works**

Press `Ctrl+Shift+I`, open the Console tab and filter for `AutoAcceptQuests`. About 10 seconds
after startup you should see something like:

```
Started; first quest check in 10s
Accepted 2 of 2 quests
QuestsStore has 3 quests
Working on 1 quest(s)
Spoofed game <name>; ~15 min left
<quest>: 120/900
```

## Updating

When this plugin changes, replace the `autoAcceptQuests` folder in `Vencord/src/userplugins/`
with the new one, then run `pnpm build` and restart Discord. After a Discord update that removes
Vencord, run `pnpm inject` again.

## Uninstall

```bash
pnpm uninject
```

Or just switch the plugin off in Settings → Vencord → Plugins.

## Troubleshooting

| Console says | Meaning |
|---|---|
| Nothing at all | The plugin isn't enabled, or the build wasn't injected. Redo steps 4 to 6 |
| `No enrolled, uncompleted quests of a supported type` | None of your quests are game quests, or none are accepted yet |
| `needs the Discord desktop app` | Game quests don't work in the browser version |
| `No heartbeat from Discord within 90s` | Discord didn't detect the fake game. Try restarting Discord |
| `re-adding spoofed game` | Discord dropped the fake game; the plugin put it back. This is normal |
| `Failed to fetch quests` | Network or Discord API problem; it retries in 30 minutes |

Progress also stops if Discord sleeps, loses connection, or the quest expires.
Discord changes its internals often, so this can break after an update. Open an issue with the console output.

## Credits and license

Built for [Vencord](https://github.com/Vendicated/Vencord) and licensed under
[GPL-3.0-or-later](LICENSE), the same license as Vencord.
