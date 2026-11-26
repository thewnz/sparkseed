param([string] $AudioPath)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
  Add-Type -AssemblyName System.Speech
  $engines = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
  $engine = $engines | Where-Object { $_.Culture.Name -like 'zh-*' } | Select-Object -First 1
  if (-not $engine) { $engine = $engines | Select-Object -First 1 }
  if (-not $engine) {
    '{"status":"unavailable"}'
    exit
  }
  $speech = [System.Speech.Recognition.SpeechRecognitionEngine]::new($engine)
  try {
    $speech.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
    if ($AudioPath) { $speech.SetInputToWaveFile($AudioPath) }
    else { $speech.SetInputToDefaultAudioDevice() }
    $speech.EndSilenceTimeout = [TimeSpan]::FromSeconds(2)
    $result = $speech.Recognize([TimeSpan]::FromSeconds(10))
    if ($result -and $result.Text) {
      @{ status = 'ok'; text = $result.Text } | ConvertTo-Json -Compress
    } else {
      '{"status":"empty"}'
    }
  } finally { $speech.Dispose() }
} catch {
  '{"status":"failed"}'
}
