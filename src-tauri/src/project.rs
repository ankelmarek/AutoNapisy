use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
#[derive(Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Project {pub schema_version:u32,pub name:String,pub media:Option<Media>,pub segments:Vec<Segment>,pub styles:HashMap<String,Style>,pub created_at:String,pub updated_at:String}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Media {pub path:String,pub name:String,pub duration:Option<f64>}
#[derive(Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Segment {pub id:String,pub text:String,pub start:f64,pub end:f64,pub words:Vec<Word>,pub style_id:String}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Word {pub text:String,pub start:f64,pub end:f64}
#[derive(Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Style {pub font_family:String,pub font_size:f64,pub color:String,pub background:String,pub position:String}
fn valid_time(t:f64)->bool{t.is_finite()&&t>=0.0}
fn color(c:&str)->bool{c.len()==7&&c.starts_with('#')&&c[1..].bytes().all(|b|b.is_ascii_hexdigit())}
pub fn parse(json:&str)->Result<Project,String>{
 let p:Project=serde_json::from_str(json).map_err(|e|format!("Niepoprawny JSON projektu: {e}"))?;
 if p.schema_version!=1{return Err("Nieobsługiwana wersja projektu".into());}
 if p.name.is_empty()||p.name.chars().count()>200||p.created_at.is_empty()||p.updated_at.is_empty(){return Err("Niepoprawne metadane projektu".into());}
 if let Some(m)=&p.media {if m.path.is_empty()||m.duration.is_some_and(|t|!valid_time(t)){return Err("Niepoprawne dane filmu".into());}}
 for s in p.styles.values(){if s.font_family.is_empty()||s.font_family.chars().count()>100||!s.font_size.is_finite()||!(12.0..=100.0).contains(&s.font_size)||!color(&s.color)||!color(&s.background)||!["bottom","center","top"].contains(&s.position.as_str()){return Err("Niepoprawny styl".into());}}
 if !p.styles.contains_key("default"){return Err("Brak stylu domyślnego".into());}
 let mut ids=HashSet::new();
 for s in &p.segments {if s.id.is_empty()||!ids.insert(&s.id)||!p.styles.contains_key(&s.style_id)||!valid_time(s.start)||!valid_time(s.end)||s.end<s.start||p.media.as_ref().and_then(|m|m.duration).is_some_and(|d|s.end>d){return Err("Niepoprawny segment".into());}for w in &s.words{if !valid_time(w.start)||!valid_time(w.end)||w.end<w.start||w.start<s.start||w.end>s.end{return Err("Niepoprawny czas słowa".into());}}}
 Ok(p)
}
#[cfg(test)] mod tests{
 use super::*;
 fn json()->String{serde_json::json!({"schemaVersion":1,"name":"Zażółć 🎬","media":null,"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#111111","position":"bottom"}},"createdAt":"2026-10-14T00:00:00Z","updatedAt":"2026-10-14T00:00:00Z"}).to_string()}
 #[test] fn unicode_roundtrip(){let p=parse(&json()).unwrap();assert_eq!(parse(&serde_json::to_string(&p).unwrap()).unwrap().name,"Zażółć 🎬");}
 #[test] fn future_version_rejected(){assert!(parse(&json().replace("\"schemaVersion\":1","\"schemaVersion\":2")).is_err());}
 #[test] fn missing_default_rejected(){let mut v:serde_json::Value=serde_json::from_str(&json()).unwrap();v["styles"]=serde_json::json!({});assert!(parse(&v.to_string()).is_err());}
 #[test] fn invalid_word_rejected(){let mut v:serde_json::Value=serde_json::from_str(&json()).unwrap();v["segments"]=serde_json::json!([{"id":"a","text":"a","start":0,"end":1,"styleId":"default","words":[{"text":"a","start":0,"end":2}]}]);assert!(parse(&v.to_string()).is_err());}
}
