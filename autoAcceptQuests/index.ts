/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, RestAPI, RunningGameStore } from "@webpack/common";

const logger = new Logger("AutoAcceptQuests");

// Not in @webpack/common. Matched by its methods since the store's display name isn't reliable
const QuestsStore: any = findByPropsLazy("getQuest", "quests");

// How often to look for new quests after startup
const CHECK_INTERVAL = 30 * 60 * 1000;

// Only "play a game" quests; video, stream and activity quests are skipped
const SUPPORTED_TASKS = ["PLAY_ON_DESKTOP"];

let interval: ReturnType<typeof setInterval> | undefined;
let startTimeout: ReturnType<typeof setTimeout> | undefined;
let running = false;

interface Quest {
    id: string;
    config: {
        expires_at: string;
        messages?: { quest_name?: string; };
    };
    user_status: { enrolled_at?: string | null; } | null;
}

async function acceptAllQuests() {
    let quests: Quest[];
    try {
        const { body } = await RestAPI.get({ url: "/quests/@me" });
        quests = body?.quests ?? [];
    } catch (e) {
        logger.error("Failed to fetch quests", e);
        return;
    }

    const now = Date.now();
    const pending = quests.filter(q =>
        !q.user_status?.enrolled_at && new Date(q.config.expires_at).getTime() > now
    );

    let accepted = 0;
    for (const quest of pending) {
        const name = quest.config.messages?.quest_name ?? quest.id;
        try {
            await RestAPI.post({
                url: `/quests/${quest.id}/enroll`,
                body: { location: 11 }
            });
            accepted++;
            logger.info(`Accepted quest: ${name}`);
        } catch (e) {
            logger.error(`Failed to accept quest: ${name}`, e);
        }
    }

    logger.info(`Accepted ${accepted} of ${pending.length} quests`);

    // Enrolled quests live in QuestsStore; give it a moment to pick up the new ones
    if (accepted > 0) await sleep(2000);
    await completeQuests();
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// Waits for Discord's own heartbeat to report >= `target` seconds of progress
function waitForProgress(taskName: string, quest: any, target: number, onProgress: (p: number) => void) {
    return new Promise<void>(resolve => {
        const handler = (data: any) => {
            const progress = quest.config.configVersion === 1
                ? data.userStatus.streamProgressSeconds
                : Math.floor(data.userStatus.progress[taskName].value);
            onProgress(progress);
            if (progress >= target) {
                FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", handler);
                resolve();
            }
        };
        FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", handler);
    });
}

async function completeQuest(quest: any) {
    const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
    const taskName: string = SUPPORTED_TASKS.find(x => taskConfig.tasks[x] != null)!;
    const taskData = taskConfig.tasks[taskName];
    const questName: string = quest.config.messages.questName;
    const applicationId = quest.config.application?.id ?? taskData.applications?.[0]?.id;
    const { target: secondsNeeded }: { target: number; } = taskData;
    const secondsDone: number = quest.userStatus?.progress?.[taskName]?.value ?? 0;
    const pid = Math.floor(Math.random() * 30000) + 1000;
    const isApp = typeof DiscordNative !== "undefined";

    if (taskName === "PLAY_ON_DESKTOP") {
        if (!isApp) return logger.warn(`${questName}: needs the Discord desktop app`);

        const res = await RestAPI.get({ url: `/applications/public?application_ids=${applicationId}` });
        const appData = res.body[0];
        const exeName: string = appData.executables?.find((x: any) => x.os === "win32")?.name?.replace(">", "")
            ?? appData.name.replace(/[/\\:*?"<>|]/g, "");

        const fakeGame = {
            cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
            exeName,
            exePath: `c:/program files/${appData.name.toLowerCase()}/${exeName}`,
            hidden: false,
            isLauncher: false,
            id: applicationId,
            name: appData.name,
            pid,
            pidPath: [pid],
            processName: appData.name,
            start: Date.now()
        };
        const store: any = RunningGameStore;
        const realGames = store.getRunningGames();
        const realGetRunningGames = store.getRunningGames;
        const realGetGameForPID = store.getGameForPID;
        store.getRunningGames = () => [fakeGame];
        store.getGameForPID = (p: number) => p === pid ? fakeGame : undefined;
        FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: realGames, added: [fakeGame], games: [fakeGame] } as any);

        logger.info(`Spoofed game ${appData.name}; ~${Math.ceil((secondsNeeded - secondsDone) / 60)} min left`);
        try {
            await waitForProgress("PLAY_ON_DESKTOP", quest, secondsNeeded, p => logger.info(`${questName}: ${p}/${secondsNeeded}`));
        } finally {
            store.getRunningGames = realGetRunningGames;
            store.getGameForPID = realGetGameForPID;
            FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: [] } as any);
        }
    }

    logger.info(`Quest completed: ${questName}`);
}

async function completeQuests() {
    if (running) return;
    running = true;
    try {
        const all = [...QuestsStore.quests.values()];
        logger.info(`QuestsStore has ${all.length} quests`);
        const quests = all.filter((x: any) =>
            x.userStatus?.enrolledAt
            && !x.userStatus?.completedAt
            && new Date(x.config.expiresAt).getTime() > Date.now()
            && SUPPORTED_TASKS.some(y => Object.keys((x.config.taskConfig ?? x.config.taskConfigV2).tasks).includes(y))
        );
        if (!quests.length) return logger.info("No enrolled, uncompleted quests of a supported type");
        logger.info(`Working on ${quests.length} quest(s)`);

        for (const quest of quests) {
            try {
                await completeQuest(quest);
            } catch (e) {
                logger.error("Failed to complete quest", e);
            }
        }
    } finally {
        running = false;
    }
}

export default definePlugin({
    name: "AutoAcceptQuests",
    description: "Automatically accepts every available Discord Quest and works on completing them, logging to the console.",
    authors: [{ name: "Zhuo", id: 0n }],

    start() {
        logger.info("Started; first quest check in 10s");
        // Give Discord a few seconds to finish logging in before calling the API
        startTimeout = setTimeout(acceptAllQuests, 10_000);
        interval = setInterval(acceptAllQuests, CHECK_INTERVAL);
    },

    stop() {
        clearTimeout(startTimeout);
        clearInterval(interval);
    }
});
