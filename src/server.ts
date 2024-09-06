import express from 'express'
import expressWs from 'express-ws'
import {GptService} from './services/gpt-service'
import {StreamService} from './services/stream-service'
import {TranscriptionService} from './services/transcription-service'
import {TextToSpeechService} from './services/tts-service'
import bodyParser from 'body-parser'
import {TwilioService} from './services/twilio-service'
import {llm} from "./llm/llm";
import {Response,} from 'express'

require('dotenv').config()

const app = expressWs(express()).app
app.use(express.json())
app.use(bodyParser.urlencoded({extended: true}))
const port = process.env.PORT || 3000

const gptService = new GptService(llm)

/**
 * This endpoint listens to start event from the conference. Once the second participant joins the conference starts and
 * at this point we add ghost leg with translator speaker.
 */
app.post('/conference-status', (req, res) => {
    console.log('>>> conference status', req.body)
    const event: { ConferenceSid: string, StatusCallbackEvent: string } = req.body

    // Sanity check for event type
    if (event.StatusCallbackEvent === 'conference-start' && !!event.ConferenceSid) {
        TwilioService.addGhostCallParticipant(event.ConferenceSid)
    } else {
        console.log('>>> conference status: ignoring event', req.body)
    }

    res.status(200)
    res.end()
})

// TwiML endpoints

app.post('/incoming-a', (req, res) => {
    console.log('>>> incoming en', req.body)
    sendTwiML(TwilioService.participantTwiml('a'), res)
})

app.post('/incoming-b', (req, res) => {
    console.log('>>> incoming de', req.body)
    sendTwiML(TwilioService.participantTwiml('b'), res)
})

app.post('/incoming-ghost', (req, res) => {
    console.log('>>> incoming ghost', req.body)
    sendTwiML(TwilioService.ghostLegTwiml(), res)
})

app.ws('/connection-a', (ws, req) => {
    ws.on('error', console.error)
    // Filled in from start message
    let streamSid: string
    const streamService = new StreamService(ws)
    const transcriptionService = new TranscriptionService(process.env.DEEPGRAM_LANGUAGE_A!!)

    // Incoming from MediaStream
    ws.on('message', async (data) => {
        // @ts-ignore
        const msg = JSON.parse(data)
        if (msg.event === 'start') {
            console.log('>>> Start event', msg)
            streamSid = msg.start.streamSid
            streamService.setStreamSid(streamSid)
            console.log(`Starting Media Stream for ${streamSid}`)
        } else if (msg.event === 'media') {
            transcriptionService.send(msg.media.payload)
        } else if (msg.event === 'stop') {
            console.log('>>> Stop event')
            console.log(`Media stream ${streamSid} ended.`)
        }
    })

    transcriptionService.on('transcription', async (text) => {
        if (!text) return
        console.log(`STT -> GPT: ${text}`)
        gptService.translation(text, process.env.LANGUAGE_B!!)
    })
})

app.ws('/connection-b', (ws, req) => {
    ws.on('error', console.error)
    // Filled in from start message
    let streamSid: string
    const streamService = new StreamService(ws)
    const transcriptionService = new TranscriptionService(process.env.DEEPGRAM_LANGUAGE_B!!)

    // Incoming from MediaStream
    ws.on('message', async (data) => {
        // @ts-ignore
        const msg = JSON.parse(data)
        if (msg.event === 'start') {
            console.log('de>>> Start event', msg)
            streamSid = msg.start.streamSid
            streamService.setStreamSid(streamSid)
            console.log(`de>>> Starting Media Stream for ${streamSid}`)
        } else if (msg.event === 'media') {
            transcriptionService.send(msg.media.payload)
        } else if (msg.event === 'stop') {
            console.log('de>>> Stop event')
            console.log(`de>>> Media stream ${streamSid} ended.`)
        }
    })

    transcriptionService.on('transcription', async (text) => {
        if (!text) return
        console.log(`de>>> STT -> GPT: ${text}`)
        gptService.translation(text, process.env.LANGUAGE_A!!)
    })
})

app.ws('/connection-ghost', (ws, req) => {
    ws.on('ghost>>> error', console.error)
    // Filled in from start message
    let streamSid: string

    const streamService = new StreamService(ws)
    const ttsService = new TextToSpeechService()

    // Incoming from MediaStream
    ws.on('message', async (data) => {
        // @ts-ignore
        const msg = JSON.parse(data)
        if (msg.event === 'start') {
            console.log('ghost>>> Start event', msg)
            streamSid = msg.start.streamSid
            streamService.setStreamSid(streamSid)
            console.log(`ghost>>> Starting Media Stream for ${streamSid}`)
        } else if (msg.event === 'stop') {
            console.log('ghost>>> Stop event')
            console.log(`ghost>>> Media stream ${streamSid} ended.`)
        }
    })

    gptService.on('gptreply', async (gptReply) => {
        console.log(`ghost>>> GPT -> TTS: ${gptReply}`)
        ttsService.generate(gptReply)
    })

    ttsService.on('speech', (audio, label) => {
        console.log(`ghost>>> TTS -> TWILIO: ${label}`)
        streamService.buffer(audio)
    })

})

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`)
})

const sendTwiML = (twiml: string, res: Response) => {
    res.status(200)
    res.type('text/xml')
    res.end(twiml)
}