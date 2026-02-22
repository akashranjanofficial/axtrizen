/**
 * Simple activity event log with localStorage persistence.
 * Tracks agent creation, status changes, and messages.
 */

export interface ActivityEvent {
  id: string;
  agent: string;
  action: string;
  timestamp: string;
  status: "success" | "error" | "pending";
  role: "Dev" | "QA" | "Design";
}

const STORAGE_KEY = "axtrizen_activity";
const MAX_EVENTS = 50;

type Listener = () => void;

class ActivityStore {
  private events: ActivityEvent[] = [];
  private listeners = new Set<Listener>();

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.events = JSON.parse(raw);
      }
    } catch {
      this.events = [];
    }
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events.slice(0, MAX_EVENTS)));
    } catch {
      /* full */
    }
  }

  private notify() {
    for (const fn of this.listeners) {
      fn();
    }
  }

  getEvents(): ActivityEvent[] {
    return [...this.events];
  }

  addEvent(
    agent: string,
    action: string,
    status: ActivityEvent["status"] = "success",
    role: ActivityEvent["role"] = "Dev",
  ) {
    const now = new Date();
    const timestamp =
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
      " · " +
      now.toLocaleDateString();
    this.events.unshift({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      agent,
      action,
      timestamp,
      status,
      role,
    });
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(0, MAX_EVENTS);
    }
    this.save();
    this.notify();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const activityStore = new ActivityStore();
