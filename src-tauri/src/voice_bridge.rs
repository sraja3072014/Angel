use std::fs;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
pub fn offline_speech_to_text(wav_path: Option<String>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let ps_script = if let Some(path) = wav_path {
            format!(
                r#"
                Add-Type -AssemblyName System.Speech
                $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
                $rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
                $rec.SetInputToWaveFile('{}')
                $res = $rec.Recognize()
                if ($res) {{ $res.Text }} else {{ '' }}
                "#,
                path.replace('\'', "''")
            )
        } else {
            r#"
            Add-Type -AssemblyName System.Speech
            $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
            $rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
            $rec.SetInputToDefaultAudioDevice()
            $res = $rec.Recognize([TimeSpan]::FromSeconds(4))
            if ($res) { $res.Text } else { '' }
            "#
            .to_string()
        };

        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_script])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| e.to_string())?;

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if text.is_empty() {
            Err("No offline speech detected".into())
        } else {
            Ok(text)
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = wav_path;
        Err("Offline speech recognition is supported on Windows".into())
    }
}

#[tauri::command]
pub fn speak_offline_tts(text: String, is_tamil: bool) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let clean_text = text.replace('"', "").replace('\'', "").replace('\n', " ");

        // 1. Tamil -> Edge Neural Tamil Female Voice (ta-IN-PallaviNeural)
        if is_tamil {
            let temp_mp3 = std::env::temp_dir().join("angel_ta_reply.mp3");
            let edge_res = Command::new("edge-tts")
                .args([
                    "--voice",
                    "ta-IN-PallaviNeural",
                    "--text",
                    &clean_text,
                    "--write-media",
                    &temp_mp3.to_string_lossy(),
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            if let Ok(out) = edge_res {
                if out.status.success() && temp_mp3.exists() {
                    let play_cmd = format!(
                        "$p = New-Object System.Media.SoundPlayer '{}'; $p.PlaySync()",
                        temp_mp3.display().to_string().replace('\'', "''")
                    );
                    let _ = Command::new("powershell")
                        .args(["-NoProfile", "-Command", &play_cmd])
                        .creation_flags(CREATE_NO_WINDOW)
                        .output();
                    let _ = fs::remove_file(temp_mp3);
                    return Ok("Tamil Neural Voice spoken successfully.".into());
                }
            }
        }

        // 2. English Piper Neural Engine (`en_US-lessac-medium.onnx`)
        let piper_exe = find_piper_binary();
        if let Some(exe_path) = piper_exe {
            let model_path = exe_path.parent().unwrap().join("en_US-lessac-medium.onnx");
            let temp_wav = std::env::temp_dir().join("angel_piper_reply.wav");

            if model_path.exists() {
                let piper_status = Command::new(&exe_path)
                    .args([
                        "--model",
                        &model_path.to_string_lossy(),
                        "--output_file",
                        &temp_wav.to_string_lossy(),
                    ])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();

                if let Ok(res) = piper_status {
                    if res.status.success() && temp_wav.exists() {
                        let play_cmd = format!(
                            "$p = New-Object System.Media.SoundPlayer '{}'; $p.PlaySync()",
                            temp_wav.display().to_string().replace('\'', "''")
                        );
                        let _ = Command::new("powershell")
                            .args(["-NoProfile", "-Command", &play_cmd])
                            .creation_flags(CREATE_NO_WINDOW)
                            .output();
                        let _ = fs::remove_file(temp_wav);
                        return Ok("Piper Neural TTS spoken successfully.".into());
                    }
                }
            }
        }

        // 3. Fallback: Windows SAPI Voice
        let ps_sapi = format!(
            r#"
            Add-Type -AssemblyName System.Speech
            $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
            $synth.Rate = 0
            $synth.Speak('{}')
            "#,
            clean_text.replace('\'', "''")
        );

        let _ = Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_sapi])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        Ok("Windows SAPI spoken successfully.".into())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (text, is_tamil);
        Ok("TTS completed via mobile web audio.".into())
    }
}

#[cfg(target_os = "windows")]
fn find_piper_binary() -> Option<PathBuf> {
    let local_app_data = std::env::var("LOCALAPPDATA").ok()?;
    let path = PathBuf::from(local_app_data)
        .join("ProjectAngel")
        .join("piper")
        .join("piper.exe");
    if path.exists() {
        Some(path)
    } else {
        None
    }
}
