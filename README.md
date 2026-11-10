# AutoAcceptQuests (Vencord plugin)

A [Vencord](https://github.com/Vendicated/Vencord) user plugin that:

1. **Accepts** every available Discord Quest automatically.
2. **Completes video, game and activity quests** by sending Discord the same progress requests the
   app sends, and shows Discord's answer in the console.

Progress is logged to the console (`Ctrl+Shift+I` → Console → filter for `AutoAcceptQuests`).

> [!WARNING]
> Client mods and quest automation are against Discord's Terms of Service. Discord has been
> enforcing against quest automation, with reports of quest suspensions and account violations.
> Use this on an account you can afford to lose, at your own risk.

## Easiest install (no building)

For people who just want it to work. Windows only. You do not need Git, Node or pnpm.

**Before you start:** have the normal Discord desktop app installed and logged in (not the browser version).

**1. Download**

1. On this page click the green **Code** button, then **Download ZIP**.
2. Find the downloaded `vencord-auto-accept-quests-main.zip` (usually in Downloads).

**2. Unzip it somewhere permanent**

1. Right-click the ZIP and choose **Extract All...**
2. Pick a place that will not change, for example `C:\Vencord-Quests`. Do not use Downloads or the Desktop, because the folder has to stay there for good. Moving or deleting it later breaks Vencord in Discord.
3. Open the extracted folder, then open the folder called `prebuilt`.

**3. Install**

1. Double-click **INSTALL.bat**.
2. If Windows shows "Windows protected your PC", click **More info**, then **Run anyway**. This happens because the file is not signed, and it is normal.
3. A black window opens, closes Discord and installs. Wait until it says **Done**, then press any key.

**4. Turn the plugin on**

1. Open Discord. It should show a **Vencord** entry in the settings list.
2. Go to **Settings > Vencord > Plugins**.
3. Type `AutoAcceptQuests` in the search box and switch it on.
4. Restart Discord if it asks.

**5. Check that it works**

1. Press `Ctrl+Shift+I` in Discord and open the **Console** tab.
2. In the filter box type `AutoAcceptQuests`.
3. About 10 seconds after Discord starts you should see lines like `Accepted quest: ...` and then progress such as `0:07 / 0:30`.
4. Keep Discord open until the quests finish. Game quests take as long as the quest says.

**If something goes wrong**

| Problem | What to do |
|---|---|
| No Vencord entry in Discord settings | Run **INSTALL.bat** again. Discord updates can remove Vencord, so repeat this after an update |
| Plugin not in the list | Make sure you ran INSTALL.bat from the unzipped `prebuilt` folder, not from inside the ZIP |
| Console shows a red error | Copy the line starting with `Could not finish` and send it to whoever gave you this |
| Nothing at all in the console | The plugin is off. Switch it on in Settings > Vencord > Plugins |

**Remove it:** double-click **UNINSTALL.bat** in the same `prebuilt` folder.

**Updating:** download the new ZIP, unzip it over the old folder, and run **INSTALL.bat** again.

## What it does

| Quest type | How it is completed |
|---|---|
| Watch a video | Reports the video position in real time, in 6 to 8 second steps, never ahead of the clock. A 30 second video takes about 30 seconds |
| Play a game | Once a minute it sends Discord the same "I'm playing this game" request the desktop app sends, until the quest is done |
| Play an activity | Sends voice-call heartbeats once a minute until the quest is done |
| Stream a game | **Experimental, off by default.** Tells Discord which game you are streaming and Discord sends the heartbeats, so you have to be streaming in a voice channel with someone else |

| Feature | Details |
|---|---|
| Auto-accept | Enrolls in every quest Discord lists for you that you haven't accepted yet |
| Order | Shortest quest first, one at a time |
| Schedule | First check ~10 s after Discord starts, then every 30 minutes. **Vencord Toolbox → Check quests now** runs a check on demand |
| Honest errors | If Discord refuses, the console shows Discord's own reason instead of a vague timeout |
| Safety nets | Leaves everything alone while Discord has suspended quests for your account, retries temporary errors, stops if progress stops moving, and leaves a failed quest alone for 6 hours (restart Discord to try sooner) |
| Pop-ups | A small pop-up when a quest is accepted, finished or fails (can be switched off) |

Game and activity quests run in real time. A 15-minute quest takes about 15 minutes, so keep
Discord open. It is made for the **Discord desktop app**.

### Settings

Settings → Vencord → Plugins → AutoAcceptQuests:

| Setting | Default | |
|---|---|---|
| Auto-accept quests | on | Accept new quests automatically |
| Video quests | on | Complete "watch a video" quests |
| Game quests | on | Complete "play a game" quests |
| Activity quests | on | Complete "play an activity" quests |
| Stream quests | **off** | Experimental, see above |
| Pop-ups | on | Show toasts for accepted, finished and failed quests |
| Check interval | 30 min | How often to look for new quests (at least 5, restart Discord to apply) |

### How it works

Earlier versions pretended a game was running and waited for Discord's own code to send the
heartbeats. On current Discord builds that stopped working (the console ended with
`No heartbeat from Discord within 90s`). This version skips that step: it asks Discord for your
quests, accepts them, then sends the progress requests directly and reads the progress Discord
reports back.

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
2 quest(s) listed, 2 to do
<video quest>: watching the video, 0:30 to go
<video quest>: 0:07 / 0:30
...
Quest completed: <video quest>
<game quest>: playing <game> as <folder>/<game>.exe, 15:00 to go
<game quest>: 0:00 / 15:00
<game quest>: 1:00 / 15:00
...
Quest completed: <game quest>
```

If the progress lines count up, it is working.

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
| `N quest(s) listed, 0 to do` | Your quests are already finished, or of a type that is switched off or not supported |
| `Skipping <quest>: <TYPE> is not supported or switched off` | That quest type is off in the settings, or the plugin does not know it |
| `Quests are suspended on this account until …` | Discord has suspended quests for your account. The plugin leaves them alone until then |
| `Discord is not letting this account accept quests right now` | Discord temporarily blocks accepting quests. Quests you already accepted are still played |
| `Discord says to wait Ns before accepting more quests` | Rate limit. The plugin waits and tries once more |
| `Could not accept <quest>: <status> <reason>` | Discord refused to enroll you; the reason is Discord's own words |
| `Could not finish <quest>: Discord refused the heartbeat: <status> <reason>` | Discord rejected the game or activity progress. **Send this line when reporting a problem.** The quest is left alone for 6 hours; restart Discord to try again sooner |
| `Could not finish <quest>: Discord refused the video progress: <status> <reason>` | The same for video quests |
| `… but progress is stuck at …` / `… but it is stuck at …` | Discord answered normally but is not counting the time |
| `the video is finished but Discord has not marked the quest as complete` | All video time was sent but Discord did not complete the quest |
| `heartbeat failed 5 times in a row` | Network or Discord outage |
| `heartbeat failed (…), trying again` / `video progress failed (…), trying again` | One temporary error (rate limit, server error, connection). It retries by itself |
| `Discord has no details for this quest's game` | Discord could not describe the game the quest asks for |
| `found no DM or voice channel to run the activity in` | Activity quests need a DM or a voice channel in your server list to attach to |
| `Discord sent no heartbeat within 90s …` | Stream quests only: you were not streaming in a voice channel with someone else |
| `Could not refresh Discord's quest list` | Harmless; the Quests page may only update after a restart |
| `Still busy with the last check, skipping this one` | A quest is still being worked on. Normal |

Progress also stops if Discord sleeps, loses connection, or the quest expires.
Discord changes its internals often, so this can break after an update. Open an issue with the console output.

## Credits and license

Video, activity and stream quest support follows the approach of the earlier all-in-one version of
this plugin. Built for [Vencord](https://github.com/Vendicated/Vencord) and licensed under
[GPL-3.0-or-later](LICENSE), the same license as Vencord.
