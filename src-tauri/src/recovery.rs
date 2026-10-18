//! Bounded, atomic recovery copies, separate from the manually selected project file.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
const ENVELOPE_LIMIT: u64 = (crate::project_file::LIMIT * 2 + 65536) as u64;
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    version: u32,
    pub captured_at: u64,
    pub manual_path: Option<String>,
    pub manual_at: Option<u64>,
    pub project: serde_json::Value,
}
impl Snapshot {
    pub fn new(json: &str, manual_path: Option<String>) -> Result<Self, String> {
        if json.len() > crate::project_file::LIMIT {
            return Err("Projekt przekracza 16 MB".into());
        }
        crate::project::parse(json)?;
        let manual_at = manual_path.as_ref().and_then(|p| {
            fs::metadata(p)
                .ok()?
                .modified()
                .ok()?
                .duration_since(UNIX_EPOCH)
                .ok()
                .map(|d| d.as_millis() as u64)
        });
        Ok(Self {
            version: 1,
            captured_at: now(),
            manual_path,
            manual_at,
            project: serde_json::from_str(json).map_err(|e| e.to_string())?,
        })
    }
    pub fn json(&self) -> Result<String, String> {
        if self.version != 1 {
            return Err("Nieobsługiwana wersja kopii odzyskiwania".into());
        }
        if self.manual_path.as_ref().is_some_and(|p| p.len() > 32768) {
            return Err("Nieprawidłowa ścieżka w kopii".into());
        }
        let json = serde_json::to_string(&self.project).map_err(|e| e.to_string())?;
        if json.len() > crate::project_file::LIMIT {
            return Err("Kopia przekracza 16 MB".into());
        }
        crate::project::parse(&json)?;
        Ok(json)
    }
}
pub struct Store {
    root: PathBuf,
    _lock: fs::File,
}
impl Store {
    pub fn open(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&root)
            .map_err(|e| format!("Nie można utworzyć katalogu odzyskiwania: {e}"))?;
        let lock = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(root.join("owner.lock"))
            .map_err(|e| e.to_string())?;
        lock.try_lock()
            .map_err(|_| "Kopie odzyskiwania są zajęte przez inną instancję RolVixa".to_string())?;
        Ok(Self { root, _lock: lock })
    }
    fn read(&self, name: &str) -> Result<Snapshot, String> {
        let f = fs::File::open(self.root.join(name)).map_err(|e| e.to_string())?;
        if !f.metadata().map_err(|e| e.to_string())?.is_file() {
            return Err("Kopia nie jest plikiem".into());
        }
        let mut raw = Vec::new();
        f.take(ENVELOPE_LIMIT + 1)
            .read_to_end(&mut raw)
            .map_err(|e| e.to_string())?;
        if raw.len() as u64 > ENVELOPE_LIMIT {
            return Err("Zbyt duża kopia odzyskiwania".into());
        }
        let s: Snapshot =
            serde_json::from_slice(&raw).map_err(|e| format!("Uszkodzona kopia: {e}"))?;
        s.json()?;
        Ok(s)
    }
    pub fn load(&self) -> (Option<Snapshot>, String) {
        let mut errors = vec![];
        for name in ["current.json", "previous.json"] {
            if !self.root.join(name).exists() {
                continue;
            }
            match self.read(name) {
                Ok(s) => return (Some(s), errors.join("; ")),
                Err(e) => errors.push(e),
            }
        }
        (None, errors.join("; "))
    }
    fn atomic(&self, name: &str, bytes: &[u8]) -> Result<(), String> {
        let mut temp = tempfile::NamedTempFile::new_in(&self.root).map_err(|e| e.to_string())?;
        temp.write_all(bytes)
            .map_err(|e| format!("Nie można zapisać kopii odzyskiwania: {e}"))?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        temp.persist(self.root.join(name))
            .map_err(|e| format!("Nie można zatwierdzić kopii: {e}"))?;
        Ok(())
    }
    pub fn write(&self, s: &Snapshot) -> Result<(), String> {
        s.json()?;
        // A corrupt current copy must never replace a valid backup.
        if let Ok(old) = self.read("current.json") {
            self.atomic(
                "previous.json",
                &serde_json::to_vec(&old).map_err(|e| e.to_string())?,
            )?;
        }
        self.atomic(
            "current.json",
            &serde_json::to_vec(s).map_err(|e| e.to_string())?,
        )
    }
    pub fn clear(&self) -> Result<(), String> {
        // Remove the fallback first: an interrupted clear cannot resurrect an older revision.
        for name in ["previous.json", "current.json"] {
            match fs::remove_file(self.root.join(name)) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.to_string()),
            }
        }
        Ok(())
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn snapshot(name: &str) -> Snapshot {
        Snapshot::new(&format!(r##"{{"schemaVersion":9,"name":"{name}","media":null,"segments":[],"styles":{{"default":{{"fontFamily":"Arial","fontSize":40,"color":"#ffffff","background":"#000000","position":"bottom"}}}},"clips":[],"createdAt":"2026-10-17T00:00:00Z","updatedAt":"2026-10-17T00:00:00Z"}}"##),None).unwrap()
    }
    #[test]
    fn survives_restart_unicode_and_keeps_two_copies() {
        let d = tempfile::tempdir().unwrap();
        {
            let s = Store::open(d.path().into()).unwrap();
            assert!(Store::open(d.path().into()).is_err());
            for n in ["A", "B", "Łódź 日本"] {
                s.write(&snapshot(n)).unwrap();
            }
            assert_eq!(fs::read_dir(d.path()).unwrap().count(), 3);
        }
        let s = Store::open(d.path().into()).unwrap();
        assert_eq!(s.load().0.unwrap().project["name"], "Łódź 日本");
        s.clear().unwrap();
        assert!(s.load().0.is_none());
    }
    #[test]
    fn corrupt_latest_falls_back_without_destroying_backup() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path().into()).unwrap();
        s.write(&snapshot("A")).unwrap();
        s.write(&snapshot("B")).unwrap();
        fs::write(d.path().join("current.json"), "broken").unwrap();
        let (old, warning) = s.load();
        assert_eq!(old.unwrap().project["name"], "A");
        assert!(!warning.is_empty());
        s.write(&snapshot("C")).unwrap();
        assert_eq!(s.read("previous.json").unwrap().project["name"], "A");
    }
    #[test]
    fn future_schema_and_failed_write_keep_old() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path().into()).unwrap();
        s.write(&snapshot("A")).unwrap();
        let mut invalid = snapshot("B");
        invalid.project["schemaVersion"] = 99.into();
        assert!(s.write(&invalid).is_err());
        assert_eq!(s.load().0.unwrap().project["name"], "A");
        fs::create_dir(d.path().join("previous.json")).unwrap();
        assert!(s.write(&snapshot("C")).is_err());
        assert_eq!(s.load().0.unwrap().project["name"], "A");
    }
    #[test]
    fn never_writes_manual_file_and_reports_both_corrupt() {
        let d = tempfile::tempdir().unwrap();
        let manual = d.path().join("Projekt Łódź.json");
        fs::write(&manual, "manual").unwrap();
        let s = Store::open(d.path().join("recovery")).unwrap();
        let snap = Snapshot::new(
            &snapshot("Nowy").json().unwrap(),
            Some(manual.to_str().unwrap().into()),
        )
        .unwrap();
        assert!(snap.manual_at.is_some());
        s.write(&snap).unwrap();
        assert_eq!(fs::read_to_string(manual).unwrap(), "manual");
        fs::write(s.root.join("current.json"), "bad").unwrap();
        assert!(s.load().0.is_none());
        assert!(!s.load().1.is_empty());
    }
}
