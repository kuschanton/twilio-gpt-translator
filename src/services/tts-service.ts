import fetch from 'node-fetch'
import EventEmitter from 'events'

export class TextToSpeechService extends EventEmitter {
  private config: {
    voiceId: string
  }

  constructor() {
    super()
    this.config = {
      voiceId: process.env.VOICE_ID!!,
    }
  }

  async generate(gptReply: string) {

    try {
      const outputFormat = 'ulaw_8000'
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.config.voiceId}/stream?output_format=${outputFormat}&optimize_streaming_latency=3`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.XI_API_KEY!!,
            'Content-Type': 'application/json',
            accept: 'audio/wav',
          },
          // TODO: Pull more config? https://docs.elevenlabs.io/api-reference/text-to-speech-stream
          body: JSON.stringify({
            model_id: process.env.XI_MODEL_ID,
            text: gptReply,
            voice_settings: {'similarity_boost': 1, 'stability': 1},
          }),
        },
      )
      const audioArrayBuffer = await response.arrayBuffer()
      this.emit('speech', Buffer.from(audioArrayBuffer).toString('base64'), gptReply)
    } catch (err) {
      console.error('Error occurred in TextToSpeech service')
      console.error(err)
    }
  }
}
