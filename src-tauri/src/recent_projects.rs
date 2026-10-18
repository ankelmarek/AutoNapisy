//! An app-owned MRU registry. IPC chooses an opaque ID, never a filesystem path.
use crate::project_file::Target;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    hash::{Hash, Hasher},
    io::{Read, Write},
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
const LIMIT: u64 = 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Entry {
    pub id: String,
    pub path: PathBuf,
    pub name: String,
    pub last_used: u64,
}
#[cfg(test)]
mod tests {
    use super::*;
    fn target(dir: &std::path::Path, name: &str) -> Target {
        let path = dir.join(format!("{name}.json"));
        fs::write(&path, "{\"name\":\"test\"}").unwrap();
        Target::selected(&path).unwrap()
    }
    #[test]
    fn six_projects_reorder_deduplicate_and_survive_restart_unicode() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("Historia Łódź 日本");
        let s = Store::new(root.clone());
        let mut first = None;
        for i in 0..7 {
            let t = target(d.path(), &format!("Projekt Łódź {i}"));
            s.record(&t, &format!("Nazwa {i}")).unwrap();
            if i == 2 {
                first = Some(t);
            }
        }
        let c = s.list().unwrap();
        assert_eq!(c.entries.len(), 6);
        assert_eq!(c.entries[0].name, "Nazwa 6");
        assert!(c.entries.iter().all(|e| e.name != "Nazwa 0"));
        let id = c
            .entries
            .iter()
            .find(|e| e.name == "Nazwa 2")
            .unwrap()
            .id
            .clone();
        s.record(&first.unwrap(), "Zażółć gęślą").unwrap();
        let c = Store::new(root).list().unwrap();
        assert_eq!(c.entries.len(), 6);
        assert_eq!(c.entries[0].id, id);
        assert_eq!(c.entries[0].name, "Zażółć gęślą");
        assert!(c.entries[0].last_used > 0);
    }
    #[test]
    fn unknown_id_and_missing_file_never_open_other_paths() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::new(d.path().join("history"));
        let t = target(d.path(), "Plik");
        s.record(&t, "Plik").unwrap();
        let id = s.list().unwrap().entries[0].id.clone();
        assert!(s.target("../Plik.json").is_err());
        assert!(s.target(t.path().to_str().unwrap()).is_err());
        assert_eq!(s.target(&id).unwrap().read().unwrap(), t.read().unwrap());
        fs::remove_file(t.path()).unwrap();
        assert!(s.target(&id).is_err());
        assert_eq!(s.list().unwrap().entries.len(), 1);
    }
    #[test]
    fn remove_and_preference_never_delete_projects() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::new(d.path().join("history"));
        let t = target(d.path(), "Plik");
        s.record(&t, "Plik").unwrap();
        let id = s.list().unwrap().entries[0].id.clone();
        s.preference(false).unwrap();
        s.remove(&id).unwrap();
        assert!(!s.list().unwrap().show_on_startup);
        assert!(t.path().is_file());
        assert!(s.list().unwrap().entries.is_empty());
        assert!(s.remove(&id).is_err());
        s.clear().unwrap();
        assert!(!s.list().unwrap().show_on_startup);
    }
    #[test]
    fn future_and_corrupt_registry_require_explicit_clear() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::new(d.path().join("history"));
        let t = target(d.path(), "Plik");
        s.list().unwrap();
        for bad in ["bad json", "{\"version\":99,\"entries\":[]}"] {
            fs::write(s.file(), bad).unwrap();
            assert!(s.list().is_err());
            assert!(s.record(&t, "Nowy").is_err());
            assert_eq!(fs::read_to_string(s.file()).unwrap(), bad);
        }
        s.clear().unwrap();
        assert!(s.list().unwrap().entries.is_empty());
        assert!(t.path().exists());
        s.record(&t, "Nowy").unwrap();
    }
    #[test]
    fn lock_contention_preserves_previous_registry() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::new(d.path().join("history"));
        let t = target(d.path(), "Plik");
        s.record(&t, "Plik").unwrap();
        let before = fs::read(s.file()).unwrap();
        let guard = s.lock().unwrap();
        assert!(Store::new(s.root.clone()).record(&t, "Inny").is_err());
        assert_eq!(fs::read(s.file()).unwrap(), before);
        drop(guard);
        s.record(&t, "Inny").unwrap();
    }
    #[test]
    fn oversized_and_duplicate_registry_rejected_without_rewrite() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::new(d.path().join("history"));
        let t = target(d.path(), "Plik");
        s.record(&t, "Plik").unwrap();
        let mut value: serde_json::Value =
            serde_json::from_slice(&fs::read(s.file()).unwrap()).unwrap();
        let duplicate_entry = value["entries"][0].clone();
        value["entries"]
            .as_array_mut()
            .unwrap()
            .push(duplicate_entry);
        let duplicate = serde_json::to_vec(&value).unwrap();
        fs::write(s.file(), &duplicate).unwrap();
        assert!(s.list().is_err());
        assert_eq!(fs::read(s.file()).unwrap(), duplicate);
        fs::write(s.file(), vec![b' '; LIMIT as usize + 1]).unwrap();
        assert!(s.list().is_err());
        assert_eq!(fs::metadata(s.file()).unwrap().len(), LIMIT + 1);
    }
    #[cfg(unix)]
    #[test]
    fn replaced_project_symlink_cannot_redirect_a_recent_id() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::new(d.path().join("history"));
        let t = target(d.path(), "Pierwszy");
        let other = target(d.path(), "Drugi");
        s.record(&t, "Plik").unwrap();
        let id = s.list().unwrap().entries[0].id.clone();
        fs::remove_file(t.path()).unwrap();
        std::os::unix::fs::symlink(other.path(), t.path()).unwrap();
        assert!(s.target(&id).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn readonly_history_does_not_destroy_previous_generation() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::new(d.path().join("history"));
        let t = target(d.path(), "Plik");
        s.record(&t, "Plik").unwrap();
        let before = fs::read(s.file()).unwrap();
        let mut perm = fs::metadata(s.file()).unwrap().permissions();
        perm.set_readonly(true);
        fs::set_permissions(s.file(), perm.clone()).unwrap();
        assert!(s.record(&t, "Nowy").is_err());
        assert_eq!(fs::read(s.file()).unwrap(), before);
        perm.set_readonly(false);
        fs::set_permissions(s.file(), perm).unwrap();
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Catalog {
    pub version: u32,
    pub show_on_startup: bool,
    pub entries: Vec<Entry>,
}
impl Default for Catalog {
    fn default() -> Self {
        Self {
            version: 1,
            show_on_startup: true,
            entries: vec![],
        }
    }
}
pub struct Store {
    root: PathBuf,
}
impl Store {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
    fn lock(&self) -> Result<fs::File, String> {
        fs::create_dir_all(&self.root).map_err(|e| format!("Nie można otworzyć historii: {e}"))?;
        let f = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(self.root.join("history.lock"))
            .map_err(|e| e.to_string())?;
        f.try_lock().map_err(|_| {
            "Historia jest używana przez inną instancję. Spróbuj ponownie.".to_string()
        })?;
        Ok(f)
    }
    fn file(&self) -> PathBuf {
        self.root.join("projects.json")
    }
    fn reject_link(&self) -> Result<(), String> {
        if fs::symlink_metadata(self.file()).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("Plik historii nie może być dowiązaniem".into());
        }
        Ok(())
    }
    fn read(&self) -> Result<Catalog, String> {
        self.reject_link()?;
        let mut f = match fs::File::open(self.file()) {
            Ok(f) => f,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Catalog::default()),
            Err(e) => return Err(format!("Nie można odczytać historii: {e}")),
        };
        if !f.metadata().map_err(|e| e.to_string())?.is_file() {
            return Err("Historia nie jest zwykłym plikiem".into());
        }
        let mut bytes = Vec::new();
        (&mut f)
            .take(LIMIT + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() as u64 > LIMIT {
            return Err("Historia jest zbyt duża".into());
        }
        let raw: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_| {
            "Nie można odczytać historii. Możesz ją wyczyścić bez usuwania projektów.".to_string()
        })?;
        if raw["version"] != 1 {
            return Err("Historia pochodzi z innej wersji. Nie została zmieniona.".into());
        }
        let c: Catalog =
            serde_json::from_value(raw).map_err(|_| "Nieprawidłowy format historii".to_string())?;
        if c.entries.len() > 6 {
            return Err("Nieprawidłowa liczba ostatnich projektów".into());
        }
        let mut ids = std::collections::HashSet::new();
        let mut paths = std::collections::HashSet::new();
        for e in &c.entries {
            if e.last_used > 8_640_000_000_000_000
                || e.id.len() != 16
                || !e.id.bytes().all(|b| b.is_ascii_hexdigit())
                || !ids.insert(&e.id)
                || !paths.insert(&e.path)
                || e.name.is_empty()
                || e.name.chars().count() > 200
                || !e.path.is_absolute()
                || e.path.to_string_lossy().len() > 131072
                || !e
                    .path
                    .extension()
                    .is_some_and(|s| s.eq_ignore_ascii_case("json"))
            {
                return Err("Nieprawidłowy wpis historii".into());
            }
        }
        Ok(c)
    }
    fn write(&self, c: &Catalog) -> Result<(), String> {
        self.reject_link()?;
        let bytes = serde_json::to_vec(c).map_err(|e| e.to_string())?;
        if bytes.len() as u64 > LIMIT {
            return Err("Historia jest zbyt duża".into());
        }
        let mut temp = tempfile::Builder::new()
            .prefix("recent-")
            .tempfile_in(&self.root)
            .map_err(|e| e.to_string())?;
        temp.write_all(&bytes).map_err(|e| e.to_string())?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        self.reject_link()?;
        temp.persist(self.file())
            .map_err(|e| format!("Nie można zapisać historii: {e}"))?;
        Ok(())
    }
    pub fn list(&self) -> Result<Catalog, String> {
        let _lock = self.lock()?;
        self.read()
    }
    /// Only called after successful Open / Save, with its canonical authorized Target.
    pub fn record(&self, target: &Target, name: &str) -> Result<(), String> {
        let _lock = self.lock()?;
        let mut c = self.read()?;
        if name.is_empty() || name.chars().count() > 200 {
            return Err("Nieprawidłowa nazwa projektu".into());
        }
        let old = c
            .entries
            .iter()
            .find(|e| e.path == target.path())
            .map(|e| e.id.clone());
        c.entries.retain(|e| e.path != target.path());
        let id = old.unwrap_or_else(|| {
            let mut h = std::collections::hash_map::DefaultHasher::new();
            target.path().hash(&mut h);
            SystemTime::now().hash(&mut h);
            format!("{:016x}", h.finish())
        });
        if c.entries.iter().any(|e| e.id == id) {
            return Err("Nie można nadać identyfikatora historii. Spróbuj ponownie.".into());
        }
        let at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis() as u64;
        c.entries.insert(
            0,
            Entry {
                id,
                path: target.path().to_owned(),
                name: name.into(),
                last_used: at,
            },
        );
        c.entries.truncate(6);
        self.write(&c)
    }
    pub fn target(&self, id: &str) -> Result<Target, String> {
        let _lock = self.lock()?;
        let c = self.read()?;
        let entry = c
            .entries
            .iter()
            .find(|e| e.id == id)
            .ok_or("Nieznany projekt w historii")?;
        let canonical = fs::canonicalize(&entry.path).map_err(|e| {
            format!("Projekt jest niedostępny: {e}. Wskaż go ponownie lub usuń wpis z historii.")
        })?;
        if canonical != entry.path {
            return Err(
                "Plik projektu zmienił położenie. Wybierz go ponownie przez Otwórz.".into(),
            );
        }
        Target::selected(&entry.path)
    }
    pub fn remove(&self, id: &str) -> Result<(), String> {
        let _lock = self.lock()?;
        let mut c = self.read()?;
        if !c.entries.iter().any(|e| e.id == id) {
            return Err("Nieznany projekt w historii".into());
        }
        c.entries.retain(|e| e.id != id);
        self.write(&c)
    }
    pub fn preference(&self, enabled: bool) -> Result<(), String> {
        let _lock = self.lock()?;
        let mut c = self.read()?;
        c.show_on_startup = enabled;
        self.write(&c)
    }
    pub fn clear(&self) -> Result<(), String> {
        let _lock = self.lock()?;
        let show_on_startup = self.read().map(|c| c.show_on_startup).unwrap_or(true);
        self.write(&Catalog {
            show_on_startup,
            ..Catalog::default()
        })
    }
}
