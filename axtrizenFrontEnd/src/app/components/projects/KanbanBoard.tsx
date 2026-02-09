import { Plus, MoreHorizontal } from "lucide-react";
import { useState } from "react";

interface Task {
  id: string;
  title: string;
  assignee?: string;
  priority: "high" | "medium" | "low";
}

interface Column {
  id: string;
  title: string;
  tasks: Task[];
}

const mockColumns: Column[] = [
  {
    id: "backlog",
    title: "Backlog",
    tasks: [
      { id: "t1", title: "Setup CI/CD pipeline", priority: "medium" },
      { id: "t2", title: "Write unit tests for Auth", priority: "high" },
    ],
  },
  {
    id: "todo",
    title: "To Do",
    tasks: [{ id: "t3", title: "Implement Login API", priority: "high", assignee: "Dev1" }],
  },
  {
    id: "in-progress",
    title: "In Progress",
    tasks: [{ id: "t4", title: "Design Database Schema", priority: "high", assignee: "Architect" }],
  },
  {
    id: "done",
    title: "Done",
    tasks: [{ id: "t5", title: "Project Kickoff", priority: "low", assignee: "PM" }],
  },
];

const priorityColors = {
  high: "bg-red-500/20 text-red-300 border-red-500/30",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

export function KanbanBoard() {
  const [columns, setColumns] = useState(mockColumns);

  return (
    <div className="flex h-full gap-4 overflow-x-auto p-4">
      {columns.map((column) => (
        <div
          key={column.id}
          className="w-80 flex-shrink-0 flex flex-col rounded-xl bg-card border border-border backdrop-blur-sm"
        >
          {/* Header */}
          <div className="p-3 border-b border-border flex justify-between items-center">
            <h3 className="font-medium text-foreground">{column.title}</h3>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {column.tasks.length}
            </span>
          </div>

          {/* Task List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {column.tasks.map((task) => (
              <div
                key={task.id}
                className="group p-3 rounded-lg bg-muted/50 border border-border hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing"
              >
                <div className="flex justify-between items-start mb-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${priorityColors[task.priority]}`}
                  >
                    {task.priority.toUpperCase()}
                  </span>
                  <button className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm text-foreground mb-3">{task.title}</p>
                {task.assignee && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="h-5 w-5 rounded bg-primary flex items-center justify-center text-[10px] text-primary-foreground">
                      {task.assignee.charAt(0)}
                    </div>
                    <span>{task.assignee}</span>
                  </div>
                )}
              </div>
            ))}

            <button className="w-full py-2 flex items-center justify-center text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg border border-transparent hover:border-border border-dashed transition-all">
              <Plus className="h-4 w-4 mr-1" /> Add Task
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
