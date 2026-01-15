# TTS Provider Configuration

Configured via environment variables in `.env`

## Providers
- **Google Cloud TTS**: Service account JSON in `app/config/`
- **AWS Polly**: AWS credentials in `.env`
- **ElevenLabs**: API key in `.env`
- **Coqui TTS**: Local, no credentials needed
- **Chatterbox**: Local, voice sample in `app/config/`

## Environment Variables
```
TTS_PROVIDER=chatterbox|coqui|elevenlabs|google|aws
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
CHATTERBOX_VOICE_SAMPLE=...
```
