//! App-owned caption templates. Projects retain independent style snapshots.
use crate::project::{validate_style, Style};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
const LIMIT: u64 = 1024 * 1024;
const MAX: usize = 128;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub style: Value,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Catalog {
    pub version: u32,
    pub revision: u64,
    pub entries: Vec<Entry>,
}
impl Default for Catalog {
    fn default() -> Self {
        Self {
            version: 1,
            revision: 0,
            entries: vec![],
        }
    }
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Mutation {
    Create { name: String, style: Value },
    Rename { id: String, name: String },
    Duplicate { id: String, name: String },
    Delete { id: String },
}
fn name(value: &str) -> Result<String, String> {
    if value.chars().any(char::is_control) {
        return Err("Nazwa stylu nie może zawierać znaków sterujących.".into());
    }
    let n = value.trim();
    if n.is_empty() || n.chars().count() > 60 {
        return Err("Nazwa stylu musi mieć od 1 do 60 znaków.".into());
    }
    Ok(n.into())
}
fn valid_id(id: &str) -> bool {
    id.len() == 37 && id.starts_with("user-") && id[5..].bytes().all(|b| b.is_ascii_hexdigit())
}
fn style(value: &Value) -> Result<(), String> {
    if ["effect", "outlineColor", "outlineWidth"]
        .iter()
        .any(|key| value.get(key).is_some_and(Value::is_null))
        || value
            .get("fontFamily")
            .and_then(Value::as_str)
            .is_some_and(|f| f.encode_utf16().count() > 100)
    {
        return Err("Nieprawidłowy styl biblioteki.".into());
    }

    if value
        .get("animation")
        .is_some_and(|a| a.is_null() || a.get("enabled").is_some_and(|e| !e.is_boolean()))
    {
        return Err("Nieprawidłowy stan animacji stylu.".into());
    }
    let s: Style =
        serde_json::from_value(value.clone()).map_err(|e| format!("Nieprawidłowy styl: {e}"))?;
    validate_style(&s)
}
static SERIAL: AtomicU64 = AtomicU64::new(0);
fn new_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!(
        "user-{:032x}",
        now ^ ((std::process::id() as u128) << 96)
            ^ ((SERIAL.fetch_add(1, Ordering::Relaxed) as u128) << 64)
    )
}
pub struct Store {
    root: PathBuf,
}
impl Store {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
    fn file(&self) -> PathBuf {
        self.root.join("presets.json")
    }
    fn reject_links(&self) -> Result<(), String> {
        for p in [&self.root, &self.file(), &self.root.join("library.lock")] {
            if fs::symlink_metadata(p).is_ok_and(|m| m.file_type().is_symlink()) {
                return Err("Biblioteka stylów nie może być dowiązaniem.".into());
            }
        }
        Ok(())
    }
    fn lock(&self) -> Result<fs::File, String> {
        self.reject_links()?;
        fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        let f = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.root.join("library.lock"))
            .map_err(|e| e.to_string())?;
        f.try_lock().map_err(|_| {
            "Biblioteka stylów jest używana przez inną instancję. Spróbuj ponownie.".to_string()
        })?;
        Ok(f)
    }
    fn read(&self) -> Result<Catalog, String> {
        self.reject_links()?;
        let mut f = match fs::File::open(self.file()) {
            Ok(f) => f,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Catalog::default()),
            Err(e) => return Err(e.to_string()),
        };
        if !f.metadata().map_err(|e| e.to_string())?.is_file() {
            return Err("Biblioteka nie jest zwykłym plikiem.".into());
        }
        let mut bytes = vec![];
        (&mut f)
            .take(LIMIT + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() as u64 > LIMIT {
            return Err("Biblioteka stylów przekracza 1 MiB.".into());
        }
        let c: Catalog = serde_json::from_slice(&bytes).map_err(|_| {
            "Nie można odczytać biblioteki stylów. Plik pozostawiono bez zmian.".to_string()
        })?;
        if c.version != 1 {
            return Err(
                "Biblioteka stylów pochodzi z innej wersji. Plik pozostawiono bez zmian.".into(),
            );
        }
        if c.entries.len() > MAX {
            return Err("Biblioteka zawiera zbyt wiele stylów.".into());
        }
        let mut ids = HashSet::new();
        let mut names = HashSet::new();
        for e in &c.entries {
            if !valid_id(&e.id)
                || !ids.insert(&e.id)
                || name(&e.name)? != e.name
                || !names.insert(e.name.to_lowercase())
            {
                return Err("Nieprawidłowe lub powtórzone dane stylu.".into());
            }
            style(&e.style)?;
        }
        Ok(c)
    }
    pub fn list(&self) -> Result<Catalog, String> {
        let _lock = self.lock()?;
        self.read()
    }
    pub fn mutate(&self, revision: u64, op: Mutation) -> Result<Catalog, String> {
        let _lock = self.lock()?;
        let mut c = self.read()?;
        if revision != c.revision {
            return Err(
                "Biblioteka została zmieniona w innym oknie. Odśwież i spróbuj ponownie.".into(),
            );
        }
        let unused = |n: &str, except: &str, c: &Catalog| {
            if c.entries
                .iter()
                .any(|e| e.id != except && e.name.to_lowercase() == n.to_lowercase())
            {
                Err("Styl o tej nazwie już istnieje.".to_string())
            } else {
                Ok(())
            }
        };
        match op {
            Mutation::Create { name: n, style: s } => {
                let n = name(&n)?;
                unused(&n, "", &c)?;
                style(&s)?;
                if c.entries.len() >= MAX {
                    return Err("Możesz zapisać maksymalnie 128 własnych stylów.".into());
                }
                let id = new_id();
                if c.entries.iter().any(|e| e.id == id) {
                    return Err("Nie można utworzyć identyfikatora stylu. Spróbuj ponownie.".into());
                }
                c.entries.push(Entry {
                    id,
                    name: n,
                    style: s,
                });
            }
            Mutation::Rename { id, name: n } => {
                let n = name(&n)?;
                unused(&n, &id, &c)?;
                c.entries
                    .iter_mut()
                    .find(|e| e.id == id)
                    .ok_or("Własny styl już nie istnieje.")?
                    .name = n;
            }
            Mutation::Duplicate { id, name: n } => {
                let s = c
                    .entries
                    .iter()
                    .find(|e| e.id == id)
                    .ok_or("Własny styl już nie istnieje.")?
                    .style
                    .clone();
                let n = name(&n)?;
                unused(&n, "", &c)?;
                if c.entries.len() >= MAX {
                    return Err("Możesz zapisać maksymalnie 128 własnych stylów.".into());
                }
                let id = new_id();
                if c.entries.iter().any(|e| e.id == id) {
                    return Err("Nie można utworzyć identyfikatora stylu.".into());
                }
                c.entries.push(Entry {
                    id,
                    name: n,
                    style: s,
                });
            }
            Mutation::Delete { id } => {
                let at = c
                    .entries
                    .iter()
                    .position(|e| e.id == id)
                    .ok_or("Własny styl już nie istnieje.")?;
                c.entries.remove(at);
            }
        }
        c.revision = c
            .revision
            .checked_add(1)
            .ok_or("Przekroczono numer wersji biblioteki.")?;
        let bytes = serde_json::to_vec(&c).map_err(|e| e.to_string())?;
        if bytes.len() as u64 > LIMIT {
            return Err("Biblioteka stylów przekracza 1 MiB.".into());
        }
        let mut temp = tempfile::Builder::new()
            .prefix("preset-")
            .tempfile_in(&self.root)
            .map_err(|e| e.to_string())?;
        temp.write_all(&bytes).map_err(|e| e.to_string())?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        self.reject_links()?;
        temp.persist(self.file())
            .map_err(|e| format!("Nie można zapisać biblioteki stylów: {e}"))?;
        Ok(c)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Value {
        serde_json::json!({"fontFamily":"Bebas Neue","fontSize":48,"color":"#ffffff","background":"#000000","position":"bottom","animation":{"preset":"karaoke-flow","version":1,"accentColor":"#ffe600","speed":1.4,"intensity":0.7,"enabled":false}})
    }
    #[test]
    fn unicode_restart_rename_duplicate_delete_and_independent_snapshot() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("Style Łódź 日本");
        let s = Store::new(root.clone());
        let a = s
            .mutate(
                0,
                Mutation::Create {
                    name: "  Moja żółta 🎬  ".into(),
                    style: sample(),
                },
            )
            .unwrap();
        let id = a.entries[0].id.clone();
        let snapshot = a.entries[0].style.clone();
        let b = Store::new(root).list().unwrap();
        assert_eq!(b.entries[0].id, id);
        assert_eq!(b.entries[0].name, "Moja żółta 🎬");
        let c = s
            .mutate(
                1,
                Mutation::Duplicate {
                    id: id.clone(),
                    name: "Kopia".into(),
                },
            )
            .unwrap();
        assert_ne!(c.entries[0].id, c.entries[1].id);
        assert_eq!(c.entries[0].style, c.entries[1].style);
        let c = s
            .mutate(
                2,
                Mutation::Rename {
                    id: id.clone(),
                    name: "Inna nazwa".into(),
                },
            )
            .unwrap();
        assert_eq!(c.entries[0].id, id);
        s.mutate(3, Mutation::Delete { id }).unwrap();
        assert_eq!(snapshot, sample());
        assert_eq!(s.list().unwrap().entries.len(), 1);
        assert_eq!(
            fs::read_dir(d.path().join("Style Łódź 日本"))
                .unwrap()
                .count(),
            2
        );
    }
    #[test]
    fn stale_revision_lock_and_invalid_names_preserve_bytes() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::new(d.path().to_owned());
        s.mutate(
            0,
            Mutation::Create {
                name: "Styl".into(),
                style: sample(),
            },
        )
        .unwrap();
        let before = fs::read(s.file()).unwrap();
        for n in ["", " \t ", "Nowy\nStyl", "STYL"] {
            assert!(s
                .mutate(
                    1,
                    Mutation::Create {
                        name: n.into(),
                        style: sample()
                    }
                )
                .is_err());
        }
        assert!(s
            .mutate(
                0,
                Mutation::Create {
                    name: "Inny".into(),
                    style: sample()
                }
            )
            .is_err());
        assert!(s
            .mutate(
                1,
                Mutation::Delete {
                    id: "classic-yellow".into()
                }
            )
            .is_err());
        let _lock = s.lock().unwrap();
        assert!(s.list().is_err());
        assert_eq!(fs::read(s.file()).unwrap(), before);
    }
    #[test]
    fn corrupt_future_oversized_and_invalid_styles_never_overwritten() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::new(d.path().to_owned());
        for bad in [
            b"wrong".to_vec(),
            br#"{"version":99,"revision":0,"entries":[]}"#.to_vec(),
            vec![b' '; LIMIT as usize + 1],
        ] {
            fs::write(s.file(), &bad).unwrap();
            assert!(s
                .mutate(
                    0,
                    Mutation::Create {
                        name: "Nowy".into(),
                        style: sample()
                    }
                )
                .is_err());
            assert_eq!(fs::read(s.file()).unwrap(), bad);
        }
        fs::remove_file(s.file()).unwrap();
        for bad in [
            serde_json::json!({}),
            {
                let mut s = sample();
                s["animation"]["enabled"] = Value::Null;
                s
            },
            {
                let mut s = sample();
                s["fontSize"] = 999.into();
                s
            },
            {
                let mut s = sample();
                s["shell"] = "cmd.exe".into();
                s
            },
        ] {
            assert!(s
                .mutate(
                    0,
                    Mutation::Create {
                        name: "Nowy".into(),
                        style: bad
                    }
                )
                .is_err());
        }
        assert!(s.list().unwrap().entries.is_empty());
    }
    #[test]
    fn null_optionals_and_full_catalog_are_rejected_without_losing_templates() {
        let d = tempfile::tempdir().unwrap();
        let store = Store::new(d.path().to_owned());
        for field in ["effect", "outlineColor", "outlineWidth"] {
            let mut v = sample();
            v[field] = Value::Null;
            assert!(store
                .mutate(
                    0,
                    Mutation::Create {
                        name: "Bad".into(),
                        style: v
                    }
                )
                .is_err());
        }
        let entries = (0..MAX)
            .map(|i| Entry {
                id: format!("user-{i:032x}"),
                name: format!("Styl {i}"),
                style: sample(),
            })
            .collect();
        let c = Catalog {
            version: 1,
            revision: 1,
            entries,
        };
        fs::write(store.file(), serde_json::to_vec(&c).unwrap()).unwrap();
        let before = fs::read(store.file()).unwrap();
        assert!(store
            .mutate(
                1,
                Mutation::Create {
                    name: "Overflow".into(),
                    style: sample()
                }
            )
            .is_err());
        assert_eq!(fs::read(store.file()).unwrap(), before);
    }
    #[cfg(unix)]
    #[test]
    fn symlink_catalog_does_not_redirect() {
        let d = tempfile::tempdir().unwrap();
        let outside = d.path().join("outside");
        fs::write(&outside, b"keep").unwrap();
        let root = d.path().join("styles");
        fs::create_dir(&root).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("presets.json")).unwrap();
        assert!(Store::new(root).list().is_err());
        assert_eq!(fs::read(outside).unwrap(), b"keep");
    }
    #[cfg(windows)]
    #[test]
    fn readonly_catalog_preserves_previous_generation() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::new(d.path().to_owned());
        let c = s
            .mutate(
                0,
                Mutation::Create {
                    name: "Styl".into(),
                    style: sample(),
                },
            )
            .unwrap();
        let bytes = fs::read(s.file()).unwrap();
        let mut p = fs::metadata(s.file()).unwrap().permissions();
        p.set_readonly(true);
        fs::set_permissions(s.file(), p.clone()).unwrap();
        assert!(s
            .mutate(
                c.revision,
                Mutation::Delete {
                    id: c.entries[0].id.clone()
                }
            )
            .is_err());
        assert_eq!(fs::read(s.file()).unwrap(), bytes);
        p.set_readonly(false);
        fs::set_permissions(s.file(), p).unwrap();
    }
}
