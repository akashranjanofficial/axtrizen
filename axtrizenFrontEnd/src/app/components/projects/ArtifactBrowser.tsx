import { FileCode, FileText, Folder, ChevronRight, ChevronDown } from "lucide-react";
import { useState } from "react";

interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
}

const mockFileSystem: FileNode[] = [
  {
    id: "src",
    name: "src",
    type: "folder",
    children: [
      {
        id: "components",
        name: "components",
        type: "folder",
        children: [
          { id: "Button.tsx", name: "Button.tsx", type: "file" },
          { id: "Header.tsx", name: "Header.tsx", type: "file" },
        ],
      },
      { id: "App.tsx", name: "App.tsx", type: "file" },
      { id: "main.tsx", name: "main.tsx", type: "file" },
    ],
  },
  { id: "package.json", name: "package.json", type: "file" },
  { id: "README.md", name: "README.md", type: "file" },
];

export function ArtifactBrowser() {
  return (
    <div className="h-full flex">
      {/* File Tree */}
      <div className="w-64 border-r border-border bg-card/50 backdrop-blur-sm p-2 overflow-y-auto">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3 px-2">
          Project Files
        </h3>
        {mockFileSystem.map((node) => (
          <FileTreeNode key={node.id} node={node} level={0} />
        ))}
      </div>

      {/* Code Preview */}
      <div className="flex-1 bg-background p-4 font-mono text-sm overflow-auto text-foreground">
        <div className="text-muted-foreground mb-2">// Select a file to view content</div>
        <div className="text-blue-400">import</div>{" "}
        <div className="text-foreground inline">React</div>{" "}
        <div className="text-blue-400 inline">from</div>{" "}
        <div className="text-green-400 inline">'react'</div>;
        <br />
        <br />
        <div className="text-purple-400 inline">export function</div>{" "}
        <div className="text-yellow-300 inline">App</div>() {"{"}
        <br />
        <div className="pl-4 text-foreground">
          return <span>&lt;div&gt;Hello World&lt;/div&gt;</span>;
        </div>
        <div>{"}"}</div>
      </div>
    </div>
  );
}

function FileTreeNode({ node, level }: { node: FileNode; level: number }) {
  const [isOpen, setIsOpen] = useState(true);
  const isFolder = node.type === "folder";

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-muted cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => isFolder && setIsOpen(!isOpen)}
      >
        {isFolder ? (
          <span className="text-muted-foreground">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        ) : (
          <span className="w-4" />
        )}

        {isFolder ? (
          <Folder className="h-4 w-4 text-blue-400" />
        ) : node.name.endsWith(".tsx") ? (
          <FileCode className="h-4 w-4 text-yellow-400" />
        ) : (
          <FileText className="h-4 w-4 text-muted-foreground" />
        )}

        <span className="text-sm truncate">{node.name}</span>
      </div>

      {isFolder && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
