import {Twilio} from 'twilio'
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";

require('dotenv').config()

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const fromNumber = process.env.FROM_NUMBER
const client = new Twilio(accountSid, authToken)


export const TwilioService = {
    addGhostCallParticipant: (conferenceSid: string) => {
        client.conferences(conferenceSid)
            .participants
            .create({
                from: '+16307030027',
                to: '+18665613032',
            })
            .then(participant => console.log('Successfully added ghost leg participant:', participant.callSid))
            .catch(err => console.error('Error adding participant', err))
    },
    participantTwiml: (language: string): string => {
        const response = new VoiceResponse();

        // Stream
        const start = response.start();
        start.stream({
            name: `participant-stream-unidirectional-${language}`,
            url: `wss://${process.env.SERVER}/connection-${language}`,
        });

        // Conference
        const dial = response.dial()
        dial.conference({
            endConferenceOnExit: true,
            statusCallbackEvent: ['start'],
            statusCallback: `https://${process.env.SERVER}/conference-status`,
            record: 'record-from-start'
        }, 'room1');

        return response.toString()
    },
    ghostLegTwiml: (): string => {
        const response = new VoiceResponse();

        // Stream
        const connect = response.connect();
        connect.stream({
            name: `ghost-leg-stream-bidirectional`,
            url: `wss://${process.env.SERVER}/connection-ghost`,
        });

        return response.toString()
    }
}
