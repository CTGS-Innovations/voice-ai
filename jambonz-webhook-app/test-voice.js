require('dotenv').config();
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');

// Test ElevenLabs connection and voice availability
async function testElevenLabs() {
  try {
    const client = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY
    });

    console.log('Testing ElevenLabs connection...');
    console.log('API Key:', process.env.ELEVENLABS_API_KEY ? 'Set' : 'Not set');
    console.log('Voice ID:', process.env.ELEVENLABS_VOICE_ID);

    // Skip voice listing due to permission issue, test TTS directly
    console.log('\nTesting TTS conversion...');
    const targetVoiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    
    const audio = await client.textToSpeech.convert(targetVoiceId, {
      text: "Hi!",
      model_id: "eleven_monolingual_v1",
      output_format: "mp3_44100_128"
    });
    
    console.log('✓ TTS conversion successful! Audio generated.');
    console.log('Voice configuration is working correctly.');
    
  } catch (error) {
    console.error('ElevenLabs test failed:', error.message);
    console.error('Full error:', error);
  }
}

testElevenLabs();