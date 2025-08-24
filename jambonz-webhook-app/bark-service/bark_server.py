#!/usr/bin/env python3

import os
import io
import tempfile
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import numpy as np
from bark import SAMPLE_RATE, generate_audio, preload_models
import scipy.io.wavfile as wavfile
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configure Bark
os.environ["CUDA_VISIBLE_DEVICES"] = "0"
BARK_CACHE_DIR = os.environ.get("BARK_CACHE_DIR", "/models")
os.environ["XDG_CACHE_HOME"] = BARK_CACHE_DIR

# Preload models on startup
logger.info("Preloading Bark models...")
try:
    preload_models()
    logger.info("Bark models loaded successfully")
except Exception as e:
    logger.error(f"Error loading Bark models: {e}")

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'bark-tts-gpu',
        'cuda_available': str(os.environ.get('CUDA_VISIBLE_DEVICES', 'none'))
    })

@app.route('/api/generate', methods=['POST'])
def generate_speech():
    """Generate speech from text using Bark"""
    try:
        data = request.json
        text = data.get('text', '')
        voice_preset = data.get('voice_preset', 'v2/en_speaker_6')
        temperature = data.get('temperature', 0.75)
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        logger.info(f"Generating audio for text: {text[:50]}...")
        
        # Generate audio using Bark
        audio_array = generate_audio(
            text, 
            history_prompt=voice_preset,
            text_temp=temperature,
            waveform_temp=temperature
        )
        
        # Convert to 16-bit PCM
        audio_array = (audio_array * 32767).astype(np.int16)
        
        # Create WAV file in memory
        wav_buffer = io.BytesIO()
        wavfile.write(wav_buffer, SAMPLE_RATE, audio_array)
        wav_buffer.seek(0)
        
        logger.info("Audio generation completed successfully")
        
        return send_file(
            wav_buffer,
            mimetype='audio/wav',
            as_attachment=False
        )
        
    except Exception as e:
        logger.error(f"Error generating speech: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/voices', methods=['GET'])
def list_voices():
    """List available voice presets"""
    voices = [
        'v2/en_speaker_0', 'v2/en_speaker_1', 'v2/en_speaker_2',
        'v2/en_speaker_3', 'v2/en_speaker_4', 'v2/en_speaker_5',
        'v2/en_speaker_6', 'v2/en_speaker_7', 'v2/en_speaker_8',
        'v2/en_speaker_9'
    ]
    return jsonify({'voices': voices})

@app.route('/', methods=['GET'])
def root():
    """Root endpoint with service information"""
    return jsonify({
        'service': 'Bark TTS GPU Server',
        'version': '1.0.0',
        'endpoints': [
            'GET / - This information',
            'GET /health - Health check',
            'POST /api/generate - Generate speech (body: {text, voice_preset?, temperature?})',
            'GET /api/voices - List available voices'
        ]
    })

if __name__ == '__main__':
    logger.info("Starting Bark TTS GPU server on port 5003")
    app.run(host='0.0.0.0', port=5003, debug=False)