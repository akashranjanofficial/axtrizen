import { X, Github, Linkedin, Globe, MapPin, Clock, Award, MoreHorizontal } from "lucide-react";
import { TeamMember } from "./TeamMemberCard";

interface TeamDetailPanelProps {
  member: TeamMember | null;
  onClose: () => void;
}

export function TeamDetailPanel({ member, onClose }: TeamDetailPanelProps) {
  if (!member) {
    return null;
  }

  return (
    <div className="w-96 border-l border-border bg-card/95 backdrop-blur-xl h-full absolute right-0 top-0 flex flex-col shadow-2xl z-20">
      {/* Header Image */}
      <div className="h-32 bg-gradient-to-br from-primary to-purple-900 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-6 relative flex-1 overflow-y-auto">
        {/* Avatar */}
        <div className="-mt-12 mb-4">
          <img
            src={member.avatar}
            alt={member.name}
            className="w-24 h-24 rounded-full border-4 border-background object-cover"
          />
        </div>

        {/* Profile Info */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground mb-1">{member.name}</h2>
          <p className="text-primary font-medium mb-4">{member.role}</p>

          <p className="text-sm text-muted-foreground leading-relaxed">{member.bio}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-3 rounded-xl bg-muted border border-border">
            <div className="text-xs text-muted-foreground uppercase mb-1">Projects</div>
            <div className="text-xl font-bold text-foreground">12</div>
          </div>
          <div className="p-3 rounded-xl bg-muted border border-border">
            <div className="text-xs text-muted-foreground uppercase mb-1">Commits</div>
            <div className="text-xl font-bold text-foreground">1,432</div>
          </div>
        </div>

        {/* Skills */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">
            Skills
          </h3>
          <div className="flex flex-wrap gap-2">
            {member.skills.map((skill) => (
              <span
                key={skill}
                className="px-3 py-1 rounded-full bg-muted border border-border text-xs text-muted-foreground"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>

        {/* Contact info */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" /> San Francisco, CA
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" /> 9:00 AM - 5:00 PM PST
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Globe className="h-4 w-4" /> {member.email}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-6 border-t border-border flex gap-3">
        <button className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors">
          Assign Task
        </button>
        <button className="p-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors">
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
