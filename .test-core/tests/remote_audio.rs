use autonapisy_core_tests::{audio_library, transcription::Job};
use std::{fs, process::Command, sync::Arc};
#[test]
#[ignore = "requires AUTONAPISY_FFMPEG"]
fn real_bounded_remote_fragment_and_thirty_second_audition() {
    let ff = std::path::PathBuf::from(std::env::var("AUTONAPISY_FFMPEG").unwrap());
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("Muzyka Łódź.wav");
    let result = Command::new(&ff)
        .args([
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=45",
            "-ar",
            "48000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
        ])
        .arg(&source)
        .output()
        .unwrap();
    assert!(result.status.success());
    let original_size = fs::metadata(&source).unwrap().len();
    let input = dir.path().join("fragment.wav");
    let size = audio_library::preview_fragment(
        &mut fs::File::open(&source).unwrap(),
        &mut fs::File::create(&input).unwrap(),
        || Ok(()),
    )
    .unwrap();
    assert_eq!(size, audio_library::PREVIEW_BYTES);
    assert!(original_size > size as u64);
    let output = dir.path().join("preview.wav");
    let duration =
        audio_library::preview_wav(&Arc::new(Job::new(1)), &ff, &input, &output, dir.path())
            .unwrap();
    assert!((duration - 30.).abs() < 0.03);
    let mut wav = hound::WavReader::open(&output).unwrap();
    assert_eq!(wav.spec().channels, 2);
    assert_eq!(wav.spec().sample_rate, 48000);
    assert!(wav
        .samples::<i16>()
        .take(48000)
        .any(|x| x.unwrap().abs() > 1000));
    assert_eq!(fs::metadata(&source).unwrap().len(), original_size);
    let canceled = Arc::new(Job::new(2));
    canceled.cancel();
    assert!(audio_library::preview_wav(
        &canceled,
        &ff,
        &input,
        &dir.path().join("canceled.wav"),
        dir.path()
    )
    .is_err());
    assert!(!dir.path().join("canceled.wav").exists());
    println!("Temporary input capped at 4 MiB, real 30-second stereo preview, cancellation and unchanged source: OK");
}
