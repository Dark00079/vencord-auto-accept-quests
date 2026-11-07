# AutoAcceptQuests (Vencord plugin)

A [Vencord](https://github.com/Vendicated/Vencord) user plugin that:

1. **Accepts** every available Discord Quest automatically.
2. **Completes "play a game" quests** by sending the playtime heartbeats to Discord itself,
   and shows Discord's answer in the console.

Progress is logged to the console (`Ctrl+Shift+I` → Console → filter for `AutoAcceptQuests`).

> [!WARNING]
> Client mods and quest automation are against Discord's Terms of Service. Discord has been
> enforcing against quest automation, with reports of quest suspensions and account violations.
> Use this on an account you can afford to lose, at your own risk.

## What it does

| Feature | Details |
|---|---|
| Auto-accept | Enrolls in every quest Discord lists for you that you haven't accepted yet |
| Game quests | Once a minute it sends Discord the same "I'm playing this game" request the desktop app sends, until the quest is done |
| Schedule | First check ~10 s after Discord starts, then every 30 minutes. **Vencord Toolbox → Check quests now** runs a check on demand |
| Honest errors | If Discord refuses, the console shows Discord's own reason instead of a vague timeout |
| Safety nets | Leaves everything alone while Discord has suspended quests for your account, retries temporary errors, stops if progress stops moving for 5 minutes, and leaves a failed quest alone for 6 hours |
| Not supported | Video, stream and activity quests are accepted but not completed |

Game quests run in real time. A 15-minute quest takes about 15 minutes, so keep Discord open.
It is made for the **Discord desktop app**.

### How it works

Earlier versions pretended a game was running and waited for Discord's own code to send the
heartbeats. On current Discord builds that stopped working (the console ended with
`No heartbeat from Discord within 90s`). This version skips that step: it asks Discord for your
quests, accepts them, then sends the heartbeats for the quest's game directly and reads the
progress Discord reports back.

One limit: a real game also sends a fingerprint of its program file, which this plugin cannot
provide. If Discord starts requiring it, the heartbeat is refused and the console says so.

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

Create `src/userplugins` inside the Vencord folder if it doesn't exist, then copy the whole
`autoAcceptQuests` folder (both files) into it. You should end up with:

```
Vencord/
└── src/
    └── userplugins/
        └── autoAcceptQuests/
            ├── index.ts
            └── quests.ts
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
Accepted quest: <quest name>
1 quest(s) listed, 1 to play
<quest name>: playing <game> as <folder>/<game>.exe, 15:00 to go
<quest name>: 0:00 / 15:00
<quest name>: 1:00 / 15:00
...
Quest completed: <quest name>
```

If the progress lines count up about once a minute, it is working.

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
| `N quest(s) listed, 0 to play` | None of your quests are game quests, or they are already finished |
| `Quests are suspended on this account until …` | Discord has suspended quests for your account. The plugin leaves them alone until then |
| `Discord is not letting this account accept quests right now` | Discord temporarily blocks accepting quests. Quests you already accepted are still played |
| `Could not accept <quest>: <status> <reason>` | Discord refused to enroll you; the reason is Discord's own words |
| `Could not finish <quest>: Discord refused the heartbeat: <status> <reason>` | Discord rejected the playtime request. **Send this line when reporting a problem.** The quest is left alone for 6 hours; restart Discord to try again sooner |
| `Discord takes the heartbeats but progress is stuck at …` | Discord answered normally but is not counting the time. The quest is left alone for 6 hours |
| `heartbeats keep failing` | Network or Discord outage (five failed attempts in a row) |
| `heartbeat failed (…), trying again` | One temporary error (rate limit, server error, connection). It retries by itself |
| `Discord has no details for this quest's game` | Discord could not describe the game the quest asks for |
| `Could not refresh Discord's quest list` | Harmless; the Quests page may only update after a restart |
| `Still busy with the last check, skipping this one` | A quest is still being played. Normal |

Progress also stops if Discord sleeps, loses connection, or the quest expires.
Discord changes its internals often, so this can break after an update. Open an issue with the console output.

## Credits and license

Built for [Vencord](https://github.com/Vendicated/Vencord) and licensed under
[GPL-3.0-or-later](LICENSE), the same license as Vencord.
