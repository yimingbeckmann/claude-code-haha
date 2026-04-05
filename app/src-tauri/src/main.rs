#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::SocketAddr;
use std::sync::Arc;

use server::{app, AppState};
use tauri::Manager;
use tokio::net::TcpListener;
use tokio::sync::Mutex;

struct ServerPort(u16);

#[tauri::command]
fn get_server_port(state: tauri::State<'_, ServerPort>) -> u16 {
    state.0
}

fn main() {
    let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");

    let port = rt.block_on(async {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("failed to bind server");
        let addr = listener.local_addr().expect("failed to get local address");
        let port = addr.port();

        tokio::spawn(async move {
            axum::serve(listener, app(AppState::new()))
                .await
                .expect("server crashed");
        });

        port
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerPort(port))
        .invoke_handler(tauri::generate_handler![get_server_port])
        .setup(|_app| {
            // Keep the tokio runtime alive for the lifetime of the app
            std::mem::forget(rt);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
