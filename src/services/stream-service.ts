import EventEmitter from 'events'
import {WebSocket} from 'ws'

export class StreamService extends EventEmitter {

  ws: WebSocket
  expectedAudioIndex: number
  audioBuffer: any
  streamSid: string


  constructor(websocket: WebSocket) {
    super()
    this.ws = websocket
    this.expectedAudioIndex = 0
    this.audioBuffer = {}
    this.streamSid = ''
  }

  setStreamSid(streamSid: string) {
    this.streamSid = streamSid
  }

  buffer(audio: string) {
      console.log('Stream Service>>> sending audio')
      this.sendAudio(audio)
  }

  sendAudio(audio: string) {
    this.ws.send(
      JSON.stringify({
        streamSid: this.streamSid,
        event: 'media',
        media: {
          payload: audio,
        },
      }),
    )
  }
}