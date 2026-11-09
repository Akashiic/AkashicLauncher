//! Progresso compartilhado entre as tarefas de download e a interface.
//! As tarefas só somam contadores atômicos; um "relógio" emite um retrato a cada
//! 120 ms (`launch:progress`), então milhares de arquivos não inundam a interface.

use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// verifying | downloading | launching
    pub phase: String,
    /// Etapa legível ("Java", "Minecraft 1.7.10", "Modpack TEOF-5.3"...)
    pub stage: String,
    pub files_done: u64,
    pub files_total: u64,
    pub bytes_done: u64,
    pub bytes_total: u64,
    /// 0..1
    pub progress: f64,
    /// bytes/s (média móvel)
    pub speed: f64,
    pub current: String,
}

#[derive(Default)]
struct Meta {
    phase: String,
    stage: String,
    current: String,
    manual: Option<f64>,
}

#[derive(Default)]
pub struct Progress {
    meta: Mutex<Meta>,
    files_done: AtomicU64,
    files_total: AtomicU64,
    bytes_done: AtomicU64,
    bytes_total: AtomicU64,
}

impl Progress {
    /// Começa uma etapa nova (zera os contadores).
    pub fn stage(&self, phase: &str, stage: &str) {
        let mut m = self.meta.lock().unwrap();
        m.phase = phase.into();
        m.stage = stage.into();
        m.current.clear();
        m.manual = None;
        drop(m);
        for c in [&self.files_done, &self.files_total, &self.bytes_done, &self.bytes_total] {
            c.store(0, Ordering::Relaxed);
        }
    }

    pub fn set_totals(&self, files: u64, bytes: u64) {
        self.files_total.store(files, Ordering::Relaxed);
        self.bytes_total.store(bytes, Ordering::Relaxed);
    }

    pub fn add_bytes_total(&self, n: u64) {
        self.bytes_total.fetch_add(n, Ordering::Relaxed);
    }

    pub fn add_bytes(&self, n: u64) {
        self.bytes_done.fetch_add(n, Ordering::Relaxed);
    }

    pub fn sub_bytes(&self, n: u64) {
        let _ = self
            .bytes_done
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |v| Some(v.saturating_sub(n)));
    }

    pub fn file_done(&self) {
        self.files_done.fetch_add(1, Ordering::Relaxed);
    }

    pub fn set_current(&self, s: impl Into<String>) {
        self.meta.lock().unwrap().current = s.into();
    }

    /// Progresso definido à mão (ex.: marcos do carregamento do Forge).
    pub fn set_fraction(&self, f: f64) {
        self.meta.lock().unwrap().manual = Some(f.clamp(0.0, 1.0));
    }

    pub fn snapshot(&self) -> Snapshot {
        let m = self.meta.lock().unwrap();
        let files_done = self.files_done.load(Ordering::Relaxed);
        let files_total = self.files_total.load(Ordering::Relaxed);
        let bytes_done = self.bytes_done.load(Ordering::Relaxed);
        let bytes_total = self.bytes_total.load(Ordering::Relaxed);
        let progress = m.manual.unwrap_or_else(|| {
            if bytes_total > 0 {
                bytes_done as f64 / bytes_total as f64
            } else if files_total > 0 {
                files_done as f64 / files_total as f64
            } else {
                0.0
            }
        });
        Snapshot {
            phase: m.phase.clone(),
            stage: m.stage.clone(),
            files_done,
            files_total,
            bytes_done,
            bytes_total,
            progress: progress.clamp(0.0, 1.0),
            speed: 0.0,
            current: m.current.clone(),
        }
    }
}

/// Emite o progresso periodicamente até ser parado (ou descartado).
pub struct Ticker {
    stop: Arc<AtomicBool>,
}

impl Ticker {
    pub fn start(app: AppHandle, progress: Arc<Progress>) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        tauri::async_runtime::spawn(async move {
            let mut last_bytes = 0u64;
            let mut last_t = Instant::now();
            let mut speed = 0.0f64;
            while !flag.load(Ordering::Relaxed) {
                tokio::time::sleep(Duration::from_millis(120)).await;
                let mut snap = progress.snapshot();
                let now = Instant::now();
                let dt = now.duration_since(last_t).as_secs_f64().max(0.001);
                let delta = snap.bytes_done.saturating_sub(last_bytes) as f64;
                // bytes zerados numa etapa nova: não conta como velocidade negativa
                if snap.bytes_done < last_bytes {
                    speed = 0.0;
                }
                speed = speed * 0.8 + (delta / dt) * 0.2;
                last_bytes = snap.bytes_done;
                last_t = now;
                snap.speed = speed;
                let _ = app.emit("launch:progress", snap);
            }
        });
        Self { stop }
    }
}

impl Drop for Ticker {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}
