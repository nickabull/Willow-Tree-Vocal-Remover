"""Experimental CPU-only Willow Tree vocal separator; requires cloud deployment/testing."""
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import gradio as gr

MAX_BYTES = 40 * 1024 * 1024
MAX_AGE_SECONDS = 2 * 60 * 60
WORK_ROOT = Path(tempfile.gettempdir()) / "willow-cpu-jobs"
WORK_ROOT.mkdir(parents=True, exist_ok=True)
ALLOWED_SUFFIXES = {".mp3", ".wav", ".m4a", ".flac", ".ogg"}


def cleanup_old_jobs():
    """Remove completed jobs after a grace period for Gradio's file cache."""
    cutoff = time.time() - MAX_AGE_SECONDS
    for path in WORK_ROOT.glob("willow-*"):
        try:
            if path.is_dir() and path.stat().st_mtime < cutoff:
                shutil.rmtree(path)
        except OSError:
            pass


def separate(audio_path):
    if not audio_path:
        raise gr.Error("Upload an audio file first.")
    source = Path(audio_path)
    if not source.is_file() or source.stat().st_size > MAX_BYTES:
        raise gr.Error("Please upload an audio file smaller than 40 MB.")
    suffix = source.suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise gr.Error("Please upload an MP3, WAV, M4A, FLAC or OGG file.")
    cleanup_old_jobs()
    work = Path(tempfile.mkdtemp(prefix="willow-", dir=WORK_ROOT))
    try:
        infile = work / ("song" + suffix)
        shutil.copyfile(source, infile)
        output = work / "output"
        cmd = [sys.executable, "-m", "demucs", "--two-stems=vocals", "-n", "mdx_q",
               "-d", "cpu", "--mp3", "--mp3-bitrate", "192",
               "-o", str(output), str(infile)]
        subprocess.run(cmd, check=True, timeout=1200, capture_output=True, text=True)
        stems = output / "mdx_q" / "song"
        vocals, instrumental = stems / "vocals.mp3", stems / "no_vocals.mp3"
        if not vocals.is_file() or not instrumental.is_file():
            raise RuntimeError("The audio separator did not create both tracks.")
        return str(vocals), str(instrumental)
    except subprocess.TimeoutExpired:
        shutil.rmtree(work, ignore_errors=True)
        raise gr.Error("Processing timed out. Please try a shorter track.")
    except subprocess.CalledProcessError:
        shutil.rmtree(work, ignore_errors=True)
        raise gr.Error("Audio processing failed. Try an MP3 or WAV file.")
    except Exception:
        shutil.rmtree(work, ignore_errors=True)
        raise


with gr.Blocks(title="Willow Tree CPU Separation Test", delete_cache=(3600, 7200)) as demo:
    gr.Markdown("# Willow Tree — experimental cloud CPU separator\nFor testing only. Audio is processed remotely.")
    audio = gr.File(label="Upload audio (up to 40 MB)", type="filepath", file_types=["audio"])
    run = gr.Button("Separate vocals")
    vocals = gr.Audio(label="Vocals", type="filepath")
    instrumental = gr.Audio(label="Instrumental", type="filepath")
    run.click(separate, inputs=[audio], outputs=[vocals, instrumental], concurrency_limit=1)

if __name__ == "__main__":
    demo.queue(max_size=3).launch(server_name="0.0.0.0", server_port=int(os.environ.get("PORT", "7860")))
