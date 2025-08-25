#!/usr/bin/env python3
"""
ChatterBox TTS API Server
Provides REST API endpoints for text-to-speech generation using ChatterBox TTS
"""

import os
import io
import base64
import tempfile
import logging
from typing import Optional
from pathlib import Path

from flask import Flask, request, jsonify, send_file
import torch
import torchaudio
from chatterbox.tts import ChatterboxTTS

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Global model instance
model: Optional[ChatterboxTTS] = None

def load_model():
    """Load the ChatterBox TTS model"""
    global model
    
    # Detect device
    if torch.cuda.is_available():
        device = "cuda"
        logger.info(f"CUDA available. Using GPU: {torch.cuda.get_device_name()}")
    elif torch.backends.mps.is_available():
        device = "mps"
        logger.info("Using MPS (Apple Silicon)")
    else:
        device = "cpu"
        logger.info("Using CPU")
    
    logger.info("Loading ChatterBox TTS model...")
    try:
        model = ChatterboxTTS.from_pretrained(device=device)
        logger.info(f"Model loaded successfully on {device}")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'cuda_available': torch.cuda.is_available(),
        'device_count': torch.cuda.device_count() if torch.cuda.is_available() else 0
    })

@app.route('/tts', methods=['POST'])
def text_to_speech():
    """
    Generate speech from text
    
    Request JSON:
    {
        "text": "Text to synthesize",
        "audio_prompt_path": "optional/path/to/reference/audio.wav",  
        "exaggeration": 0.5,
        "cfg_weight": 0.5,
        "temperature": 0.8,
        "repetition_penalty": 1.2,
        "min_p": 0.05,
        "top_p": 1.0,
        "format": "wav"  // "wav" or "base64"
    }
    """
    global model
    
    if model is None:
        return jsonify({'error': 'Model not loaded'}), 500
        
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({'error': 'Missing required field: text'}), 400
            
        text = data['text']
        if len(text) > 1000:  # Reasonable limit
            return jsonify({'error': 'Text too long (max 1000 characters)'}), 400
            
        # Extract parameters with defaults
        audio_prompt_path = data.get('audio_prompt_path')
        exaggeration = data.get('exaggeration', 0.5)
        cfg_weight = data.get('cfg_weight', 0.5)
        temperature = data.get('temperature', 0.8)
        repetition_penalty = data.get('repetition_penalty', 1.2)
        min_p = data.get('min_p', 0.05)
        top_p = data.get('top_p', 1.0)
        output_format = data.get('format', 'wav')
        
        logger.info(f"Generating TTS for text: {text[:50]}...")
        
        # Generate audio
        wav = model.generate(
            text=text,
            audio_prompt_path=audio_prompt_path,
            exaggeration=exaggeration,
            cfg_weight=cfg_weight,
            temperature=temperature,
            repetition_penalty=repetition_penalty,
            min_p=min_p,
            top_p=top_p
        )
        
        if output_format == 'base64':
            # Return base64 encoded audio
            buffer = io.BytesIO()
            torchaudio.save(buffer, wav, model.sr, format='wav')
            buffer.seek(0)
            audio_base64 = base64.b64encode(buffer.read()).decode('utf-8')
            
            return jsonify({
                'audio_base64': audio_base64,
                'sample_rate': model.sr,
                'format': 'wav'
            })
        else:
            # Return WAV file directly
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                torchaudio.save(tmp_file.name, wav, model.sr)
                return send_file(
                    tmp_file.name,
                    mimetype='audio/wav',
                    as_attachment=True,
                    download_name='generated_speech.wav'
                )
                
    except Exception as e:
        logger.error(f"TTS generation error: {e}")
        return jsonify({'error': f'Generation failed: {str(e)}'}), 500

@app.route('/tts/upload-reference', methods=['POST'])
def upload_reference_audio():
    """
    Upload reference audio for voice cloning
    
    Expects multipart form with 'audio' file field
    Returns the temporary file path for use in subsequent TTS requests
    """
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
            
        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
            
        # Save to temporary file
        temp_dir = Path('/tmp/chatterbox_refs')
        temp_dir.mkdir(exist_ok=True)
        
        temp_path = temp_dir / f"ref_{audio_file.filename}"
        audio_file.save(temp_path)
        
        return jsonify({
            'reference_path': str(temp_path),
            'message': 'Reference audio uploaded successfully'
        })
        
    except Exception as e:
        logger.error(f"Reference upload error: {e}")
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

@app.route('/info', methods=['GET'])
def model_info():
    """Get model information"""
    global model
    
    if model is None:
        return jsonify({'error': 'Model not loaded'}), 500
        
    return jsonify({
        'model_name': 'ChatterBox TTS',
        'sample_rate': model.sr,
        'device': model.device,
        'ready': True
    })

if __name__ == '__main__':
    # Load model on startup
    load_model()
    
    # Start Flask server
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)