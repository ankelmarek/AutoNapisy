use autonapisy_core_tests::{caption_stream::CaptionStream,transcription::Job};
use std::{path::PathBuf,process::Command,sync::Arc};
#[test]
#[ignore="requires real FFmpeg"]
fn actual_lossless_alpha_stream_order_cancel_and_cleanup(){
 let ff=PathBuf::from(std::env::var_os("AUTONAPISY_FFMPEG").unwrap());let dir=tempfile::tempdir().unwrap();let job=Arc::new(Job::new(1));
 let stream=CaptionStream::start(job.clone(),&ff,dir.path(),128,128,90).unwrap();
 assert!(stream.push(1,vec![0;128*128*4]).is_err());assert!(stream.push(0,vec![0;3]).is_err());assert!(stream.finish().is_err());
 for frame in 0..90 {let pixel=[(frame*2) as u8,64,220,(frame+30) as u8];let data=pixel.repeat(128*128);stream.push(frame,data).unwrap();}
 assert!(stream.push(90,vec![0;128*128*4]).is_err());stream.finish().unwrap();assert!(stream.finish().is_err());
 for frame in [0,1,30,89]{let out=Command::new(&ff).args(["-v","error","-i"]).arg(&stream.output).args(["-vf",&format!("select=eq(n\\,{frame})"),"-frames:v","1","-pix_fmt","rgba","-f","rawvideo","pipe:1"]).output().unwrap();assert!(out.status.success(),"{}",String::from_utf8_lossy(&out.stderr));assert_eq!(out.stdout,[(frame*2)as u8,64,220,(frame+30)as u8].repeat(128*128));}
 drop(stream);let cancel=Arc::new(Job::new(2));let d=tempfile::tempdir().unwrap();let stream=CaptionStream::start(cancel.clone(),&ff,d.path(),128,128,150).unwrap();stream.push(0,vec![0;128*128*4]).unwrap();cancel.cancel();assert!(stream.push(1,vec![0;128*128*4]).is_err());let at=std::time::Instant::now();drop(stream);assert!(at.elapsed().as_secs()<3);let path=d.path().to_owned();drop(d);assert!(!path.exists());
 println!("0.33a actual FFV1 RGBA alpha/30 FPS, exact pixels/order, backpressure, cancel/reap and temp cleanup: OK");
}
