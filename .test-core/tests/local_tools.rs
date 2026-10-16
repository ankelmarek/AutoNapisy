//! Opt-in test using real, separately installed tools and an explicitly supplied local sample.
use autonapisy_core_tests::transcription::{execute,Job,Tools};
use std::{path::PathBuf,sync::Arc};
#[test]
#[ignore = "requires AUTONAPISY_FFMPEG, AUTONAPISY_WHISPER, AUTONAPISY_MODEL, AUTONAPISY_SAMPLE"]
fn real_local_transcription(){
 let path=|key:&str|PathBuf::from(std::env::var(key).expect(key));
 let tools=Tools{ffmpeg:Some(path("AUTONAPISY_FFMPEG")),whisper:Some(path("AUTONAPISY_WHISPER")),model:Some(path("AUTONAPISY_MODEL"))}.validated().unwrap();
 let sample=std::fs::canonicalize(path("AUTONAPISY_SAMPLE")).unwrap();
 let (segments,duration)=execute(Arc::new(Job::new(1)),tools,sample).unwrap();
 assert!(duration>0.0);assert!(!segments.is_empty(),"Sample must contain speech");
 for segment in &segments {assert!(segment.start>=0.0&&segment.end>segment.start&&segment.end<=duration);}
 println!("Local tools smoke test: {} segments, {:.2}s audio",segments.len(),duration);
}
