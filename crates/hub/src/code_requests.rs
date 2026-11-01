use std::path::Path;

use tokio_util::sync::CancellationToken;
use xiaoban_protocol::{ErrorCode, Event, ProtocolError, Request, Response, Workspace};

use crate::state::SharedState;
use crate::workspace;

type Handled = Result<Response, ProtocolError>;

const FILE_CHARS: usize = 400_000;

fn bad_request(detail: &str) -> ProtocolError {
    ProtocolError::new(ErrorCode::BadRequest, detail)
}

fn only_here(local: bool) -> Result<(), ProtocolError> {
    if local {
        Ok(())
    } else {
        Err(bad_request("only available on this computer"))
    }
}

async fn load(state: &SharedState, id: String) -> Result<Workspace, ProtocolError> {
    Ok(state.store.workspace(id).await?)
}

#[allow(clippy::too_many_lines)]
pub async fn handle(state: &SharedState, local: bool, request: Request) -> Handled {
    match request {
        Request::ListWorkspaces => Ok(Response::Workspaces {
            workspaces: state.store.list_workspaces().await?,
        }),
        Request::CreateWorkspace { path } => {
            only_here(local)?;
            let folder = workspace::real(&workspace::expand(&path));
            if !folder.is_dir() {
                return Err(bad_request("not a folder"));
            }
            let created = state
                .store
                .add_workspace(
                    workspace::folder_name(&folder),
                    folder.to_string_lossy().into_owned(),
                )
                .await?;
            state.publish(Event::WorkspaceUpdated {
                workspace: created.clone(),
            });
            Ok(Response::Workspace { workspace: created })
        }
        Request::RenameWorkspace { workspace_id, name } => {
            let name = name.trim().to_owned();
            if name.is_empty() {
                return Err(bad_request("name must not be empty"));
            }
            let renamed = state.store.rename_workspace(workspace_id, name).await?;
            state.publish(Event::WorkspaceUpdated {
                workspace: renamed.clone(),
            });
            Ok(Response::Workspace { workspace: renamed })
        }
        Request::RemoveWorkspace { workspace_id } => {
            state.store.remove_workspace(workspace_id.clone()).await?;
            state.publish(Event::WorkspaceRemoved { workspace_id });
            Ok(Response::Ack)
        }
        Request::ListDir { workspace_id, path } => {
            let found = load(state, workspace_id).await?;
            let entries = tokio::task::spawn_blocking(move || workspace::list_dir(&found, &path))
                .await
                .map_err(|_| bad_request("could not list"))?
                .map_err(|failure| bad_request(&failure))?;
            Ok(Response::Dir { entries })
        }
        Request::ReadWorkspaceFile { workspace_id, path } => {
            let found = load(state, workspace_id).await?;
            let target = workspace::resolve(&found, &path);
            if !target.inside {
                return Err(bad_request("outside the workspace"));
            }
            read(&target.path)
        }
        Request::ThreadChanges { thread_id } => Ok(Response::Changes {
            files: crate::changes::thread_changes(state, &thread_id).await,
        }),
        Request::RevertChange {
            thread_id,
            path,
            hunk,
        } => {
            crate::changes::revert(state, &thread_id, &path, hunk)
                .await
                .map_err(|failure| bad_request(&failure))?;
            Ok(Response::Changes {
                files: crate::changes::thread_changes(state, &thread_id).await,
            })
        }
        Request::GitInfo { workspace_id } => {
            let found = load(state, workspace_id).await?;
            Ok(Response::Git {
                git: workspace::info(&found).await,
            })
        }
        Request::ListCommands { workspace_id } => Ok(Response::Commands {
            commands: state.store.list_commands(workspace_id).await?,
        }),
        Request::RunCommand {
            workspace_id,
            command,
        } => {
            only_here(local)?;
            let found = load(state, workspace_id).await?;
            let command = command.trim().to_owned();
            if command.is_empty() {
                return Err(bad_request("command must not be empty"));
            }
            let state = std::sync::Arc::clone(state);
            tokio::spawn(async move {
                if let Err(failure) = crate::commands::run(
                    &state,
                    &found,
                    None,
                    &command,
                    true,
                    &CancellationToken::new(),
                )
                .await
                {
                    tracing::warn!(%failure, "could not run a command");
                }
            });
            Ok(Response::Ack)
        }
        Request::ListBranches { workspace_id } => {
            let found = load(state, workspace_id).await?;
            Ok(Response::Branches {
                branches: workspace::branches(&found).await,
            })
        }
        Request::SwitchBranch {
            workspace_id,
            name,
            create,
            stash,
        } => {
            let found = load(state, workspace_id).await?;
            workspace::switch(&found, &name, create, stash)
                .await
                .map_err(|failure| bad_request(&failure))?;
            state.publish(Event::FilesChanged {
                workspace_id: found.id.clone(),
                thread_id: None,
                paths: Vec::new(),
            });
            Ok(Response::Git {
                git: workspace::info(&found).await,
            })
        }
        Request::PullBranch { workspace_id } => {
            let found = load(state, workspace_id).await?;
            workspace::pull(&found)
                .await
                .map_err(|failure| bad_request(&failure))?;
            state.publish(Event::FilesChanged {
                workspace_id: found.id.clone(),
                thread_id: None,
                paths: Vec::new(),
            });
            Ok(Response::Git {
                git: workspace::info(&found).await,
            })
        }
        Request::RestoreStash { workspace_id } => {
            let found = load(state, workspace_id).await?;
            workspace::restore(&found)
                .await
                .map_err(|failure| bad_request(&failure))?;
            state.publish(Event::FilesChanged {
                workspace_id: found.id.clone(),
                thread_id: None,
                paths: Vec::new(),
            });
            Ok(Response::Git {
                git: workspace::info(&found).await,
            })
        }
        Request::WorkspaceImage { workspace_id, path } => {
            let found = load(state, workspace_id).await?;
            let target = workspace::resolve(&found, &path);
            if !target.inside {
                return Err(bad_request("outside the workspace"));
            }
            image(&target.path)
        }
        Request::GithubRefs {
            workspace_id,
            numbers,
        } => {
            let found = load(state, workspace_id).await?;
            Ok(Response::GithubRefs {
                refs: crate::github::lookup(state, &found, numbers).await,
            })
        }
        Request::ThreadPins { thread_id } => {
            let (pinned, hidden) = crate::github::pins(state, &thread_id).await;
            Ok(Response::Pins { pinned, hidden })
        }
        Request::PinRef {
            thread_id,
            number,
            pinned,
        } => {
            let (pinned, hidden) = crate::github::pin(state, &thread_id, number, pinned).await;
            Ok(Response::Pins { pinned, hidden })
        }
        Request::StopCommand { command_id } => {
            crate::commands::stop(state, &command_id);
            Ok(Response::Ack)
        }
        _ => Err(bad_request("not a workspace request")),
    }
}

fn read(path: &Path) -> Handled {
    let bytes = std::fs::read(path).map_err(|failure| bad_request(&failure.to_string()))?;
    if crate::changes::binary(&bytes) {
        return Ok(Response::WorkspaceFile {
            text: String::new(),
            truncated: false,
            binary: true,
        });
    }
    let text = String::from_utf8_lossy(&bytes);
    let truncated = text.len() > FILE_CHARS;
    let text = if truncated {
        text.chars().take(FILE_CHARS).collect()
    } else {
        text.into_owned()
    };
    Ok(Response::WorkspaceFile {
        text,
        truncated,
        binary: false,
    })
}

const IMAGE_BYTES: u64 = 25 * 1024 * 1024;

fn image(path: &Path) -> Handled {
    let ext = path
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        _ => return Err(bad_request("not an image")),
    };
    let size = std::fs::metadata(path)
        .map_err(|failure| bad_request(&failure.to_string()))?
        .len();
    if size > IMAGE_BYTES {
        return Err(bad_request("image too large"));
    }
    let bytes = std::fs::read(path).map_err(|failure| bad_request(&failure.to_string()))?;
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    Ok(Response::WorkspaceImage {
        url: format!("data:{mime};base64,{encoded}"),
        bytes: size,
    })
}
