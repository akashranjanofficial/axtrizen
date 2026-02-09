import { X, UserPlus, Check } from "lucide-react";
import { useState } from "react";
import { Manager } from "./EngineeringManagerCard";

interface CreateManagerModalProps {
  onClose: () => void;
  onCreate: (manager: Manager) => void;
}

export function CreateManagerModal({ onClose, onCreate }: CreateManagerModalProps) {
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200",
  ); // Default avatar

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !specialty) {
      return;
    }

    const newManager: Manager = {
      id: `m-${Date.now()}`,
      name,
      role: "Engineering Manager",
      specialty,
      avatar: avatarUrl,
      reports: [], // Starts with empty team
    };

    onCreate(newManager);
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl relative">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground">Hire Engineering Manager</h2>
            <p className="text-sm text-muted-foreground">Add a new leader to your organization</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name Input */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gamma-Core"
              className="w-full bg-muted border border-border rounded-xl px-4 py-2 text-foreground focus:outline-none focus:border-primary"
              autoFocus
            />
          </div>

          {/* Specialty Input */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Specialty / Domain
            </label>
            <input
              type="text"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              placeholder="e.g. QA Automation, Security"
              className="w-full bg-muted border border-border rounded-xl px-4 py-2 text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          {/* Avatar Selection (Simplified) */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Select Avatar
            </label>
            <div className="flex gap-2">
              {[
                "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200",
                "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200",
                "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200",
                "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200",
              ].map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setAvatarUrl(url)}
                  className={`w-10 h-10 rounded-full overflow-hidden border-2 transition-all ${
                    avatarUrl === url
                      ? "border-primary scale-110"
                      : "border-transparent opacity-50 hover:opacity-100"
                  }`}
                >
                  <img src={url} alt="Avatar option" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-border text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name || !specialty}
              className="flex-1 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="h-4 w-4" />
              Create Manager
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
