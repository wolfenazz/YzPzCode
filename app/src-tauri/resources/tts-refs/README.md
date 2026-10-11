# Bundled TTS reference voices (placeholder)

Task 1 placeholder. Task 2/4 ships 2–3 short reference clips here:

- `ar-male.wav` + `ar-male.txt` (MSA Arabic, male)
- `ar-female.wav` + `ar-female.txt` (MSA Arabic, female)
- `en-neutral.wav` + `en-neutral.txt` (neutral English)

Contract: each WAV < 8s, 24 kHz mono; each `.txt` holds the exact transcript
passed as `ref_text` alongside `ref_file` to the SILMA/Chatterbox bridge.
The frontend auto-picks by detected language; no custom upload in v1.
