import type { Node } from "./node.js";
import { Role } from "./types.js";

/**
 * Election handles leader detection and role transitions.
 *
 * On start it attempts to become leader (by binding the port).
 * If the port is taken and a healthy leader is found, it becomes a follower.
 * A periodic ticker monitors the leader and triggers takeover if it dies.
 *
 * The ticker is paused while we are the leader (nothing to monitor) and
 * resumed when we transition back to Follower.
 */
export class Election {
  private interval: ReturnType<typeof setInterval> | null = null;
  private leaderUrl: string;

  constructor(
    private port: number,
    private node: Node
  ) {
    this.leaderUrl = `http://localhost:${port}`;
  }

  async start(): Promise<void> {
    // Determine initial role
    await this.determineRole();

    // Only start the monitoring ticker if we are a Follower — Leaders
    // have nothing to monitor and would just waste a fetch every 3-5s.
    if (this.node.role === Role.Follower || this.node.role === Role.Unknown) {
      this.startTicker();
    }
  }

  stop(): void {
    this.clearTicker();
  }

  private startTicker(): void {
    if (this.interval) return;
    // Random jitter (3-5s) prevents synchronized polling from
    // multiple Followers hammering the Leader.
    const jitter = 3_000 + Math.random() * 2_000;
    this.interval = setInterval(() => {
      this.checkAndUpdateRole().catch((err) => {
        console.error("Election check error:", err);
      });
    }, jitter);
  }

  private clearTicker(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async checkAndUpdateRole(): Promise<void> {
    switch (this.node.role) {
      case Role.Follower: {
        const alive = await this.pingLeader();
        if (!alive) {
          console.error("Leader not responding, attempting takeover...");
          try {
            await this.node.becomeLeader();
            // We just became Leader — stop polling until something
            // changes our role again.
            this.clearTicker();
          } catch (err) {
            console.error("Failed to become leader:", err);
          }
        }
        break;
      }
      case Role.Leader:
        // Defensive: if we somehow end up here with a running ticker,
        // stop it. (Normally startTicker() is not called when Leader.)
        this.clearTicker();
        break;
      case Role.Unknown:
        await this.determineRole();
        if (this.node.role === Role.Follower) {
          this.startTicker();
        } else {
          this.clearTicker();
        }
        break;
    }
  }

  private async determineRole(): Promise<void> {
    // Try to become leader first
    try {
      await this.node.becomeLeader();
      return;
    } catch {
      // Port likely in use — check if there's a valid leader
    }

    if (await this.pingLeader()) {
      this.node.becomeFollower();
    }
    // If ping fails too, next tick will retry
  }

  private async pingLeader(): Promise<boolean> {
    try {
      const response = await fetch(`${this.leaderUrl}/ping`, {
        signal: AbortSignal.timeout(2_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
