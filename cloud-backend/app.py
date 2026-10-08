"""Experimental CPU-only Willow Tree vocal separator; not yet deployed."""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
import gradio as gr

MAX_BYTES = 40 * 1024 * 1024

def separate(audio_path):
    if not audio_path:
        raise gr.Error("Upload an audio file first.")
    source = Path(audio_path)
    if source.stat().st_size > MAX_BYTES:
        raise gr.Error("Please use a file smaller than 40 MB.")
    work = Path(tempfile.mkdtemp(prefix="willow-"))
    try:
        infile = work / ("song" + (source.suffix.lower() if source.suffix else ".mp3"))
        shutil.copyfile(source, infile)
        output = work / "output"
        cmd = ["python", "-m", "demucs", "--two-stems=vocals", "-n", "mdx_q",
               "-d", "cpu", "--mp3", "--mp3-bitrate", "192", "-o", str(output), str(infile)]
        subprocess.run(cmd, check=True, timeout=1200, capture_output=True, text=True)
        stems = output / "mdx_q" / "song"
        vocals, instrumental = stems / "vocals.mp3", stems / "no_vocals.mp3"
        if not vocals.is_file() or not instrumental.is_file():
            raise RuntimeError("Expected output tracks were not created")
        return str(vocals), str(instrumental)
    except subprocess.TimeoutExpired:
        raise gr.Error("Processing took too long. Please try a shorter track.")
    except subprocess.CalledProcessError as exc:
        raise gr.Error("Audio processing failed. Please try an MP3 or WAV file.")
    # Output files must persist until Gradio has copied them into its cache.

with gr.Blocks(title="Willow Tree CPU Separation Test") as demo:
    gr.Markdown("# Willow Tree — experimental cloud CPU separator\nFor testing only. Files are processed remotely.")
    audio = gr.File(label="Upload MP3 or WAV", type="filepath")
    run = gr.Button("Separate vocals")
    vocals = gr.Audio(label="Vocals", type="filepath")
    instrumental = gr.Audio(label="Instrumental", type="filepath")
    run.click(separate, inputs=[audio], outputs=[vocals, instrumental], concurrency_limit=1)

if __name__ == "__main__":
    demo.queue(max_size=3).launch(server_name="0.0.0.0", server_port=int(os.environ.get("PORT", "7860")))
