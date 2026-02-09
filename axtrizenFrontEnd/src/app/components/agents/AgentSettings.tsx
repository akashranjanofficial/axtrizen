import { Settings as SettingsIcon, Save, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Agent } from "../AgentsView";

interface AgentSettingsProps {
  agent: Agent;
}

export function AgentSettings({ agent }: AgentSettingsProps) {
  const [systemPrompt, setSystemPrompt] = useState(
    `You are a senior software developer specializing in backend development with Node.js and TypeScript.

# Role and Expertise
- Build robust, scalable RESTful APIs
- Follow industry best practices and security standards
- Write clean, maintainable code with proper documentation
- Implement comprehensive error handling and logging

# Guidelines
1. Always prioritize security in authentication and data handling
2. Use TypeScript for type safety
3. Write unit tests for all critical functionality
4. Follow SOLID principles and design patterns
5. Implement proper input validation and sanitization

# Tools Available
- run_sql_query: Execute SQL queries on the database
- write_file: Create or modify code files
- execute_code: Run code and tests
- search_docs: Search documentation and knowledge base
- api_request: Make HTTP requests to external APIs

# Communication Style
- Be concise and technical
- Explain complex decisions when needed
- Ask for clarification when requirements are ambiguous`,
  );

  const [selectedModel, setSelectedModel] = useState(agent.model);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [topP, setTopP] = useState(0.9);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <SettingsIcon className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-foreground">Agent Configuration</h3>
            <p className="text-xs text-muted-foreground">Customize behavior and parameters</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/50">
            <Save className="h-4 w-4" />
            Save Changes
          </button>
        </div>
      </div>

      {/* System Prompt */}
      <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
        <div className="mb-4">
          <label className="text-foreground mb-2 block">System Prompt</label>
          <p className="text-xs text-muted-foreground mb-4">
            Define the agent's personality, expertise, and instructions. Supports markdown
            formatting.
          </p>
        </div>

        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={16}
          className="w-full rounded-xl border border-border bg-muted p-4 text-sm text-foreground font-mono resize-none focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />

        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{systemPrompt.length} characters</span>
          <span>~{Math.ceil(systemPrompt.split(" ").length / 0.75)} tokens</span>
        </div>
      </div>

      {/* Model Configuration */}
      <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
        <h4 className="text-foreground mb-4">Model Configuration</h4>

        <div className="space-y-6">
          {/* Model Selection */}
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="Claude 3.5 Sonnet">Claude 3.5 Sonnet</option>
              <option value="GPT-4o">GPT-4o</option>
              <option value="GPT-4 Turbo">GPT-4 Turbo</option>
              <option value="Claude 3 Opus">Claude 3 Opus</option>
              <option value="GPT-3.5 Turbo">GPT-3.5 Turbo</option>
            </select>
            <p className="mt-2 text-xs text-muted-foreground">
              Different models have varying capabilities, costs, and token limits.
            </p>
          </div>

          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-muted-foreground">Temperature</label>
              <span className="text-sm text-foreground font-mono">{temperature.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full h-2 rounded-full bg-muted appearance-none cursor-pointer slider accent-primary"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Controls randomness. Lower values = more focused, higher values = more creative.
            </p>
          </div>

          {/* Max Tokens */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-muted-foreground">Max Tokens</label>
              <span className="text-sm text-foreground font-mono">
                {maxTokens.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min="512"
              max="8192"
              step="256"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value))}
              className="w-full h-2 rounded-full bg-muted appearance-none cursor-pointer accent-primary"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Maximum length of the agent's response. Higher values = longer responses.
            </p>
          </div>

          {/* Top P */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-muted-foreground">Top P (Nucleus Sampling)</label>
              <span className="text-sm text-foreground font-mono">{topP.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={topP}
              onChange={(e) => setTopP(parseFloat(e.target.value))}
              className="w-full h-2 rounded-full bg-muted appearance-none cursor-pointer accent-primary"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Alternative to temperature. Considers only most likely tokens that sum to this
              probability.
            </p>
          </div>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
        <h4 className="text-foreground mb-4">Advanced Settings</h4>

        <div className="space-y-4">
          {/* Tool Access */}
          <div>
            <label className="text-sm text-muted-foreground mb-3 block">Tool Access</label>
            <div className="space-y-2">
              {[
                { id: "sql", label: "Database Queries", enabled: true },
                { id: "file", label: "File Operations", enabled: true },
                { id: "code", label: "Code Execution", enabled: true },
                { id: "api", label: "API Requests", enabled: false },
                { id: "search", label: "Documentation Search", enabled: true },
              ].map((tool) => (
                <label
                  key={tool.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted cursor-pointer hover:bg-muted/80 transition-colors"
                >
                  <span className="text-sm text-foreground">{tool.label}</span>
                  <input
                    type="checkbox"
                    defaultChecked={tool.enabled}
                    className="rounded border-border bg-card text-primary focus:ring-primary/20"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Context Window */}
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Context Window Limit</label>
            <select className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20">
              <option value="16k">16,384 tokens</option>
              <option value="32k">32,768 tokens</option>
              <option value="64k">65,536 tokens</option>
              <option value="128k">128,000 tokens</option>
            </select>
          </div>

          {/* Auto-save Memory */}
          <label className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted cursor-pointer hover:bg-muted/80 transition-colors">
            <div>
              <p className="text-sm text-foreground mb-1">Auto-save to Long-term Memory</p>
              <p className="text-xs text-muted-foreground">
                Automatically store important context in vector database
              </p>
            </div>
            <input
              type="checkbox"
              defaultChecked={true}
              className="rounded border-border bg-card text-primary focus:ring-primary/20"
            />
          </label>

          {/* Rate Limiting */}
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Rate Limiting</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="number"
                  placeholder="Requests per minute"
                  defaultValue={60}
                  className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <input
                  type="number"
                  placeholder="Tokens per hour"
                  defaultValue={100000}
                  className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
