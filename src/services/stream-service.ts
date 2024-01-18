import EventEmitter from 'events'
import {v4} from 'uuid'
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

  buffer(index: number, audio: string) {
    // Escape hatch for intro message, which doesn't have an index
    if (index === null) {
      this.sendAudio(audio)
    } else if (index === this.expectedAudioIndex) {
      this.sendAudio(audio)
      this.expectedAudioIndex++

      while (this.audioBuffer.hasOwnProperty(this.expectedAudioIndex)) {
        const bufferedAudio = this.audioBuffer[this.expectedAudioIndex]
        this.sendAudio(bufferedAudio)
        this.expectedAudioIndex++
      }
    } else {
      this.audioBuffer[index] = audio
    }
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
    // When the media completes you will receive a `mark` message with the label
    const markLabel = v4()
    this.ws.send(
      JSON.stringify({
        streamSid: this.streamSid,
        event: 'mark',
        mark: {
          name: markLabel,
        },
      }),
    )
    this.emit('audiosent', markLabel)
  }
}