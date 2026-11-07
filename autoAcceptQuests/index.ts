/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { findByCodeLazy } from "@webpack";
import { RestAPI } from "@webpack/common";

import { checkQuests, describeError, QuestApi, State } from "./quests";

const logger = new Logger("AutoAcceptQuests");

const CHECK_INTERVAL = 30 * 60 * 1000;

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

async function check() {
    if (running) return logger.info("Still busy with the last check, skipping this one");

    const controller = running = new AbortController();
    try {
        await checkQuests({
            api,
            log: logger,
            sleep,
            refresh,
            platform: (globalThis as any).DiscordNative?.process?.platform
        }, state, controller.signal);
    } catch (e) {
        logger.error("Quest check failed:", describeError(e));
    } finally {
        running = undefined;
    }
}

export default definePlugin({
    name: "AutoAcceptQuests",
    description: "Accepts every available Discord Quest and plays the \"play a game\" ones for you, logging progress to the console.",
    authors: [{ name: "Zhuo", id: 0n }],

    toolboxActions: {
        "Check quests now"() {
            check();
        }
    },

    start() {
        logger.info("Started; first quest check in 10s");
        firstCheck = setTimeout(check, 10_000);
        interval = setInterval(check, CHECK_INTERVAL);
    },

    stop() {
        clearTimeout(firstCheck);
        clearInterval(interval);
        running?.abort();
    }
});
