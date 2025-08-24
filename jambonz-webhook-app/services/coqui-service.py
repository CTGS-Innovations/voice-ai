#!/usr/bin/env python3
"""
100% Free GPU-accelerated Coqui TTS service
"""
import os
import io
import logging
import tempfile
from flask import Flask, request, jsonify, send_file
from TTS.api import TTS
import torch
import soundfile as sf

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize TTS model
logger.info("Loading Coqui TTS model...")
try:
    # Use GPU if available
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"Using device: {device}")
    
    # Load fast English model
    tts = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC", progress_bar=False).to(device)
    logger.info("✅ Coqui TTS model loaded successfully")
except Exception as e:
    logger.error(f"❌ Failed to load TTS model: {e}")
    tts = None

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy' if tts else 'unhealthy',
        'service': 'coqui-tts-gpu',
        'model': 'tacotron2-DDC',
        'device': 'cuda' if torch.cuda.is_available() else 'cpu'
    })

@app.route('/api/tts', methods=['POST'])
def synthesize():
    try:
        if not tts:
            return jsonify({'error': 'TTS model not loaded'}), 503
            
        data = request.get_json()
        text = data.get('text', '')
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        logger.info(f"Synthesizing: {text[:50]}...")
        
        # Generate audio
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
            tts.tts_to_file(text=text, file_path=tmp_file.name)
            
            # Read the generated file
            with open(tmp_file.name, 'rb') as f:
                audio_data = f.read()
            
            # Clean up
            os.unlink(tmp_file.name)
            
            # Return audio file
            return send_file(
                io.BytesIO(audio_data),
                mimetype='audio/wav',
                as_attachment=False
            )
            
    except Exception as e:
        logger.error(f"TTS synthesis error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def root():
    return jsonify({
        'service': '100% Free GPU Coqui TTS',
        'model': 'tacotron2-DDC',
        'endpoints': [
            'GET /health - Health check',
            'POST /api/tts - Synthesize speech (body: {text: "your text"})'
        ]
    })

if __name__ == '__main__':
    logger.info("Starting 100% Free Coqui TTS GPU service on port 5002")
    app.run(host='0.0.0.0', port=5002, debug=False)