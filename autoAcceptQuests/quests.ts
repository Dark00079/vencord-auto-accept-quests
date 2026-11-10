/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type TaskName = "WATCH_VIDEO" | "WATCH_VIDEO_ON_MOBILE" | "PLAY_ON_DESKTOP" | "PLAY_ACTIVITY" | "STREAM_ON_DESKTOP";
export type Outcome = "completed" | "stopped";

const HEARTBEAT_MS = 60_000;
const RETRY_MS = 20_000;
const ENROLL_GAP_MS = 1_500;
const MAX_FAILURES = 5;
const MAX_STALLED = 5;
const COOL_OFF_MS = 6 * 60 * 60_000;

export interface UserStatus {
    enrolled_at?: string | null;
    completed_at?: string | null;
    claimed_at?: string | null;
    progress?: Record<string, { value: number; }>;
}

export interface Task {
    target: number;
    applications?: { id: string; }[];
}

export interface Quest {
    id: string;
    config: {
        config_version: number;
        expires_at: string;
        messages?: { quest_name?: string; };
        task_config_v2?: { tasks?: Record<string, Task>; };
        rewards_config?: { platforms?: unknown[]; };
    };
    user_status: UserStatus | null;
}

export interface Options {
    enroll: boolean;
    video: boolean;
    desktop: boolean;
    activity: boolean;
    stream: boolean;
}

export interface QuestApi {
    get(url: string): Promise<any>;
    post(url: string, body?: Record<string, any>): Promise<any>;
}

export interface Deps {
    api: QuestApi;
    log: { info(...args: any[]): void; warn(...args: any[]): void; error(...args: any[]): void; };
    options(): Options;
    sleep(ms: number, signal: AbortSignal): Promise<void>;
    refresh(): Promise<unknown> | void;
    notify?(text: string, kind?: "success" | "critical"): void;
    activityChannelId?(): string | undefined;
    stream?(quest: Quest, target: number, signal: AbortSignal): Promise<Outcome>;
    now?(): number;
    platform?: string;
}

export interface State {
    coolOff: Map<string, number>;
}

const TASKS: [TaskName, keyof Options][] = [
    ["WATCH_VIDEO", "video"],
    ["WATCH_VIDEO_ON_MOBILE", "video"],
    ["PLAY_ON_DESKTOP", "desktop"],
    ["PLAY_ACTIVITY", "activity"],
    ["STREAM_ON_DESKTOP", "stream"]
];

export const questName = (q: Quest) => q.config.messages?.quest_name ?? q.id;

export const isExpired = (q: Quest, now = Date.now()) => new Date(q.config.expires_at).getTime() <= now;

// The quests Discord's own client lists: config version 2, with rewards for this platform or already claimed
export const isListed = (q: Quest) =>
    q.config.config_version === 2
    && (q.user_status?.claimed_at != null || (q.config.rewards_config?.platforms?.length ?? 0) > 0);

export function pickTask(q: Quest, options: Options) {
    const tasks = q.config.task_config_v2?.tasks;
    for (const [name, option] of TASKS) {
        const task = tasks?.[name];
        if (task && options[option]) return { ...task, name };
    }
    return null;
}

type Picked = NonNullable<ReturnType<typeof pickTask>>;

export const progressOf = (status: UserStatus | null | undefined, task: string) => status?.progress?.[task]?.value ?? 0;

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

// Sends one request, retrying temporary errors. Returns null if stopped while waiting.
async function send(d: Deps, signal: AbortSignal, name: string, what: string, url: string, body: Record<string, any>): Promise<UserStatus | null> {
    for (let failures = 1; !signal.aborted; failures++) {
        try {
            return (await d.api.post(url, body)) ?? {};
        } catch (e: any) {
            if (e?.status && e.status < 500 && e.status !== 429)
                throw new Error(`Discord refused the ${what}: ${describeError(e)}`);
            if (failures >= MAX_FAILURES)
                throw new Error(`${what} failed ${failures} times in a row: ${describeError(e)}`);
            d.log.warn(`${name}: ${what} failed (${describeError(e)}), trying again`);
            await d.sleep(RETRY_MS, signal);
        }
    }
    return null;
}

interface Beat {
    task: TaskName;
    target: number;
    body: Record<string, any>;
    closing: Record<string, any>;
}

async function heartbeats(d: Deps, quest: Quest, beat: Beat, signal: AbortSignal): Promise<Outcome> {
    const name = questName(quest);
    const url = `/quests/${quest.id}/heartbeat`;
    let best = progressOf(quest.user_status, beat.task);
    let stalled = 0;

    while (!signal.aborted) {
        const status = await send(d, signal, name, "heartbeat", url, beat.body);
        if (!status) break;

        const progress = progressOf(status, beat.task);
        d.log.info(`${name}: ${clock(progress)} / ${clock(beat.target)}`);
        if (status.completed_at || progress >= beat.target) return "completed";

        if (progress > best) {
            best = progress;
            stalled = 0;
        } else if (++stalled >= MAX_STALLED) {
            throw new Error(`Discord takes the heartbeats but progress is stuck at ${clock(progress)}`);
        }

        const left = (beat.target - progress) * 1000;
        await d.sleep(left <= HEARTBEAT_MS ? left + 1000 : HEARTBEAT_MS + Math.random() * 1500, signal);
    }

    await d.api.post(url, beat.closing).catch(() => { });
    return "stopped";
}

export async function playQuest(d: Deps, quest: Quest, task: Task, signal: AbortSignal): Promise<Outcome> {
    const app = await pickApplication(d.api, (task.applications ?? []).map(a => a.id), d.platform);
    if (!app) throw new Error("Discord has no details for this quest's game");

    d.log.info(`${questName(quest)}: playing ${app.name} as ${app.path}, ${clock(task.target - progressOf(quest.user_status, "PLAY_ON_DESKTOP"))} to go`);
    return heartbeats(d, quest, {
        task: "PLAY_ON_DESKTOP",
        target: task.target,
        body: { application_id: app.id, terminal: false, executable_path: app.path },
        closing: { terminal: true }
    }, signal);
}

export async function playActivity(d: Deps, quest: Quest, task: Task, signal: AbortSignal): Promise<Outcome> {
    const channelId = d.activityChannelId?.();
    if (!channelId) throw new Error("found no DM or voice channel to run the activity in");

    const streamKey = `call:${channelId}:1`;
    d.log.info(`${questName(quest)}: running the activity, ${clock(task.target - progressOf(quest.user_status, "PLAY_ACTIVITY"))} to go`);
    return heartbeats(d, quest, {
        task: "PLAY_ACTIVITY",
        target: task.target,
        body: { stream_key: streamKey, terminal: false },
        closing: { stream_key: streamKey, terminal: true }
    }, signal);
}

// Reports the video position in real time, in 6 to 8 second steps
export async function watchVideo(d: Deps, quest: Quest, task: Task & { name: TaskName; }, signal: AbortSignal): Promise<Outcome> {
    const name = questName(quest);
    const post = (timestamp: number) => send(d, signal, name, "video progress", `/quests/${quest.id}/video-progress`, { timestamp });
    let done = progressOf(quest.user_status, task.name);
    let stalled = 0;
    d.log.info(`${name}: watching the video, ${clock(task.target - done)} to go`);

    while (!signal.aborted && done < task.target) {
        const step = 6 + Math.floor(Math.random() * 3);
        const timestamp = Math.min(task.target, done + step);
        const status = await post(Math.min(task.target, timestamp + Math.random()));
        if (!status) break;
        if (status.completed_at) return "completed";

        const reported = Math.floor(status.progress?.[task.name]?.value ?? timestamp);
        d.log.info(`${name}: ${clock(reported)} / ${clock(task.target)}`);
        if (reported > done) {
            done = reported;
            stalled = 0;
        } else if (++stalled >= MAX_STALLED) {
            throw new Error(`Discord takes the video progress but it is stuck at ${clock(done)}`);
        }

        if (done < task.target) await d.sleep(step * 1000 + Math.random() * 500, signal);
    }
    if (signal.aborted) return "stopped";

    const last = await post(task.target);
    if (!last) return "stopped";
    if (last.completed_at) return "completed";
    throw new Error("the video is finished but Discord has not marked the quest as complete");
}

async function run(d: Deps, quest: Quest, task: Picked, signal: AbortSignal): Promise<Outcome> {
    switch (task.name) {
        case "PLAY_ON_DESKTOP":
            return playQuest(d, quest, task, signal);
        case "PLAY_ACTIVITY":
            return playActivity(d, quest, task, signal);
        case "STREAM_ON_DESKTOP":
            if (!d.stream) throw new Error("stream quests are not available here");
            return d.stream(quest, task.target, signal);
        default:
            return watchVideo(d, quest, task, signal);
    }
}

async function enroll(d: Deps, quest: Quest, now: number, signal: AbortSignal): Promise<UserStatus> {
    for (let attempt = 0; ; attempt++) {
        try {
            const status = await d.api.post(`/quests/${quest.id}/enroll`, { location: 11 });
            return { ...status, enrolled_at: status?.enrolled_at ?? new Date(now).toISOString() };
        } catch (e: any) {
            const wait = e?.body?.retry_after;
            if (e?.status !== 429 || !wait || attempt > 0) throw e;
            d.log.warn(`Discord says to wait ${wait}s before accepting more quests`);
            await d.sleep(wait * 1000, signal);
        }
    }
}

export async function checkQuests(d: Deps, state: State, signal: AbortSignal) {
    const now = d.now?.() ?? Date.now();
    const options = d.options();
    const body = await d.api.get("/quests/@me");
    const until = (key: string) => body?.[key] ? new Date(body[key]).getTime() : 0;

    if (until("quest_access_suspended_until") > now) {
        d.log.warn(`Quests are suspended on this account until ${new Date(until("quest_access_suspended_until")).toLocaleString()}; leaving them alone`);
        return;
    }

    const quests = ((body?.quests ?? []) as Quest[]).filter(q => isListed(q) && !isExpired(q, now));

    if (options.enroll) {
        if (until("quest_enrollment_blocked_until") > now) {
            d.log.warn("Discord is not letting this account accept quests right now");
        } else {
            let accepted = 0;
            for (const q of quests.filter(q => !q.user_status?.enrolled_at)) {
                if (signal.aborted) break;
                try {
                    q.user_status = await enroll(d, q, now, signal);
                    accepted++;
                    d.log.info(`Accepted quest: ${questName(q)}`);
                    d.notify?.(`Accepted quest: ${questName(q)}`);
                    await d.sleep(ENROLL_GAP_MS, signal);
                } catch (e) {
                    d.log.error(`Could not accept ${questName(q)}: ${describeError(e)}`);
                }
            }
            if (accepted) await d.refresh();
        }
    }

    const queue: { quest: Quest; task: Picked; }[] = [];
    for (const quest of quests) {
        if (!quest.user_status?.enrolled_at || quest.user_status.completed_at) continue;

        const task = pickTask(quest, options);
        if (!task) {
            d.log.info(`Skipping ${questName(quest)}: ${Object.keys(quest.config.task_config_v2?.tasks ?? {}).join(", ") || "no task"} is not supported or switched off`);
        } else if ((state.coolOff.get(quest.id) ?? 0) <= now) {
            queue.push({ quest, task });
        }
    }

    const left = ({ quest, task }: typeof queue[number]) => task.target - progressOf(quest.user_status, task.name);
    queue.sort((a, b) => left(a) - left(b));
    d.log.info(`${quests.length} quest(s) listed, ${queue.length} to do`);

    for (const { quest, task } of queue) {
        if (signal.aborted) break;
        const name = questName(quest);
        try {
            if (await run(d, quest, task, signal) === "completed") {
                d.log.info(`Quest completed: ${name}`);
                d.notify?.(`Finished quest: ${name}`, "success");
                await d.refresh();
            }
        } catch (e: any) {
            const reason = e?.message ?? describeError(e);
            d.log.error(`Could not finish ${name}: ${reason}`);
            d.notify?.(`Could not finish ${name}: ${reason}`, "critical");
            state.coolOff.set(quest.id, (d.now?.() ?? Date.now()) + COOL_OFF_MS);
        }
    }
}
