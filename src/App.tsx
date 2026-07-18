import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  comments: string[];
}

interface AgentLog {
  timestamp: string;
  message: string;
  level: string;
}

interface AppConfig {
  active_provider: string;
  agy_path: string;
  claude_command: string;
  gemini_api_key: string;
}

interface DetectedTools {
  agy: boolean;
  claude: boolean;
}

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

interface EditorTab {
  name: string;
  path: string;
}

function App() {
  // Filesystem States
  const [rootFiles, setRootFiles] = useState<FileEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<{ [path: string]: boolean }>({});
  const [expandedDirContents, setExpandedDirContents] = useState<{ [path: string]: FileEntry[] }>({});
  
  // Editor States
  const [openTabs, setOpenTabs] = useState<EditorTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [tabContents, setTabContents] = useState<{ [path: string]: string }>({});
  const [unsavedFiles, setUnsavedFiles] = useState<Set<string>>(new Set());

  // Tasks & Run configuration States
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [terminalPrompt, setTerminalPrompt] = useState("");
  const [isListening, setIsListening] = useState(true);

  // App Settings States
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<AppConfig>({
    active_provider: "mock",
    agy_path: "/Users/michaelortali/.local/bin/agy",
    claude_command: "claude",
    gemini_api_key: ""
  });
  const [detectedTools, setDetectedTools] = useState<DetectedTools>({
    agy: false,
    claude: false
  });

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Initialize data
  useEffect(() => {
    loadRootFiles();
    loadTasks();
    loadConfig();
    checkTools();
    addSystemLog("WYAIWYG IDE environment initialized successfully.", "success");
    addSystemLog("Ready for development. Select a Task config to run active Agent.", "info");
  }, []);

  // Auto-scroll logs terminal
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Periodic simulated comment streaming
  useEffect(() => {
    if (!isListening) return;

    const interval = setInterval(() => {
      const randomComments = [
        "GitHub Webhook: New comment from xethorn on #1: 'Let's adjust the layout to be more IntelliJ-like.'",
        "GitHub Webhook: New comment from xethorn on #2: 'Refactored backend modules into config and agent packages.'",
        "GitHub Webhook: Task #3 marked as active development target.",
        "GitHub Webhook: Pushed verification complete on main branch."
      ];
      
      const randomMsg = randomComments[Math.floor(Math.random() * randomComments.length)];
      addSystemLog(randomMsg, "info");
    }, 25000);

    return () => clearInterval(interval);
  }, [isListening]);

  // Load root level directory
  const loadRootFiles = async () => {
    try {
      const entries = await invoke<FileEntry[]>("get_dir_entries", { dirPath: null });
      setRootFiles(entries);
    } catch (error) {
      addSystemLog(`Failed to load directory explorer: ${error}`, "error");
    }
  };

  // Toggle folders lazily
  const toggleDir = async (path: string) => {
    if (expandedDirs[path]) {
      setExpandedDirs((prev) => ({ ...prev, [path]: false }));
    } else {
      try {
        const subEntries = await invoke<FileEntry[]>("get_dir_entries", { dirPath: path });
        setExpandedDirContents((prev) => ({ ...prev, [path]: subEntries }));
        setExpandedDirs((prev) => ({ ...prev, [path]: true }));
      } catch (error) {
        addSystemLog(`Failed to expand folder: ${error}`, "error");
      }
    }
  };

  // Load tasks / GitHub Issues
  const loadTasks = async () => {
    try {
      const fetchedTasks = await invoke<Task[]>("fetch_tasks");
      setTasks(fetchedTasks);
      // Auto-select first task as default run configuration
      if (fetchedTasks.length > 0 && !selectedTaskId) {
        setSelectedTaskId(fetchedTasks[0].id);
      }
    } catch (error) {
      addSystemLog(`Failed to load GitHub run configurations: ${error}`, "error");
    }
  };

  const loadConfig = async () => {
    try {
      const loadedConfig = await invoke<AppConfig>("get_config");
      setConfig(loadedConfig);
    } catch (error) {
      addSystemLog(`Failed to load app settings: ${error}`, "error");
    }
  };

  const checkTools = async () => {
    try {
      const tools = await invoke<DetectedTools>("detect_tools");
      setDetectedTools(tools);
    } catch (error) {
      addSystemLog(`Failed to check installed toolchains: ${error}`, "error");
    }
  };

  const handleSaveConfig = async () => {
    try {
      await invoke("save_config", { config });
      addSystemLog(`Settings updated. Active AI provider: ${config.active_provider}`, "success");
      setShowSettings(false);
    } catch (error) {
      addSystemLog(`Failed to save settings: ${error}`, "error");
    }
  };

  // Open file in editor tab
  const handleOpenFile = async (name: string, path: string) => {
    // If tab is already open, just focus it
    if (openTabs.some((tab) => tab.path === path)) {
      setActiveTabPath(path);
      return;
    }

    try {
      const content = await invoke<string>("get_file_content", { filePath: path });
      setTabContents((prev) => ({ ...prev, [path]: content }));
      setOpenTabs((prev) => [...prev, { name, path }]);
      setActiveTabPath(path);
    } catch (error) {
      addSystemLog(`Failed to open file: ${error}`, "error");
    }
  };

  // Close tab
  const handleCloseTab = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    const updatedTabs = openTabs.filter((tab) => tab.path !== path);
    setOpenTabs(updatedTabs);

    if (activeTabPath === path) {
      if (updatedTabs.length > 0) {
        setActiveTabPath(updatedTabs[updatedTabs.length - 1].path);
      } else {
        setActiveTabPath(null);
      }
    }
  };

  // Save changes to disk
  const handleSaveFile = async (path: string) => {
    const content = tabContents[path];
    if (content === undefined) return;

    try {
      await invoke("save_file_content", { filePath: path, content });
      setUnsavedFiles((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      addSystemLog(`File saved: ${path.split("/").pop()}`, "success");
    } catch (error) {
      addSystemLog(`Failed to save file: ${error}`, "error");
    }
  };

  // Handle local text area editing
  const handleTextChange = (path: string, content: string) => {
    setTabContents((prev) => ({ ...prev, [path]: content }));
    setUnsavedFiles((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  };

  const addSystemLog = (message: string, level: string = "info") => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { timestamp: time, message, level }]);
  };

  // Execute Agent Development Cycle
  const handleRunAgent = async (taskId: string) => {
    if (isExecuting || !taskId) return;
    setIsExecuting(true);
    addSystemLog(`Launching development target for Task #${taskId}...`, "info");

    try {
      const executionLogs = await invoke<AgentLog[]>("execute_task", { taskId });
      
      executionLogs.forEach((log, index) => {
        setTimeout(() => {
          let time = log.timestamp;
          if (!isNaN(Number(log.timestamp))) {
            time = new Date(parseInt(log.timestamp) * 1000).toLocaleTimeString();
          }
          setLogs((prev) => [...prev, { timestamp: time, message: log.message, level: log.level }]);
          
          if (index === executionLogs.length - 1) {
            setIsExecuting(false);
            loadTasks();
            // Reload root files as files might have been edited by the agent!
            loadRootFiles();
            // If active tab is open, reload its content from disk!
            if (activeTabPath) {
              reloadFileFromDisk(activeTabPath);
            }
          }
        }, index * 800);
      });

    } catch (error) {
      addSystemLog(`Agent run failed: ${error}`, "error");
      setIsExecuting(false);
    }
  };

  const reloadFileFromDisk = async (path: string) => {
    try {
      const content = await invoke<string>("get_file_content", { filePath: path });
      setTabContents((prev) => ({ ...prev, [path]: content }));
      setUnsavedFiles((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    } catch (_) {}
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalPrompt.trim()) return;

    addSystemLog(`Terminal Command: "${terminalPrompt}"`, "info");
    
    // If the terminal command looks like a prompt instruction, we trigger the agent to execute it!
    if (selectedTaskId) {
      handleRunAgent(selectedTaskId);
    } else {
      addSystemLog("Select a task config run configuration to execute terminal agent instructions.", "warning");
    }

    setTerminalPrompt("");
  };

  // Render file tree recursively
  const renderTreeNodes = (entries: FileEntry[], depth = 0) => {
    return entries.map((entry) => {
      const isExpanded = expandedDirs[entry.path];
      const childEntries = expandedDirContents[entry.path] || [];

      return (
        <div key={entry.path}>
          <div 
            className={`tree-node ${activeTabPath === entry.path ? "file-active" : ""}`}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => {
              if (entry.is_dir) {
                toggleDir(entry.path);
              } else {
                handleOpenFile(entry.name, entry.path);
              }
            }}
          >
            <span className="node-icon">
              {entry.is_dir ? (isExpanded ? "📂" : "📁") : "📄"}
            </span>
            <span>{entry.name}</span>
          </div>
          {entry.is_dir && isExpanded && renderTreeNodes(childEntries, depth + 1)}
        </div>
      );
    });
  };

  // Generate editor line numbers array
  const getLineNumbers = (content: string | undefined) => {
    if (!content) return [1];
    const lines = content.split("\n").length;
    return Array.from({ length: lines }, (_, i) => i + 1);
  };

  return (
    <div className="app-container">
      {/* IntelliJ Style Top Header Toolbar */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">W</div>
          <span className="brand-name">wyaiwyg [Workspace]</span>
        </div>

        <div className="toolbar-actions">
          {/* Active run configuration dropdown */}
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Run Task:</span>
          <select
            className="run-config-select"
            value={selectedTaskId}
            onChange={(e) => setSelectedTaskId(e.target.value)}
          >
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                #{task.id} {task.title.substring(0, 30)}... ({task.status})
              </option>
            ))}
          </select>

          {/* IntelliJ Play Icon Button */}
          <button 
            className="icon-btn btn-run"
            disabled={isExecuting || !selectedTaskId}
            onClick={() => handleRunAgent(selectedTaskId)}
            title="Run Agent on Configuration"
          >
            <span style={{ fontSize: "0.95rem" }}>▶</span>
          </button>

          <span style={{ width: "1px", height: "14px", backgroundColor: "var(--border-color)", margin: "0 0.25rem" }}></span>

          <button className="btn-secondary" style={{ padding: "0.15rem 0.4rem", fontSize: "0.725rem" }} onClick={() => setShowSettings(true)}>
            ⚙ Settings
          </button>
          
          <button className="btn-secondary" style={{ padding: "0.15rem 0.4rem", fontSize: "0.725rem" }} onClick={loadTasks}>
            Sync
          </button>
        </div>
      </header>

      {/* Main Layout Split */}
      <div className="main-layout">
        
        {/* Left pane: Project explorer */}
        <aside className="project-sidebar">
          <div className="sidebar-header">
            <span>Project Files</span>
          </div>
          <div className="file-tree-container">
            {renderTreeNodes(rootFiles)}
          </div>
        </aside>

        {/* Right pane: Tabs + Editor + Bottom Console */}
        <main className="workspace-container">
          
          {/* Tabs bar */}
          <div className="editor-tabs-bar">
            {openTabs.map((tab) => (
              <div 
                key={tab.path} 
                className={`editor-tab ${activeTabPath === tab.path ? "active" : ""}`}
                onClick={() => setActiveTabPath(tab.path)}
              >
                <span>{tab.name}</span>
                {unsavedFiles.has(tab.path) && <span style={{ color: "var(--accent-yellow)", fontSize: "0.6rem" }}>●</span>}
                <span className="tab-close-btn" onClick={(e) => handleCloseTab(e, tab.path)}>
                  ✕
                </span>
              </div>
            ))}
          </div>

          {/* Code Editor space */}
          <div className="editor-content-area">
            {activeTabPath ? (
              <div className="editor-textarea-container">
                {/* Save shortcut handler or save action button */}
                <button 
                  className="action-btn" 
                  style={{ position: "absolute", right: "20px", top: "15px", zIndex: 10, padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}
                  disabled={!unsavedFiles.has(activeTabPath)}
                  onClick={() => handleSaveFile(activeTabPath)}
                >
                  Save Code
                </button>

                <div className="editor-line-numbers">
                  {getLineNumbers(tabContents[activeTabPath]).map((num) => (
                    <div key={num}>{num}</div>
                  ))}
                </div>
                
                <textarea
                  className="editor-code-input"
                  value={tabContents[activeTabPath] || ""}
                  onChange={(e) => handleTextChange(activeTabPath, e.target.value)}
                />
              </div>
            ) : (
              <div className="editor-placeholder">
                <div style={{ marginBottom: "0.5rem", fontSize: "1rem" }}>No File Open</div>
                <div style={{ fontSize: "0.75rem", opacity: 0.6 }}>Double-click a file in the sidebar explorer to start editing code.</div>
              </div>
            )}
          </div>

          {/* Bottom terminal logs drawer */}
          <footer className="terminal-drawer">
            <div className="terminal-header">
              <span className="terminal-title">Agent Terminal Console</span>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                  Webhook Listener:
                </span>
                <span className={`status-dot ${isListening ? "active" : ""}`} style={{ width: "6px", height: "6px" }} />
                <button 
                  className="btn-secondary" 
                  style={{ padding: "0.05rem 0.35rem", fontSize: "0.65rem" }} 
                  onClick={() => setIsListening(!isListening)}
                >
                  {isListening ? "Pause" : "Listen"}
                </button>
                <button className="btn-secondary" style={{ padding: "0.05rem 0.35rem", fontSize: "0.65rem" }} onClick={() => setLogs([])}>
                  Clear
                </button>
              </div>
            </div>

            <div className="terminal-logs">
              {logs.length === 0 ? (
                <div className="terminal-placeholder">Ready. Spawn the agent to run edits in this workspace.</div>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className="log-entry">
                    <span className="log-time">[{log.timestamp}]</span>
                    <span className={`log-msg log-${log.level}`}>{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>

            {/* Terminal prompt input for direct commands */}
            <form className="terminal-prompt-bar" onSubmit={handleTerminalSubmit}>
              <span className="terminal-prompt-symbol">&gt;</span>
              <input 
                type="text"
                className="terminal-prompt-input"
                placeholder="Ask Agent to edit workspace (e.g. 'Add route config')..."
                value={terminalPrompt}
                onChange={(e) => setTerminalPrompt(e.target.value)}
              />
            </form>
          </footer>

        </main>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3 className="modal-title">AI Provider Configuration</h3>
              <button className="btn-secondary" style={{ padding: "0.1rem 0.35rem", fontSize: "0.7rem" }} onClick={() => setShowSettings(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Active Provider</label>
                <select 
                  className="form-select"
                  value={config.active_provider}
                  onChange={(e) => setConfig({ ...config, active_provider: e.target.value })}
                >
                  <option value="mock">Mock Simulator (No external calls)</option>
                  <option value="agy">
                    Antigravity CLI (agy) {detectedTools.agy ? "🟢 Detected" : "🔴 Not Installed"}
                  </option>
                  <option value="claude">
                    Claude Code CLI {detectedTools.claude ? "🟢 Detected" : "🔴 Not Installed"}
                  </option>
                  <option value="gemini_api">Gemini API (Google AI Studio)</option>
                </select>
              </div>

              {config.active_provider === "agy" && (
                <div className="form-group">
                  <label className="form-label">AGY Executable Path</label>
                  <input 
                    type="text"
                    className="text-input"
                    value={config.agy_path}
                    onChange={(e) => setConfig({ ...config, agy_path: e.target.value })}
                  />
                  {!detectedTools.agy && (
                    <span style={{ color: "var(--accent-red)", fontSize: "0.75rem" }}>
                      Warning: 'agy' command was not detected in PATH.
                    </span>
                  )}
                </div>
              )}

              {config.active_provider === "claude" && (
                <div className="form-group">
                  <label className="form-label">Claude Command / Executable</label>
                  <input 
                    type="text"
                    className="text-input"
                    value={config.claude_command}
                    onChange={(e) => setConfig({ ...config, claude_command: e.target.value })}
                  />
                  {!detectedTools.claude && (
                    <span style={{ color: "var(--accent-red)", fontSize: "0.75rem" }}>
                      Warning: 'claude' command was not detected in PATH.
                    </span>
                  )}
                </div>
              )}

              {config.active_provider === "gemini_api" && (
                <div className="form-group">
                  <label className="form-label">Gemini API Key</label>
                  <input 
                    type="password"
                    className="text-input"
                    placeholder="AIzaSy..."
                    value={config.gemini_api_key}
                    onChange={(e) => setConfig({ ...config, gemini_api_key: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowSettings(false)}>
                Cancel
              </button>
              <button className="action-btn" onClick={handleSaveConfig}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
