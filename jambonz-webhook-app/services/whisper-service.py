#!/usr/bin/env python3
"""
100% Free GPU-accelerated faster-whisper service
"""
import os
import tempfile
import logging
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize model on GPU
logger.info("Loading faster-whisper model on GPU...")
try:
    model = WhisperModel("base.en", device="cuda", compute_type="float16")
    logger.info("✅ Faster-whisper model loaded on GPU")
except Exception as e:
    logger.error(f"❌ Failed to load GPU model: {e}")
    logger.info("Falling back to CPU...")
    model = WhisperModel("base.en", device="cpu", compute_type="int8")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'service': 'faster-whisper-gpu',
        'model': 'base.en',
        'device': 'cuda' if model.device.type == 'cuda' else 'cpu'
    })

@app.route('/v1/audio/transcriptions', methods=['POST'])
def transcribe():
    try:
        if 'audio_file' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio_file']
        if audio_file.filename == '':
            return jsonify({'error': 'No audio file selected'}), 400
        
        # Save temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
            audio_file.save(tmp_file.name)
            
            # Transcribe with faster-whisper
            segments, info = model.transcribe(
                tmp_file.name,
                beam_size=int(request.form.get('beam_size', 5)),
                best_of=int(request.form.get('best_of', 5)),
                temperature=float(request.form.get('temperature', 0.0)),
                language=request.form.get('language', 'en')
            )
            
            # Extract text
            text = ' '.join([segment.text.strip() for segment in segments])
            
            # Clean up
            os.unlink(tmp_file.name)
            
            logger.info(f"Transcribed: {text[:50]}...")
            return jsonify({
                'text': text,
                'language': info.language,
                'duration': info.duration
            })
            
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def root():
    return jsonify({
        'service': '100% Free GPU Faster-Whisper',
        'model': 'base.en',
        'endpoints': [
            'GET /health - Health check',
            'POST /v1/audio/transcriptions - Transcribe audio'
        ]
    })

if __name__ == '__main__':
    logger.info("Starting 100% Free Faster-Whisper GPU service on port 8000")
    app.run(host='0.0.0.0', port=8000, debug=False)