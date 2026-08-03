import "server-only";
import { EventEmitter } from "node:events";
import type { ChatMessage, LiveEvent } from "./live-events";

/**
 * In-process pub/sub for SSE clients.
 *
 * One Node process (see deploy/warzone.service) → one bus is enough. Survives
 * hot reloads via globalThis. Does NOT cross multiple instances — if you ever
 * run two app processes, replace this with Redis/SQLite notify.
 */

type Listener = (event: LiveEvent) => void;

class LiveBus {
  /** Changes when the process starts — clients treat a new boot as a full resync. */
  readonly boot = Date.now();
  /** Monotonic map generation; bump on any map-affecting write. */
  private version = 0;
  private readonly ee = new EventEmitter();

  constructor() {
    // Many officers × tabs; default 10 is too low.
    this.ee.setMaxListeners(200);
  }

  getVersion(): number {
    return this.version;
  }

  /** After a successful map write. Returns the new version. */
  notifyMapChanged(): number {
    this.version += 1;
    const t = Math.floor(Date.now() / 1000);
    this.publish({
      type: "map.version",
      boot: this.boot,
      version: this.version,
      t,
    });
    return this.version;
  }

  /**
   * After a chat line is committed. No version counter: the message carries
   * its own id, and the room catches up by asking for everything after the
   * last id it holds (`/api/chat?after=`).
   */
  notifyChat(message: ChatMessage): void {
    this.publish({
      type: "chat.message",
      boot: this.boot,
      message,
      t: Math.floor(Date.now() / 1000),
    });
  }

  /** Ephemeral typing pulse — not persisted, not versioned. */
  notifyTyping(userId: number, nick: string, active: boolean): void {
    this.publish({
      type: "chat.typing",
      boot: this.boot,
      userId,
      nick,
      active,
      t: Math.floor(Date.now() / 1000),
    });
  }

  /** Shared expansion plan (trails) changed — officers re-pull the snapshot. */
  notifyPlanChanged(): void {
    this.publish({
      type: "plan.changed",
      boot: this.boot,
      t: Math.floor(Date.now() / 1000),
    });
  }

  publish(event: LiveEvent): void {
    this.ee.emit("event", event);
  }

  subscribe(listener: Listener): () => void {
    this.ee.on("event", listener);
    return () => {
      this.ee.off("event", listener);
    };
  }

  hello(): LiveEvent {
    return {
      type: "hello",
      boot: this.boot,
      version: this.version,
      t: Math.floor(Date.now() / 1000),
    };
  }
}

/**
 * Bump when `LiveBus` gains methods that callers depend on. The bus is kept on
 * `globalThis` so open SSE streams survive hot reloads; without a version the
 * old instance stays forever and new methods (`notifyChat`, …) are missing
 * until a full process restart — which is exactly the TypeError that made a
 * sent chat line look like a failure after HMR in dev.
 */
const LIVE_BUS_API = 4;

type LiveBusSlot = { api: number; bus: LiveBus };

const globalForLive = globalThis as unknown as {
  __warzoneLive?: LiveBusSlot | LiveBus;
};

function isCurrentSlot(v: unknown): v is LiveBusSlot {
  return (
    !!v &&
    typeof v === "object" &&
    "api" in v &&
    "bus" in v &&
    (v as LiveBusSlot).api === LIVE_BUS_API &&
    typeof (v as LiveBusSlot).bus?.notifyChat === "function" &&
    typeof (v as LiveBusSlot).bus?.notifyTyping === "function" &&
    typeof (v as LiveBusSlot).bus?.notifyPlanChanged === "function"
  );
}

export function getLiveBus(): LiveBus {
  if (isCurrentSlot(globalForLive.__warzoneLive)) {
    return globalForLive.__warzoneLive.bus;
  }
  const bus = new LiveBus();
  globalForLive.__warzoneLive = { api: LIVE_BUS_API, bus };
  return bus;
}

/** Call from every mutator that changes nodes/edges/kingdoms/ownership. */
export function notifyMapChanged(): number {
  return getLiveBus().notifyMapChanged();
}

/** Call after a chat line is written. */
export function notifyChat(message: ChatMessage): void {
  getLiveBus().notifyChat(message);
}

/** Broadcast a typing start/stop. Best-effort; never blocks the room. */
export function notifyTyping(
  userId: number,
  nick: string,
  active: boolean,
): void {
  getLiveBus().notifyTyping(userId, nick, active);
}

/** Shared capture plan edited. */
export function notifyPlanChanged(): void {
  getLiveBus().notifyPlanChanged();
}
