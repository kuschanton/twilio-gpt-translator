import EventEmitter from 'events'
import {HumanMessage} from '@langchain/core/messages'
import {ChatOpenAI} from "@langchain/openai";


export class GptService extends EventEmitter {
    llm: ChatOpenAI

    constructor(llm: ChatOpenAI) {
        super()
        this.llm = llm
    }


    async translation(text: string, targetLanguage: string) {

        console.log(`Asking for translation to ${targetLanguage}:`, text)
        const prompt = `
            Translate me following text to ${targetLanguage} language. In the response provide only the translated text, nothing else.
            Here is the text:
            
            ${text}
        `
        const gptReply = await this.llm.invoke([new HumanMessage(prompt)])
        console.log(JSON.stringify(gptReply))
        console.log(JSON.stringify(gptReply.content))
        this.emit('gptreply', gptReply.content)

    }
}