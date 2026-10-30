# AutoAcceptQuests (Vencord plugin)

Automatically accepts every available Discord Quest, then works on the
"play a game" ones by spoofing the game. Progress is logged to the console
(Ctrl+Shift+I → Console, filter for `AutoAcceptQuests`).

- Runs ~10 seconds after Discord starts, then every 30 minutes
- Completes "play a game" quests only (desktop app); video, stream and activity quests are skipped

## Install

User plugins need a Vencord source build:

```bash
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
pnpm install --frozen-lockfile
```

Copy the `autoAcceptQuests` folder into `Vencord/src/userplugins/`, then:

```bash
pnpm build
pnpm inject
```

Restart Discord and enable **AutoAcceptQuests** in Settings → Vencord → Plugins.

> Client mods are against Discord's Terms of Service. Use at your own risk.
