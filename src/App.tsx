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

interface ProjectInfo {
  name: string;
  path: string;
  is_git: boolean;
}

interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  content: string;
  isLogStream?: boolean;
  logs?: AgentLog[];
}

function App() {
  // Navigation View States
  const [activeView, setActiveView] = useState<"central_command" | "project" | "chat">("project");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [projectExpanded, setProjectExpanded] = useState(true);

  // Resizing sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);

  // Core Data States
  const [tasks, setTasks] = useState<Task[]>([]);
  const [chatHistories, setChatHistories] = useState<{ [taskId: string]: ChatMessage[] }>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [promptText, setPromptText] = useState("");
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

  // Local folder projects list state
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectInfo | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load tasks and settings on startup
  useEffect(() => {
    loadConfig();
    checkTools();
    loadProjectInfo();
    loadProjectsList();
  }, []);

  // Auto-scroll chat window
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistories, isExecuting]);

  // Sidebar resizing handlers
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(180, Math.min(500, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Periodic comment listener simulation
  useEffect(() => {
    if (!isListening || !selectedTaskId) return;

    const interval = setInterval(() => {
      const randomComments = [
        "GitHub Webhook: New comment from xethorn on the project: 'Let's refine the UI layout.'",
        "GitHub Webhook: Task list updated. 0 conflicts.",
        "GitHub Webhook: Pushed verification complete on main branch."
      ];
      
      const randomMsg = randomComments[Math.floor(Math.random() * randomComments.length)];
      appendAgentMessage(selectedTaskId, randomMsg);
    }, 30000);

    return () => clearInterval(interval);
  }, [isListening, selectedTaskId]);

  const loadTasks = async () => {
    try {
      const fetchedTasks = await invoke<Task[]>("fetch_tasks");
      setTasks(fetchedTasks);
    } catch (error) {
      console.error("Failed to load tasks", error);
    }
  };

  const loadConfig = async () => {
    try {
      const loadedConfig = await invoke<AppConfig>("get_config");
      setConfig(loadedConfig);
    } catch (error) {
      console.error("Failed to load config", error);
    }
  };

  const checkTools = async () => {
    try {
      const tools = await invoke<DetectedTools>("detect_tools");
      setDetectedTools(tools);
    } catch (error) {
      console.error("Failed to detect tools", error);
    }
  };

  const loadProjectInfo = async () => {
    try {
      const info = await invoke<ProjectInfo | null>("get_project_info");
      setActiveProject(info);
      if (info) {
        loadTasks();
      }
    } catch (error) {
      console.error("Failed to load project details", error);
    }
  };

  const loadProjectsList = async () => {
    try {
      const list = await invoke<ProjectInfo[]>("fetch_projects");
      setProjects(list);
    } catch (error) {
      console.error("Failed to load projects list", error);
    }
  };

  const handleSelectProject = async (path: string) => {
    try {
      const info = await invoke<ProjectInfo>("select_project", { path });
      setActiveProject(info);
      setSelectedTaskId(null);
      setActiveView("project");
      setTimeout(() => {
        loadTasks();
      }, 100);
    } catch (error) {
      console.error("Failed to select project", error);
    }
  };

  const handleSelectProjectFolder = async () => {
    try {
      const info = await invoke<ProjectInfo | null>("select_project_folder");
      if (info) {
        setActiveProject(info);
        setSelectedTaskId(null);
        setActiveView("project");
        loadProjectsList();
        setTimeout(() => {
          loadTasks();
        }, 100);
      }
    } catch (error) {
      console.error("Failed to select folder project", error);
    }
  };

  const handleSaveConfig = async () => {
    try {
      await invoke("save_config", { config });
      setShowSettings(false);
      // Append a system notification inside the active chat if applicable
      if (selectedTaskId) {
        appendAgentMessage(selectedTaskId, `Settings saved. Active AI provider set to: ${config.active_provider}`);
      }
    } catch (error) {
      console.error("Failed to save config", error);
    }
  };

  const appendAgentMessage = (taskId: string, content: string) => {
    const newMessage: ChatMessage = {
      id: Math.random().toString(),
      sender: "agent",
      content
    };
    setChatHistories((prev) => ({
      ...prev,
      [taskId]: [...(prev[taskId] || []), newMessage]
    }));
  };

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim() || !selectedTaskId || isExecuting) return;

    const currentTaskId = selectedTaskId;
    const userPrompt = promptText;
    setPromptText("");

    // 1. Append user message
    const userMessage: ChatMessage = {
      id: Math.random().toString(),
      sender: "user",
      content: userPrompt
    };

    setChatHistories((prev) => ({
      ...prev,
      [currentTaskId]: [...(prev[currentTaskId] || []), userMessage]
    }));

    // 2. Set executing state and trigger Tauri agent execution
    setIsExecuting(true);
    
    // Append a placeholder log stream message that we will populate live
    const streamMessageId = Math.random().toString();
    const logStreamMessage: ChatMessage = {
      id: streamMessageId,
      sender: "agent",
      content: "Initializing agent...",
      isLogStream: true,
      logs: []
    };

    setChatHistories((prev) => ({
      ...prev,
      [currentTaskId]: [...(prev[currentTaskId] || []), logStreamMessage]
    }));

    try {
      const executionLogs = await invoke<AgentLog[]>("execute_task", { 
        taskId: currentTaskId,
        task_id: currentTaskId 
      });

      // Stream logs sequentially into the logStreamMessage bubble
      executionLogs.forEach((log, index) => {
        setTimeout(() => {
          setChatHistories((prev) => {
            const history = prev[currentTaskId] || [];
            const updatedHistory = history.map((msg) => {
              if (msg.id === streamMessageId) {
                const logsList = [...(msg.logs || []), log];
                return {
                  ...msg,
                  content: `Agent logs (${logsList.length} entries)`,
                  logs: logsList
                };
              }
              return msg;
            });
            return { ...prev, [currentTaskId]: updatedHistory };
          });

          if (index === executionLogs.length - 1) {
            setIsExecuting(false);
            loadTasks(); // refresh task status
          }
        }, index * 800);
      });

    } catch (error) {
      console.error("Agent execution failed:", error);
      const errorLog: AgentLog = {
        timestamp: new Date().toLocaleTimeString(),
        message: `Execution failed: ${error}`,
        level: "error"
      };
      
      setChatHistories((prev) => {
        const history = prev[currentTaskId] || [];
        const updatedHistory = history.map((msg) => {
          if (msg.id === streamMessageId) {
            return {
              ...msg,
              content: `Execution failed: ${error}`,
              logs: [errorLog]
            };
          }
          return msg;
        });
        
        const hasPlaceholder = updatedHistory.some(msg => msg.id === streamMessageId);
        if (!hasPlaceholder) {
          const errorMessage: ChatMessage = {
            id: Math.random().toString(),
            sender: "agent",
            content: `Execution failed: ${error}`,
            isLogStream: true,
            logs: [errorLog]
          };
          return {
            ...prev,
            [currentTaskId]: [...history, errorMessage]
          };
        }
        return { ...prev, [currentTaskId]: updatedHistory };
      });
      setIsExecuting(false);
    }
  };

  const getSelectedTask = (): Task | undefined => {
    return tasks.find((t) => t.id === selectedTaskId);
  };

  const getActiveChatMessages = (): ChatMessage[] => {
    if (!selectedTaskId) return [];
    return chatHistories[selectedTaskId] || [];
  };

  return (
    <div className="app-container">
      {/* Left Sidebar Pane */}
      <aside className="sidebar drag-zone" style={{ width: `${sidebarWidth}px` }}>
        <nav className="sidebar-menu no-drag">
          <div className="menu-section">
            {/* Central Command Link */}
            <div 
              className={`menu-item ${activeView === "central_command" ? "active" : ""}`}
              onClick={() => {
                setActiveView("central_command");
                setSelectedTaskId(null);
              }}
            >
              <svg className="menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "14px", height: "14px" }}>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              <span>Central Command</span>
            </div>
          </div>

          <div className="menu-section">
            <div className="menu-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Projects</span>
              <button 
                className="no-drag" 
                onClick={handleSelectProjectFolder}
                style={{ 
                  background: "none", 
                  border: "none", 
                  color: "var(--text-secondary)", 
                  cursor: "pointer", 
                  padding: "2px",
                  display: "flex",
                  alignItems: "center" 
                }}
                title="Open Folder Project"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "12px", height: "12px" }}>
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  <line x1="12" y1="11" x2="12" y2="17"></line>
                  <line x1="9" y1="14" x2="15" y2="14"></line>
                </svg>
              </button>
            </div>
            
            {projects.length === 0 ? (
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", padding: "0.5rem 0.75rem", fontStyle: "italic" }}>
                No projects opened
              </div>
            ) : (
              projects.map((project) => {
                const isActive = activeProject?.path === project.path;
                return (
                  <div key={project.path}>
                    {/* Project Folder Item */}
                    <div 
                      className={`menu-item ${isActive && activeView === "project" ? "active" : ""}`}
                      onClick={() => {
                        if (isActive) {
                          setProjectExpanded(!projectExpanded);
                        } else {
                          handleSelectProject(project.path);
                          setProjectExpanded(true);
                        }
                      }}
                      title={project.path}
                    >
                      <svg className="menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "14px", height: "14px" }}>
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        {(isActive && projectExpanded) && <line x1="2" y1="10" x2="22" y2="10"></line>}
                      </svg>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</span>
                    </div>

                    {/* Render Nested Task list for this project if active & expanded */}
                    {isActive && projectExpanded && (
                      <div className="submenu-list">
                        {tasks.length === 0 ? (
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", padding: "0.25rem 0.5rem", fontStyle: "italic" }}>
                            No active tasks
                          </div>
                        ) : (
                          tasks.map((task) => (
                            <div 
                              key={task.id}
                              className={`submenu-item ${selectedTaskId === task.id ? "active" : ""}`}
                              onClick={() => {
                                setSelectedTaskId(task.id);
                                setActiveView("chat");
                              }}
                              title={`#${task.id}: ${task.title}`}
                            >
                              <svg className="menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "11px", height: "11px", marginTop: "3px", flexShrink: 0 }}>
                                {task.status === "done" ? (
                                  <>
                                    <polyline points="9 11 12 14 22 4"></polyline>
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                                  </>
                                ) : (
                                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                )}
                              </svg>
                              <span>#{task.id} {task.title}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </nav>
      </aside>

      {/* Sidebar Resizer Handle */}
      <div className="sidebar-resizer no-drag" onMouseDown={startResizing} />

      {/* Main Panel Pane (Middle) */}
      <main className="main-panel">
        
        {/* Render Views dynamically */}
        {activeView === "central_command" && (
          <div className="coming-soon-container drag-zone">
            <div className="coming-soon-title">Central Command</div>
            <div className="coming-soon-desc">Coming Soon! This workspace view is prepared for cross-repository orchestration and advanced telemetry dashboards.</div>
            <button className="btn-secondary no-drag" onClick={() => setActiveView("project")}>
              Back to Project
            </button>
          </div>
        )}

        {activeView === "project" && (
          <div className="coming-soon-container drag-zone">
            <img 
              src="/logo.jpg" 
              alt="WYAIWYG Logo" 
              className="no-drag"
              style={{ 
                width: "96px", 
                height: "96px", 
                borderRadius: "22px", 
                marginBottom: "1.5rem",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
                border: "1px solid rgba(255, 255, 255, 0.05)"
              }} 
            />
            {activeProject ? (
              <>
                <div className="coming-soon-title">{activeProject.name}</div>
                <div className="coming-soon-desc" style={{ maxWidth: "450px" }}>
                  Location: <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{activeProject.path}</span>
                  <br/><br/>
                  Welcome to the local folder project workspace. Select one of the active tasks in the sidebar to open the conversational agent chat interface and start developing!
                </div>
              </>
            ) : (
              <>
                <div className="coming-soon-title">No Projects Opened</div>
                <div className="coming-soon-desc" style={{ maxWidth: "450px" }}>
                  Click the <strong>+</strong> folder button in the sidebar or click below to open your first local folder project directory!
                </div>
              </>
            )}
            <div className="panel-header-actions no-drag" style={{ marginTop: "1rem" }}>
              <button className="btn-secondary" onClick={handleSelectProjectFolder}>📁 Open Folder Project</button>
              {activeProject && <button className="btn-secondary" onClick={loadTasks}>Sync Tasks</button>}
              <button className="btn-secondary" onClick={() => setShowSettings(true)}>⚙ Settings</button>
            </div>
          </div>
        )}

        {activeView === "chat" && selectedTaskId && (
          <div className="chat-container">
            {/* Main Panel Header toolbar */}
            <header className="panel-header drag-zone">
              <div className="panel-header-info">
                <div className="panel-header-title">
                  Task #{selectedTaskId}: {getSelectedTask()?.title}
                </div>
                <div className="panel-header-meta">
                  Status: <strong style={{ color: "var(--accent-purple)" }}>{getSelectedTask()?.status.toUpperCase()}</strong> | AI Provider: <strong style={{ color: "var(--accent-blue)" }}>{config.active_provider.toUpperCase()}</strong>
                </div>
              </div>
              <div className="panel-header-actions no-drag">
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Stream Updates:
                </span>
                <span className={`status-dot ${isListening ? "active" : ""}`} style={{ width: "6px", height: "6px", marginRight: "0.5rem" }} />
                <button 
                  className="btn-secondary" 
                  style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem" }} 
                  onClick={() => setIsListening(!isListening)}
                >
                  {isListening ? "Pause" : "Listen"}
                </button>
                <button className="btn-secondary" style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem" }} onClick={() => setShowSettings(true)}>⚙ settings</button>
                <button className="btn-secondary" style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem" }} onClick={loadTasks}>Sync</button>
              </div>
            </header>

            {/* Chat Messages history log */}
            <div className="chat-history">
              {getActiveChatMessages().length === 0 ? (
                <div className="chat-placeholder">
                  <div className="chat-placeholder-title">Agent Chat Session Started</div>
                  <div className="chat-placeholder-desc">
                    Task description: "{getSelectedTask()?.description}"
                    <br/><br/>
                    Enter instructions at the bottom to trigger the AI agent development cycle. It will write edits, verify builds, and push updates back to GitHub.
                  </div>
                </div>
              ) : (
                getActiveChatMessages().map((message) => (
                  <div key={message.id} className={`chat-bubble ${message.sender}`}>
                    <span className="chat-bubble-sender">
                      {message.sender === "user" ? "You" : `${config.active_provider.toUpperCase()} Agent`}
                    </span>
                    
                    {message.isLogStream ? (
                      // Render logs inside a console stdout container
                      <div className="chat-bubble-content log-stream">
                        {message.logs && message.logs.length > 0 ? (
                          message.logs.map((log, idx) => (
                            <div key={idx} className={`log-line log-${log.level}`}>
                              <span style={{ opacity: 0.5 }}>[{log.timestamp}]</span>
                              <span>{log.message}</span>
                            </div>
                          ))
                        ) : (
                          <div>Executing agent step...</div>
                        )}
                      </div>
                    ) : (
                      // Render standard text bubble
                      <div className="chat-bubble-content">
                        {message.content}
                      </div>
                    )}
                  </div>
                ))
              )}
              {isExecuting && (
                <div className="chat-bubble agent">
                  <span className="chat-bubble-sender">Agent status</span>
                  <div className="chat-bubble-content" style={{ fontStyle: "italic", opacity: 0.7 }}>
                    Agent is processing changes...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Prompt input field bar */}
            <form className="chat-input-bar" onSubmit={handleSendPrompt}>
              <div className="chat-input-container">
                <span className="terminal-prompt-symbol">&gt;</span>
                <input 
                  type="text"
                  className="chat-input-field"
                  placeholder="Ask Agent to edit workspace (e.g. 'implement this task')..."
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  disabled={isExecuting}
                />
                <button 
                  type="submit" 
                  className="chat-send-btn"
                  disabled={isExecuting || !promptText.trim()}
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        )}

      </main>

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
