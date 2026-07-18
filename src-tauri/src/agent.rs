use std::process::Command;
use std::time::SystemTime;
use crate::github::AgentLog;
use crate::config;

pub fn execute(project_path: &str, task_id: &str) -> Result<Vec<AgentLog>, String> {
    let cfg = config::load();
    let now_str = || {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        format!("{}", now)
    };

    let mut logs = Vec::new();
    logs.push(AgentLog {
        timestamp: now_str(),
        message: format!("Selected AI Provider: {}", cfg.active_provider),
        level: "info".to_string(),
    });

    // Fetch the task description
    let tasks = crate::github::get_issues(project_path).unwrap_or_default();
    let task = tasks.iter().find(|t| t.id == task_id);
    let prompt = match task {
        Some(t) => format!(
            "Implement task #{} in the workspace. Title: {}. Description: {}.",
            t.id, t.title, t.description
        ),
        None => format!("Implement task #{} in the workspace.", task_id),
    };

    match cfg.active_provider.as_str() {
        "agy" => {
            logs.push(AgentLog {
                timestamp: now_str(),
                message: format!("Spawning AGY CLI at: {}", cfg.agy_path),
                level: "info".to_string(),
            });

            // Spawn the agy process in headless accept-edits mode
            let output = Command::new(&cfg.agy_path)
                .args(&["--mode", "accept-edits", "--print", "--dangerously-skip-permissions", "--prompt", &prompt])
                .current_dir(project_path) // run in project folder
                .output();

            match output {
                Ok(out) => {
                    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&out.stderr).to_string();

                    for line in stdout.lines() {
                        if !line.trim().is_empty() {
                            logs.push(AgentLog {
                                timestamp: now_str(),
                                message: line.to_string(),
                                level: "info".to_string(),
                            });
                        }
                    }

                    for line in stderr.lines() {
                        if !line.trim().is_empty() {
                            logs.push(AgentLog {
                                timestamp: now_str(),
                                message: line.to_string(),
                                level: "warning".to_string(),
                            });
                        }
                    }

                    if out.status.success() {
                        logs.push(AgentLog {
                            timestamp: now_str(),
                            message: "AGY agent finished successfully!".to_string(),
                            level: "success".to_string(),
                        });
                    } else {
                        logs.push(AgentLog {
                            timestamp: now_str(),
                            message: format!("AGY agent exited with error status: {}", out.status),
                            level: "error".to_string(),
                        });
                    }
                }
                Err(e) => {
                    logs.push(AgentLog {
                        timestamp: now_str(),
                        message: format!("Failed to start AGY CLI: {}", e),
                        level: "error".to_string(),
                    });
                }
            }
        }
        "claude" => {
            logs.push(AgentLog {
                timestamp: now_str(),
                message: format!("Spawning Claude Code command: {}", cfg.claude_command),
                level: "info".to_string(),
            });

            let output = Command::new("sh")
                .args(&["-c", &format!("{} -p \"{}\"", cfg.claude_command, prompt)])
                .current_dir(project_path)
                .output();

            match output {
                Ok(out) => {
                    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&out.stderr).to_string();

                    for line in stdout.lines() {
                        if !line.trim().is_empty() {
                            logs.push(AgentLog {
                                timestamp: now_str(),
                                message: line.to_string(),
                                level: "info".to_string(),
                            });
                        }
                    }

                    for line in stderr.lines() {
                        if !line.trim().is_empty() {
                            logs.push(AgentLog {
                                timestamp: now_str(),
                                message: line.to_string(),
                                level: "warning".to_string(),
                            });
                        }
                    }

                    if out.status.success() {
                        logs.push(AgentLog {
                            timestamp: now_str(),
                            message: "Claude agent finished successfully!".to_string(),
                            level: "success".to_string(),
                        });
                    } else {
                        logs.push(AgentLog {
                            timestamp: now_str(),
                            message: format!("Claude agent exited with error status: {}", out.status),
                            level: "error".to_string(),
                        });
                    }
                }
                Err(e) => {
                    logs.push(AgentLog {
                        timestamp: now_str(),
                        message: format!("Failed to start Claude CLI: {}", e),
                        level: "error".to_string(),
                    });
                }
            }
        }
        "gemini_api" => {
            if cfg.gemini_api_key.trim().is_empty() {
                logs.push(AgentLog {
                    timestamp: now_str(),
                    message: "Error: Gemini API Key is missing. Please configure it in Settings.".to_string(),
                    level: "error".to_string(),
                });
                return Ok(logs);
            }

            logs.push(AgentLog {
                timestamp: now_str(),
                message: "Calling Google AI Studio Gemini API...".to_string(),
                level: "info".to_string(),
            });

            // Run a curl command to generate code suggestions from Gemini 1.5 Pro
            let api_url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key={}",
                cfg.gemini_api_key
            );

            let payload = serde_json::json!({
                "contents": [{
                    "parts": [{
                        "text": format!("You are an AI developer. Write a implementation plan or code for the following task: {}", prompt)
                    }]
                }]
            });

            let payload_str = payload.to_string();

            let output = Command::new("curl")
                .args(&[
                    "-X", "POST",
                    "-H", "Content-Type: application/json",
                    "-d", &payload_str,
                    &api_url
                ])
                .output();

            match output {
                Ok(out) if out.status.success() => {
                    let response_body = String::from_utf8_lossy(&out.stdout).to_string();
                    // Parse response json
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&response_body) {
                        if let Some(text) = json["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                            for line in text.lines() {
                                if !line.trim().is_empty() {
                                    logs.push(AgentLog {
                                        timestamp: now_str(),
                                        message: line.to_string(),
                                        level: "info".to_string(),
                                    });
                                }
                            }
                            logs.push(AgentLog {
                                timestamp: now_str(),
                                message: "Gemini API call completed successfully!".to_string(),
                                level: "success".to_string(),
                            });
                        } else {
                            logs.push(AgentLog {
                                timestamp: now_str(),
                                message: format!("Unexpected API response format: {}", response_body),
                                level: "error".to_string(),
                            });
                        }
                    } else {
                        logs.push(AgentLog {
                            timestamp: now_str(),
                            message: format!("Failed to parse JSON response: {}", response_body),
                            level: "error".to_string(),
                        });
                    }
                }
                Ok(out) => {
                    logs.push(AgentLog {
                        timestamp: now_str(),
                        message: format!("Gemini API call failed with exit status: {}", out.status),
                        level: "error".to_string(),
                    });
                }
                Err(e) => {
                    logs.push(AgentLog {
                        timestamp: now_str(),
                        message: format!("Failed to execute curl: {}", e),
                        level: "error".to_string(),
                    });
                }
            }
        }
        _ => {
            // Fall back to the mock self-development developer loop
            logs.push(AgentLog {
                timestamp: now_str(),
                message: "Running mock agent simulation loop...".to_string(),
                level: "info".to_string(),
            });

            // Delegate to the github mock runner
            match crate::github::execute_agent_task(project_path, task_id) {
                Ok(mut mock_logs) => {
                    logs.append(&mut mock_logs);
                }
                Err(e) => {
                    logs.push(AgentLog {
                        timestamp: now_str(),
                        message: format!("Mock run failed: {}", e),
                        level: "error".to_string(),
                    });
                }
            }
        }
    }

    Ok(logs)
}
