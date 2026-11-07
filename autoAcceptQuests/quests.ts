/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const PLAY_ON_DESKTOP = "PLAY_ON_DESKTOP";

const HEARTBEAT_MS = 60_000;
const RETRY_MS = 20_000;
const MAX_FAILURES = 5;
const MAX_STALLED_BEATS = 5;
const COOL_OFF_MS = 6 * 60 * 60_000;

export interface UserStatus {
    enrolled_at?: string | null;
    completed_at?: string | null;
    claimed_at?: string | null;
    progress?: Record<string, { value: number; }>;
}

export interface Quest {
    id: string;
    config: {
        config_version: number;
        expires_at: string;
        messages?: { quest_name?: string; };
        task_config_v2?: { tasks?: Record<string, { target: number; applications?: { id: string; }[]; }>; };
        rewards_config?: { platforms?: unknown[]; };
    };
    user_status: UserStatus | null;
}

export interface QuestApi {
    get(url: string): Promise<any>;
    post(url: string, body?: Record<string, any>): Promise<any>;
}

export interface Deps {
    api: QuestApi;
    log: { info(...args: any[]): void; warn(...args: any[]): void; error(...args: any[]): void; };
    sleep(ms: number, signal: AbortSignal): Promise<void>;
    refresh(): Promise<unknown> | void;
    now?(): number;
    platform?: string;
}

export interface State {
    coolOff: Map<string, number>;
}

export const questName = (q: Quest) => q.config.messages?.quest_name ?? q.id;

export const isExpired = (q: Quest, now = Date.now()) => new Date(q.config.expires_at).getTime() <= now;

// The quests Discord's own client lists: config version 2, with rewards for this platform or already claimed
export const isListed = (q: Quest) =>
    q.config.config_version === 2
    && (q.user_status?.claimed_at != null || (q.config.rewards_config?.platforms?.length ?? 0) > 0);

export const playTask = (q: Quest) => q.config.task_config_v2?.tasks?.[PLAY_ON_DESKTOP];

export const progressOf = (status: UserStatus | null | undefined) => status?.progress?.[PLAY_ON_DESKTOP]?.value ?? 0;

const clock = (seconds: number) => {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function describeError(e: any): string {
    const status = e?.status ?? e?.response?.status ?? "";
    const message = e?.body?.message ?? e?.message ?? e?.text ?? "";
    const code = e?.body?.code != null ? ` (code ${e.body.code})` : "";
    const text = `${status} ${typeof message === "string" ? message : JSON.stringify(message)}${code}`.trim();
    return text || String(e);
}

export function executablePath(app: any, platform = "win32") {
    const exes: any[] = app.executables ?? [];
    const exe = exes.find(x => x.os === platform && !x.is_launcher) ?? exes.find(x => x.os === platform);
    const name = String(exe?.name ?? `${app.name}.exe`).replace(/^>/, "").toLowerCase();
    if (name.includes("/")) return name;
    const folder = String(app.name).toLowerCase().replace(/[/\\:*?"<>|]/g, "").trim() || "game";
    return `${folder}/${name}`;
}

export async function pickApplication(api: QuestApi, ids: string[], platform?: string) {
    for (const id of ids) {
        const found = (await api.get(`/applications/public?application_ids=${id}`))?.[0];
        if (found) return { id, name: String(found.name), path: executablePath(found, platform) };
    }
    return null;
}

export async function playQuest(d: Deps, quest: Quest, signal: AbortSignal): Promise<"completed" | "stopped"> {
    const name = questName(quest);
    const task = playTask(quest)!;
    const app = await pickApplication(d.api, (task.applications ?? []).map(a => a.id), d.platform);
    if (!app) throw new Error("Discord has no details for this quest's game");

    let status = quest.user_status;
    let failures = 0;
    let best = progressOf(status);
    let stalled = 0;
    d.log.info(`${name}: playing ${app.name} as ${app.path}, ${clock(task.target - best)} to go`);

    while (!signal.aborted) {
        try {
            status = await d.api.post(`/quests/${quest.id}/heartbeat`, {
                application_id: app.id,
                terminal: false,
                executable_path: app.path
            });
            failures = 0;
        } catch (e: any) {
            const code = e?.status;
            if (code && code < 500 && code !== 429)
                throw new Error(`Discord refused the heartbeat: ${describeError(e)}`);
            if (++failures >= MAX_FAILURES)
                throw new Error(`heartbeats keep failing: ${describeError(e)}`);
            d.log.warn(`${name}: heartbeat failed (${describeError(e)}), trying again`);
            await d.sleep(RETRY_MS, signal);
            continue;
        }

        const progress = progressOf(status);
        d.log.info(`${name}: ${clock(progress)} / ${clock(task.target)}`);
        if (status?.completed_at || progress >= task.target) return "completed";

        if (progress > best) {
            best = progress;
            stalled = 0;
        } else if (++stalled >= MAX_STALLED_BEATS) {
            throw new Error(`Discord takes the heartbeats but progress is stuck at ${clock(progress)}`);
        }

        const left = (task.target - progress) * 1000;
        await d.sleep(left <= HEARTBEAT_MS ? left + 1000 : HEARTBEAT_MS + Math.random() * 1500, signal);
    }

    await d.api.post(`/quests/${quest.id}/heartbeat`, { terminal: true }).catch(() => { });
    return "stopped";
}

export async function checkQuests(d: Deps, state: State, signal: AbortSignal) {
    const now = d.now?.() ?? Date.now();
    const body = await d.api.get("/quests/@me");
    const until = (key: string) => body?.[key] ? new Date(body[key]).getTime() : 0;

    if (until("quest_access_suspended_until") > now) {
        d.log.warn(`Quests are suspended on this account until ${new Date(until("quest_access_suspended_until")).toLocaleString()}; leaving them alone`);
        return;
    }

    const quests = ((body?.quests ?? []) as Quest[]).filter(q => isListed(q) && !isExpired(q, now));

    if (until("quest_enrollment_blocked_until") > now) {
        d.log.warn("Discord is not letting this account accept quests right now");
    } else {
        let accepted = 0;
        for (const q of quests.filter(q => !q.user_status?.enrolled_at)) {
            try {
                const status = await d.api.post(`/quests/${q.id}/enroll`, { location: 11 });
                q.user_status = { ...status, enrolled_at: status?.enrolled_at ?? new Date(now).toISOString() };
                accepted++;
                d.log.info(`Accepted quest: ${questName(q)}`);
            } catch (e) {
                d.log.error(`Could not accept ${questName(q)}: ${describeError(e)}`);
            }
        }
        if (accepted) await d.refresh();
    }

    const queue = quests.filter(q => playTask(q)
        && q.user_status?.enrolled_at && !q.user_status.completed_at
        && (state.coolOff.get(q.id) ?? 0) <= now);
    d.log.info(`${quests.length} quest(s) listed, ${queue.length} to play`);

    for (const q of queue) {
        if (signal.aborted) break;
        try {
            if (await playQuest(d, q, signal) === "completed") {
                d.log.info(`Quest completed: ${questName(q)}`);
                await d.refresh();
            }
        } catch (e: any) {
            d.log.error(`Could not finish ${questName(q)}: ${e?.message ?? describeError(e)}`);
            state.coolOff.set(q.id, (d.now?.() ?? Date.now()) + COOL_OFF_MS);
        }
    }
}
