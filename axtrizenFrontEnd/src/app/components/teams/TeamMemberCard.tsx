import { Mail, MessageSquare, MoreHorizontal, Github, Linkedin, Twitter } from "lucide-react";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
  status: "online" | "offline" | "busy";
  skills: string[];
  bio: string;
  email: string;
}

interface TeamMemberCardProps {
  member: TeamMember;
  onClick: (member: TeamMember) => void;
}

export function TeamMemberCard({ member, onClick }: TeamMemberCardProps) {
  const statusColors = {
    online: "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]",
    offline: "bg-gray-500",
    busy: "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]",
  };

  return (
    <div
      onClick={() => onClick(member)}
      className="group relative p-6 rounded-2xl bg-card border border-border hover:bg-muted hover:border-primary/50 transition-all cursor-pointer overflow-hidden backdrop-blur-sm"
    >
      {/* Glow Effect */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl group-hover:bg-primary/30 transition-all" />

      <div className="flex flex-col items-center relative z-10">
        {/* Avatar */}
        <div className="relative mb-4">
          <img
            src={member.avatar}
            alt={member.name}
            className="w-20 h-20 rounded-full object-cover border-2 border-border group-hover:border-primary transition-colors"
          />
          <div
            className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-background ${statusColors[member.status]}`}
          />
        </div>

        {/* Info */}
        <h3 className="text-lg font-bold text-foreground mb-1">{member.name}</h3>
        <p className="text-xs text-primary font-medium uppercase tracking-wider mb-4">
          {member.role}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          {member.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="px-2 py-1 rounded bg-muted text-xs text-muted-foreground border border-border"
            >
              {skill}
            </span>
          ))}
          {member.skills.length > 3 && (
            <span className="px-2 py-1 rounded bg-muted text-xs text-muted-foreground border border-border">
              +{member.skills.length - 3}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 w-full">
          <button className="flex-1 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium border border-border transition-colors flex items-center justify-center gap-2">
            <MessageSquare className="h-3 w-3" /> Message
          </button>
          <button className="p-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border transition-colors">
            <Mail className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
