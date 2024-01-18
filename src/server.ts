import express from 'express'
import expressWs from 'express-ws'
import {GptService} from './services/gpt-service'
import {StreamService} from './services/stream-service'
import {TranscriptionService} from './services/transcription-service'
import {TextToSpeechService} from './services/tts-service'
import {WebSocket} from 'ws'

require('dotenv').config()

const app = expressWs(express()).app
const port = process.env.PORT || 3000

app.post('/incoming', (_, res) => {
  res.status(200)
  res.type('text/xml')
  res.end(twiml)
})

app.get('/', (req, res) => {
  res.send('Hello World!')
})
app.ws('/connection', (ws, req) => {
  ws.on('error', console.error)
  // Filled in from start message
  let streamSid: string

  const gptService = new GptService()
  const streamService = new StreamService(ws)
  const transcriptionService = new TranscriptionService()
  const ttsService = new TextToSpeechService()

  let marks: any[] = []
  let interactionCount = 0

  // Incoming from MediaStream
  ws.on('message', (data) => {
    // @ts-ignore
    const msg = JSON.parse(data)
    if (msg.event === 'start') {
      console.log('>>> Start event')
      streamSid = msg.start.streamSid
      streamService.setStreamSid(streamSid)
      console.log(`Starting Media Stream for ${streamSid}`)
      ttsService.generate({
        partialResponseIndex: null,
        partialResponse: 'Hello! I understand you\'re looking for a pair of AirPods, is that correct?',
      }, 1)
    } else if (msg.event === 'media') {
      transcriptionService.send(msg.media.payload)
    } else if (msg.event === 'mark') {
      console.log('>>> Mark event')
      const label = msg.mark.name
      console.log(`Media completed mark (${msg.sequenceNumber}): ${label}`)
      marks = marks.filter(m => m !== msg.mark.name)
    } else if (msg.event === 'stop') {
      console.log('>>> Stop event')
      console.log(`Media stream ${streamSid} ended.`)
    }
  })

  transcriptionService.on('utterance', async (text) => {
    // This is a bit of a hack to filter out empty utterances
    if (marks.length > 0 && text?.length > 5) {
      console.log('Interruption, Clearing stream')
      ws.send(
        JSON.stringify({
          streamSid,
          event: 'clear',
        }),
      )
    }
  })

  transcriptionService.on('transcription', async (text) => {
    if (!text) return
    console.log(`Interaction ${interactionCount} – STT -> GPT: ${text}`)
    gptService.completion(text, interactionCount)
    interactionCount += 1
  })

  gptService.on('gptreply', async (gptReply, icount) => {
    console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`)
    ttsService.generate(gptReply, icount)
  })

  ttsService.on('speech', (responseIndex, audio, label, icount) => {
    console.log(`Interaction ${icount}: TTS -> TWILIO: ${label}`)

    streamService.buffer(responseIndex, audio)
  })

  streamService.on('audiosent', (markLabel) => {
    marks.push(markLabel)
  })
})

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`)
})

const twiml = `
  <Response>
    <Connect>
      <Stream url="wss://${process.env.SERVER}/connection" />
    </Connect>
  </Response>
  `