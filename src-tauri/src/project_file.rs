//! Session-owned project targets. No destination path is accepted over IPC.
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::SystemTime,
};
pub const LIMIT: usize = 16 * 1024 * 1024;
#[derive(Clone, PartialEq, Debug)]
struct Stamp {
    bytes: Vec<u8>,
    modified: Option<SystemTime>,
}
fn stamp(path: &Path) -> Result<Option<Stamp>, String> {
    let mut file = match fs::File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("Nie można odczytać projektu: {e}")),
    };
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("Projekt musi być zwykłym plikiem JSON".into());
    }
    let mut bytes = Vec::new();
    (&mut file)
        .take(LIMIT as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > LIMIT {
        return Err("Projekt przekracza limit 16 MB".into());
    }
    Ok(Some(Stamp {
        bytes,
        modified: file.metadata().ok().and_then(|m| m.modified().ok()),
    }))
}
#[derive(Clone)]
pub struct Target {
    path: PathBuf,
    expected: Option<Stamp>,
}
impl Target {
    /// Called only for a path selected by a native Open / Save As dialog.
    pub fn selected(path: &Path) -> Result<Self, String> {
        if !path
            .extension()
            .is_some_and(|v| v.eq_ignore_ascii_case("json"))
        {
            return Err("Wybierz plik z rozszerzeniem .json".into());
        }
        // Resolve links and directory aliases before retaining the authorized target.
        let path = if path.exists() {
            fs::canonicalize(path)
        } else {
            fs::canonicalize(path.parent().ok_or("Niepoprawny katalog")?)
                .map(|d| d.join(path.file_name().unwrap()))
        }
        .map_err(|e| format!("Nie można wybrać pliku projektu: {e}"))?;
        if !path
            .extension()
            .is_some_and(|v| v.eq_ignore_ascii_case("json"))
        {
            return Err("Plik docelowy musi być projektem JSON".into());
        }
        let expected = stamp(&path)?;
        Ok(Self { path, expected })
    }
    pub fn path(&self) -> &Path {
        &self.path
    }
    pub fn read(&self) -> Result<String, String> {
        String::from_utf8(
            self.expected
                .as_ref()
                .ok_or("Projekt nie istnieje")?
                .bytes
                .clone(),
        )
        .map_err(|_| "Projekt nie jest poprawnym UTF-8".into())
    }
    fn unchanged(&self) -> Result<(), String> {
        // A replaced symlink must never redirect a subsequent direct save.
        if fs::symlink_metadata(&self.path).is_ok_and(|m| m.file_type().is_symlink())
            || stamp(&self.path)? != self.expected
        {
            return Err("Konflikt: plik projektu został zmieniony lub usunięty poza RolVixa. Użyj Zapisz jako, aby zapisać kopię, albo otwórz aktualny plik.".into());
        }
        Ok(())
    }
    pub fn write(&mut self, json: &str) -> Result<(), String> {
        if json.len() > LIMIT {
            return Err("Projekt przekracza limit 16 MB".into());
        }
        crate::project::parse(json)?;
        self.unchanged()?;
        let mut temp =
            tempfile::NamedTempFile::new_in(self.path.parent().ok_or("Brak katalogu projektu")?)
                .map_err(|e| format!("Nie można przygotować zapisu: {e}"))?;
        temp.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        let modified = temp
            .as_file()
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok());
        self.unchanged()?;
        temp.persist(&self.path)
            .map_err(|e| format!("Nie można zapisać projektu: {e}"))?;
        self.expected = Some(Stamp {
            bytes: json.as_bytes().to_vec(),
            modified,
        });
        Ok(())
    }
}
#[derive(Default)]
pub struct Session {
    pub id: u64,
    pub target: Option<Target>,
}
impl Session {
    pub fn reset(&mut self, target: Option<Target>) -> u64 {
        self.id += 1;
        self.target = target;
        self.id
    }
    pub fn check(&self, id: u64) -> Result<(), String> {
        if self.id != id {
            Err("Projekt został zmieniony. Ponów zapis bieżącego projektu.".into())
        } else {
            Ok(())
        }
    }
}
pub fn suggested_name(name: &str) -> String {
    let safe: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(120)
        .collect();
    let safe = safe.trim().trim_end_matches(['.', ' ']);
    // Prefix also avoids Windows device names such as CON and NUL.
    format!(
        "Projekt-{}.rolvixa.json",
        if safe.is_empty() { "bez nazwy" } else { safe }
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    fn json(name: &str) -> String {
        format!(
            r##"{{"schemaVersion":8,"name":"{name}","media":null,"segments":[],"styles":{{"default":{{"fontFamily":"Arial","fontSize":40,"color":"#ffffff","background":"#000000","position":"bottom"}}}},"clips":null,"createdAt":"2026-10-17T00:00:00Z","updatedAt":"2026-10-17T00:00:00Z"}}"##
        )
    }
    #[test]
    fn unicode_atomic_repeat_and_reopen() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("Łódź 日本.json");
        let mut t = Target::selected(&p).unwrap();
        t.write(&json("Jeden")).unwrap();
        t.write(&json("Dwa")).unwrap();
        assert_eq!(Target::selected(&p).unwrap().read().unwrap(), json("Dwa"));
        assert_eq!(fs::read_dir(d.path()).unwrap().count(), 1);
    }
    #[test]
    fn conflict_deletion_and_copy() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("a.json");
        let mut t = Target::selected(&p).unwrap();
        t.write(&json("A")).unwrap();
        fs::write(&p, json("Obcy")).unwrap();
        assert!(t.write(&json("B")).unwrap_err().contains("Konflikt"));
        assert_eq!(fs::read_to_string(&p).unwrap(), json("Obcy"));
        let mut copy = Target::selected(&d.path().join("b.json")).unwrap();
        copy.write(&json("B")).unwrap();
        fs::remove_file(&p).unwrap();
        assert!(t.write(&json("C")).is_err());
    }
    #[test]
    fn invalid_json_and_missing_directory_keep_original() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("a.json");
        let mut t = Target::selected(&p).unwrap();
        t.write(&json("A")).unwrap();
        assert!(t.write("bad json").is_err());
        assert_eq!(fs::read_to_string(&p).unwrap(), json("A"));
        assert!(Target::selected(&d.path().join("absent/a.json")).is_err());
        assert!(Target::selected(&d.path().join("a.mp4")).is_err());
    }
    #[test]
    fn selected_existing_target_detects_race() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("a.json");
        fs::write(&p, json("A")).unwrap();
        let mut t = Target::selected(&p).unwrap();
        fs::write(&p, json("B")).unwrap();
        assert!(t.write(&json("C")).is_err());
    }
    #[test]
    fn failed_save_does_not_switch_session() {
        let mut s = Session::default();
        assert!(s.check(0).is_ok());
        let id = s.reset(None);
        assert!(s.check(0).is_err());
        assert!(s.check(id).is_ok());
        assert!(s.target.is_none());
    }
    #[test]
    fn windows_name() {
        assert_eq!(
            suggested_name("  Film: Łódź?.  "),
            "Projekt-Film_ Łódź_.rolvixa.json"
        );
        assert!(suggested_name("CON").starts_with("Projekt-CON"));
    }
    #[test]
    fn removed_directory_and_oversized_input_fail_without_creating_files() {
        let d = tempfile::tempdir().unwrap();
        let dir = d.path().join("sub");
        fs::create_dir(&dir).unwrap();
        let mut t = Target::selected(&dir.join("a.json")).unwrap();
        fs::remove_dir(&dir).unwrap();
        assert!(t.write(&json("A")).is_err());
        assert!(!dir.exists());
        assert!(t
            .write(&" ".repeat(LIMIT + 1))
            .unwrap_err()
            .contains("16 MB"));
    }
    #[cfg(windows)]
    #[test]
    fn readonly_windows_target_preserves_original_on_error() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("read-only.json");
        fs::write(&p, json("A")).unwrap();
        let mut t = Target::selected(&p).unwrap();
        let mut perm = fs::metadata(&p).unwrap().permissions();
        perm.set_readonly(true);
        fs::set_permissions(&p, perm.clone()).unwrap();
        assert!(t.write(&json("B")).is_err());
        assert_eq!(fs::read_to_string(&p).unwrap(), json("A"));
        perm.set_readonly(false);
        fs::set_permissions(&p, perm).unwrap();
        t.write(&json("B")).unwrap();
    }
}
