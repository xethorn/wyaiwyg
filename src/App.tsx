import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface Task {
  id: string;
  title: string;
  description: string;
  status: string; // "todo", "in_progress", "done"
  comments: string[];
}

interface AgentLog {
  timestamp: string;
  message: string;
  level: string; // "info", "warning", "success", "error"
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [executingTaskId, setExecutingTaskId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [isListening, setIsListening] = useState(true);

  // Load tasks on startup
  useEffect(() => {
    loadTasks();
    addSystemLog("WYAIWYG Agent environment initialized. Listening to repository xethorn/wyaiwyg.", "success");
  }, []);

  // Periodic comment listener simulation
  useEffect(() => {
    if (!isListening) return;

    const interval = setInterval(() => {
      // Simulate polling/streaming comment updates
      const randomComments = [
        "GitHub Webhook: New comment from xethorn on #1: 'Let's adjust the console margin to be narrower.'",
        "GitHub Webhook: New comment from xethorn on #2: 'Can we build this using ureq instead of reqwest?'",
        "GitHub Webhook: Task #3 marked as priority by xethorn.",
        "GitHub Webhook: Repository state checked. 0 merge conflicts found."
      ];
      
      const randomMsg = randomComments[Math.floor(Math.random() * randomComments.length)];
      addSystemLog(randomMsg, "info");
    }, 15000); // Poll every 15 seconds

    return () => clearInterval(interval);
  }, [isListening]);

  const loadTasks = async () => {
    try {
      const fetchedTasks = await invoke<Task[]>("fetch_tasks");
      setTasks(fetchedTasks);
    } catch (error) {
      addSystemLog(`Failed to fetch tasks: ${error}`, "error");
    }
  };

  const addSystemLog = (message: string, level: string = "info") => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [
      ...prev,
      { timestamp: time, message, level }
    ]);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    addSystemLog(`Creating new issue on GitHub: "${newTaskTitle}"...`, "info");
    try {
      const newTask = await invoke<Task>("create_task", {
        title: newTaskTitle,
        description: newTaskDesc
      });
      addSystemLog(`Successfully created GitHub issue #${newTask.id}!`, "success");
      setNewTaskTitle("");
      setNewTaskDesc("");
      loadTasks();
    } catch (error) {
      addSystemLog(`Failed to create task: ${error}`, "error");
    }
  };

  const handleExecuteTask = async (taskId: string) => {
    if (executingTaskId) return;
    setExecutingTaskId(taskId);
    addSystemLog(`Triggering agent execution for Task #${taskId}...`, "info");

    try {
      const executionLogs = await invoke<AgentLog[]>("execute_task", { taskId });
      
      // Stream logs sequentially into console for realistic effect
      executionLogs.forEach((log, index) => {
        setTimeout(() => {
          const time = new Date(parseInt(log.timestamp) * 1000).toLocaleTimeString();
          setLogs((prev) => [
            ...prev,
            { timestamp: time, message: log.message, level: log.level }
          ]);
          
          if (index === executionLogs.length - 1) {
            setExecutingTaskId(null);
            loadTasks();
          }
        }, index * 800);
      });

    } catch (error) {
      addSystemLog(`Execution failed: ${error}`, "error");
      setExecutingTaskId(null);
    }
  };

  const getTasksByStatus = (status: string) => {
    return tasks.filter((t) => t.status === status);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo">W</div>
          <span className="brand-name">WYAIWYG</span>
        </div>
        <div className="system-status">
          <div className="status-item">
            <span className="text-muted">Repo:</span>
            <strong>xethorn/wyaiwyg</strong>
          </div>
          <div className="status-item">
            <span className="text-muted">Account:</span>
            <strong>xethorn</strong>
          </div>
          <div className="status-item">
            <span className="text-muted">Reactive Listener:</span>
            <span className={`status-dot ${isListening ? "active" : ""}`} />
            <button 
              className="btn-secondary" 
              style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
              onClick={() => setIsListening(!isListening)}
            >
              {isListening ? "Pause" : "Listen"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Left Side: Tasks Board */}
        <section className="panel board-container">
          <div className="panel-header">
            <h2 className="panel-title">GitHub Project Board</h2>
            <button className="btn-secondary" onClick={loadTasks} style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>
              Sync Board
            </button>
          </div>
          
          <div className="board-columns">
            {/* TODO Column */}
            <div className="column">
              <div className="column-header">
                <span>Todo</span>
                <span className="column-count">{getTasksByStatus("todo").length}</span>
              </div>
              {getTasksByStatus("todo").map((task) => (
                <div key={task.id} className={`task-card ${executingTaskId === task.id ? "active-execution" : ""}`}>
                  <div className="task-title">#{task.id}: {task.title}</div>
                  <div className="task-description">{task.description}</div>
                  {task.comments.length > 0 && (
                    <div className="task-meta">
                      <span className="task-comments-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        {task.comments.length} comments
                      </span>
                    </div>
                  )}
                  <button 
                    className="action-btn"
                    disabled={executingTaskId !== null}
                    onClick={() => handleExecuteTask(task.id)}
                  >
                    {executingTaskId === task.id ? "Developing..." : "Develop Task"}
                  </button>
                </div>
              ))}
            </div>

            {/* IN PROGRESS Column */}
            <div className="column">
              <div className="column-header">
                <span>In Progress</span>
                <span className="column-count">{getTasksByStatus("in_progress").length}</span>
              </div>
              {getTasksByStatus("in_progress").map((task) => (
                <div key={task.id} className={`task-card ${executingTaskId === task.id ? "active-execution" : ""}`}>
                  <div className="task-title">#{task.id}: {task.title}</div>
                  <div className="task-description">{task.description}</div>
                  {task.comments.length > 0 && (
                    <div className="task-meta">
                      <span className="task-comments-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        {task.comments.length} comments
                      </span>
                    </div>
                  )}
                  <button 
                    className="action-btn"
                    disabled={executingTaskId !== null}
                    onClick={() => handleExecuteTask(task.id)}
                  >
                    {executingTaskId === task.id ? "Developing..." : "Develop Task"}
                  </button>
                </div>
              ))}
            </div>

            {/* DONE Column */}
            <div className="column">
              <div className="column-header">
                <span>Done</span>
                <span className="column-count">{getTasksByStatus("done").length}</span>
              </div>
              {getTasksByStatus("done").map((task) => (
                <div key={task.id} className="task-card">
                  <div className="task-title" style={{ textDecoration: "line-through", opacity: 0.6 }}>#{task.id}: {task.title}</div>
                  <div className="task-description" style={{ opacity: 0.6 }}>{task.description}</div>
                  <span className="status-item" style={{ fontSize: "0.75rem", color: "var(--accent-green)" }}>
                    ✓ Resolved & Pushed
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right Side: Agent Console & Quick Create */}
        <section className="panel console-panel">
          <div className="panel-header">
            <h2 className="panel-title">Reactive Agent Console</h2>
            <button className="btn-secondary" onClick={() => setLogs([])} style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>
              Clear Logs
            </button>
          </div>
          
          <div className="console-output">
            {logs.length === 0 ? (
              <div className="console-placeholder">Listening for events... Try running a task build.</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="log-entry">
                  <span className="log-time">[{log.timestamp}]</span>
                  <span className={`log-msg log-${log.level}`}>{log.message}</span>
                </div>
              ))
            )}
          </div>

          {/* Quick Create Task */}
          <form className="input-row" onSubmit={handleCreateTask}>
            <input 
              type="text" 
              className="text-input" 
              placeholder="Quick Create GitHub Issue / Task..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
            />
            <button type="submit" className="action-btn" style={{ padding: "0.5rem 1rem" }}>
              Add
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default App;
