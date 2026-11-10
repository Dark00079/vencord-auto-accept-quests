/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findByCodeLazy } from "@webpack";
import { ApplicationStreamingStore, ChannelStore, FluxDispatcher, GuildChannelStore, RestAPI, showToast } from "@webpack/common";

import { checkQuests, Deps, describeError, Outcome, Quest, QuestApi, questName, State } from "./quests";

const logger = new Logger("AutoAcceptQuests");

const FIRST_BEAT_MS = 90_000;
const NEXT_BEAT_MS = 3 * 60_000;

const settings = definePluginSettings({
    autoEnroll: {
        type: OptionType.BOOLEAN,
        description: "Accept new quests automatically",
        default: true
    },
    supportVideo: {
        type: OptionType.BOOLEAN,
        description: "Complete \"watch a video\" quests",
        default: true
    },
    supportDesktop: {
        type: OptionType.BOOLEAN,
        description: "Complete \"play a game\" quests",
        default: true
    },
    supportActivity: {
        type: OptionType.BOOLEAN,
        description: "Complete \"play an activity\" quests",
        default: true
    },
    supportStreaming: {
        type: OptionType.BOOLEAN,
        description: "Complete \"stream a game\" quests. Experimental: you have to be streaming in a voice channel with someone else",
        default: false
    },
    showToasts: {
        type: OptionType.BOOLEAN,
        description: "Show a pop-up when a quest is accepted, finished or fails",
        default: true
    },
    checkIntervalMinutes: {
        type: OptionType.NUMBER,
        description: "How often to look for new quests, in minutes (at least 5). Restart Discord to apply",
        default: 30
    }
});

const fetchCurrentQuests = findByCodeLazy("QUESTS_FETCH_CURRENT_QUESTS_BEGIN", "QUESTS_FETCH_CURRENT_QUESTS_SUCCESS");

const api: QuestApi = {
    get: async url => (await RestAPI.get({ url })).body,
    post: async (url, body) => (await RestAPI.post({ url, body })).body
};

const state: State = { coolOff: new Map() };

let firstCheck: ReturnType<typeof setTimeout> | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let running: AbortController | undefined;

function sleep(ms: number, signal: AbortSignal) {
    return new Promise<void>(resolve => {
        if (signal.aborted) return resolve();
        const done = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
        };
        const timer = setTimeout(done, ms);
        signal.addEventListener("abort", done, { once: true });
    });
}

async function refresh() {
    try {
        await fetchCurrentQuests();
    } catch (e) {
        logger.warn("Could not refresh Discord's quest list", e);
    }
}

function notify(text: string, variant?: "success" | "critical") {
    if (!settings.store.showToasts) return;

    try {
        showToast({ text, variant });
    } catch (e) {
        logger.warn("Could not show a pop-up", e);
    }
}

const options = () => ({
    enroll: settings.store.autoEnroll,
    video: settings.store.supportVideo,
    desktop: settings.store.supportDesktop,
    activity: settings.store.supportActivity,
    stream: settings.store.supportStreaming
});

const activityChannelId = () =>
    ChannelStore.getSortedPrivateChannels()[0]?.id
    ?? Object.values(GuildChannelStore.getAllGuilds()).find(g => g?.VOCAL.length)?.VOCAL[0].channel.id;

// Discord's own code sends the heartbeats for stream quests; we only tell it which game is being streamed
function streamQuest(quest: Quest, target: number, signal: AbortSignal) {
    const name = questName(quest);
    const applicationId = quest.config.task_config_v2?.tasks?.STREAM_ON_DESKTOP?.applications?.[0]?.id;
    if (!applicationId) return Promise.reject(new Error("the quest does not name a game to stream"));

    const store: any = ApplicationStreamingStore;
    const original = store.getStreamerActiveStreamMetadata;
    store.getStreamerActiveStreamMetadata = () => ({ id: applicationId, pid: 1000 + Math.floor(Math.random() * 30000), sourceName: null });
    logger.info(`${name}: waiting for Discord to send heartbeats; keep streaming in a voice channel with someone else`);

    return new Promise<Outcome>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;

        const finish = (result: Outcome | Error) => {
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", onBeat);
            FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_FAILURE", onFailure);
            store.getStreamerActiveStreamMetadata = original;
            if (result instanceof Error) reject(result);
            else resolve(result);
        };
        const wait = (ms: number, message: string) => {
            clearTimeout(timer);
            timer = setTimeout(() => finish(new Error(message)), ms);
        };
        const onAbort = () => finish("stopped");
        const onBeat = (data: any) => {
            if (data.questId !== quest.id) return;

            const progress = data.userStatus?.progress?.STREAM_ON_DESKTOP?.value ?? 0;
            logger.info(`${name}: ${Math.floor(progress)}s / ${target}s`);
            if (data.userStatus?.completedAt || progress >= target) return finish("completed");
            wait(NEXT_BEAT_MS, "Discord stopped sending heartbeats. Are you still streaming?");
        };
        const onFailure = (data: any) => {
            if (data.questId === quest.id) logger.warn(`${name}: Discord refused a heartbeat: ${describeError(data.error)}`);
        };

        signal.addEventListener("abort", onAbort, { once: true });
        FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", onBeat);
        FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_FAILURE", onFailure);
        wait(FIRST_BEAT_MS, "Discord sent no heartbeat within 90s. Start streaming in a voice channel with someone else, then run \"Check quests now\"");
    });
}

async function check() {
    if (running) return logger.info("Still busy with the last check, skipping this one");

    const controller = running = new AbortController();
    const deps: Deps = {
        api,
        log: logger,
        options,
        sleep,
        refresh,
        notify,
        activityChannelId,
        stream: streamQuest,
        platform: (globalThis as any).DiscordNative?.process?.platform
    };

    try {
        await checkQuests(deps, state, controller.signal);
    } catch (e) {
        logger.error("Quest check failed:", describeError(e));
    } finally {
        running = undefined;
    }
}

export default definePlugin({
    name: "AutoAcceptQuests",
    description: "Accepts Discord Quests and completes the video, game and activity ones for you, logging progress to the console.",
    authors: [{ name: "Zhuo", id: 0n }],
    settings,

    toolboxActions: {
        "Check quests now"() {
            check();
        }
    },

    start() {
        logger.info("Started; first quest check in 10s");
        firstCheck = setTimeout(check, 10_000);
        interval = setInterval(check, Math.max(5, settings.store.checkIntervalMinutes) * 60_000);
    },

    stop() {
        clearTimeout(firstCheck);
        clearInterval(interval);
        running?.abort();
    }
});
