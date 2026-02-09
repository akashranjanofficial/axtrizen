import { LucideIcon } from "lucide-react";

export interface User {
  id: string;
  name: string;
  role: string;
  avatar: string; // Emoji or URL
  status: "online" | "offline" | "busy";
  type: "agent" | "manager" | "human";
  managerId?: string; // For agents
  specialty?: string; // For managers
  reports?: string[]; // IDs of agents reporting to this manager
  email?: string; // For contact info
  bio?: string;
  location?: string;
}

export interface ChatThread {
  id: string;
  type: "direct" | "group";
  participants: string[]; // User IDs
  name?: string; // For groups
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  avatar?: string; // For groups
}

// Strictly empty initial data
export const initialAgents: User[] = [];
export const initialManagers: User[] = [];
export const initialThreads: ChatThread[] = [];

// Simple Event Bus for data updates
type Listener = () => void;
let listeners: Listener[] = [];

export const mockDataStore = {
  agents: [...initialAgents],
  managers: [...initialManagers],
  threads: [...initialThreads],

  // Getters
  getAgents: () => mockDataStore.agents,
  getManagers: () => mockDataStore.managers,
  getAllUsers: () => [...mockDataStore.managers, ...mockDataStore.agents],
  getThreads: () => mockDataStore.threads,

  // Actions
  addAgent: (agent: User) => {
    mockDataStore.agents.push(agent);
    mockDataStore.notify();
  },

  addManager: (manager: User) => {
    mockDataStore.managers.push(manager);
    // Auto-create group chat for the manager's team
    const newThread: ChatThread = {
      id: `t-${Date.now()}`,
      type: "group",
      participants: [manager.id, ...(manager.reports || [])],
      name: `Team ${manager.name}`,
      lastMessage: "Group created",
      lastMessageTime: "Just now",
      unreadCount: 0,
    };
    mockDataStore.threads.push(newThread);
    mockDataStore.notify();
  },

  assignAgent: (managerId: string, agentId: string) => {
    // Update manager's reports
    const manager = mockDataStore.managers.find((m) => m.id === managerId);
    if (manager && manager.reports) {
      if (!manager.reports.includes(agentId)) {
        manager.reports.push(agentId);
      }
    }

    // Update agent's managerId
    const agent = mockDataStore.agents.find((a) => a.id === agentId);
    if (agent) {
      agent.managerId = managerId;
    }

    // Update group thread if it exists
    const thread = mockDataStore.threads.find((t) => t.name === `Team ${manager?.name}`);
    if (thread) {
      if (!thread.participants.includes(agentId)) {
        thread.participants.push(agentId);
      }
    }

    mockDataStore.notify();
  },

  subscribe: (listener: Listener) => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },

  notify: () => {
    listeners.forEach((l) => l());
  },
};
