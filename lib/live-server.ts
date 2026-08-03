import "server-only";
import { EventEmitter } from "node:events";
import type { LiveEvent } from "./live-events";

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

const globalForLive = globalThis as unknown as { __warzoneLive?: LiveBus };

export function getLiveBus(): LiveBus {
  if (!globalForLive.__warzoneLive) {
    globalForLive.__warzoneLive = new LiveBus();
  }
  return globalForLive.__warzoneLive;
}

/** Call from every mutator that changes nodes/edges/kingdoms/ownership. */
export function notifyMapChanged(): number {
  return getLiveBus().notifyMapChanged();
}
