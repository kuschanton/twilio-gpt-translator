import EventEmitter from 'events'
import OpenAI from 'openai'
import {
  ChatCompletionFunctionMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionRole,
  ChatCompletionTool,
  ChatCompletionUserMessageParam,
} from 'openai/resources'

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'check_inventory',
      description: 'Check the inventory of airpods, airpods pro or airpods max.',
      parameters: {
        type: 'object',
        properties: {
          model: {
            type: 'string',
            'enum': ['airpods', 'airpods pro', 'airpods max'],
            description: 'The model of airpods, either the airpods, airpods pro or airpods max',
          },
        },
        required: ['model'],
      },
      // returns: {
      //   type: 'object',
      //   properties: {
      //     stock: {
      //       type: 'integer',
      //       description: 'An integer containing how many of the model are in currently in stock.',
      //     },
      //   },
      // },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_price',
      description: 'Check the price of given model of airpods, airpods pro or airpods max.',
      parameters: {
        type: 'object',
        properties: {
          model: {
            type: 'string',
            'enum': ['airpods', 'airpods pro', 'airpods max'],
            description: 'The model of airpods, either the airpods, airpods pro or airpods max',
          },
        },
        required: ['model'],
      },
      // returns: {
      //   type: 'object',
      //   properties: {
      //     price: {
      //       type: 'integer',
      //       description: 'the price of the model',
      //     },
      //   },
      // },
    },
  },
  {
    type: 'function',
    function: {
      name: 'place_order',
      description: 'Places an order for a set of airpods.',
      parameters: {
        type: 'object',
        properties: {
          model: {
            type: 'string',
            'enum': ['airpods', 'airpods pro'],
            description: 'The model of airpods, either the regular or pro',
          },
          quantity: {
            type: 'integer',
            description: 'The number of airpods they want to order',
          },
        },
        required: ['type', 'quantity'],
      },
      // returns: {
      //   type: 'object',
      //   properties: {
      //     price: {
      //       type: 'integer',
      //       description: 'The total price of the order',
      //     },
      //     orderNumber: {
      //       type: 'integer',
      //       description: 'The order number associated with the order.',
      //     },
      //   },
      // },
    },
  },
]


function check_inventory(model: string) {
  console.log('GPT -> called check_inventory')
  if (model?.toLowerCase().includes('pro')) {
    return JSON.stringify({stock: 10})
  } else if (model?.toLowerCase().includes('max')) {
    return JSON.stringify({stock: 0})
  } else {
    return JSON.stringify({stock: 100})
  }
}

function check_price(model: string) {
  console.log('GPT -> called check_price')
  if (model?.toLowerCase().includes('pro')) {
    return JSON.stringify({price: 249})
  } else if (model?.toLowerCase().includes('max')) {
    return JSON.stringify({price: 549})
  } else {
    return JSON.stringify({price: 149})
  }
}

function place_order(model: string, quantity: number) {
  console.log('GPT -> called place_order')

  // generate a random order number that is 7 digits
  let orderNum = Math.floor(Math.random() * (9999999 - 1000000 + 1) + 1000000)

  // check model and return the order number and price with 7.9% sales tax
  if (model?.toLowerCase().includes('pro')) {
    return JSON.stringify({orderNumber: orderNum, price: Math.floor(quantity * 249 * 1.79)})
  } else if (model?.toLowerCase().includes('max')) {
    return JSON.stringify({orderNumber: orderNum, price: Math.floor(quantity * 549 * 1.79)})
  }
  return JSON.stringify({orderNumber: orderNum, price: Math.floor(quantity * 179 * 1.79)})
}

export class GptService extends EventEmitter {
  private openai: OpenAI
  private userContext: ChatCompletionMessageParam[]
  private partialResponseIndex: number


  constructor() {
    super()
    this.openai = new OpenAI()
    this.userContext = [
      {
        'role': 'system',
        'content': `You are an outbound sales representative selling Apple Airpods.
        You have a youthful and cheery personality.
        Keep your responses as brief as possible but make every attempt to keep the caller on the phone without being rude.
        Don\'t ask more than 1 question at a time.
        Don\'t make assumptions about what values to plug into functions.
        Ask for clarification if a user request is ambiguous.
        Speak out all prices to include the currency.
        Please help them decide between the airpods, airpods pro and airpods max by asking questions like \'Do you prefer headphones that go in your ear or over the ear?\'.
        If they are trying to choose between the airpods and airpods pro try asking them if they need noise canceling.
        Once you know which model they would like ask them how many they would like to purchase and try to get them to place an order.
        Add a \'•\' symbol every 5 to 10 words at natural pauses where your response can be split for text to speech.`,
      },
      {'role': 'assistant', 'content': 'Hello! I understand you\'re looking for a pair of AirPods, is that correct?'},
    ],
      this.partialResponseIndex = 0
  }

  async completion(text: string, interactionCount: number, role: ChatCompletionRole = 'user', name = 'user') {
    if (name != 'user') {
      let message: ChatCompletionFunctionMessageParam = {role: 'function', name: name, content: text}
      this.userContext.push(message)
    } else {
      let message: ChatCompletionUserMessageParam = {role: 'user', content: text}
      this.userContext.push(message)
    }

    const availableFunctions: any = {
      'check_inventory': check_inventory,
      'check_price': check_price,
      'place_order': place_order,
    }

    // Step 1: Send user transcription to Chat GPT
    const stream = await this.openai.chat.completions.create({
      // model: "gpt-4-1106-preview",
      model: 'gpt-4',
      messages: this.userContext,
      tools: tools,
      stream: true,
    })

    let completeResponse = ''
    let partialResponse = ''
    let functionName = ''
    let functionArgs: any = {}
    let finishReason: string | null = ''

    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || ''
      let deltas = chunk.choices[0].delta

      // Step 2: check if GPT wanted to call a function
      if (deltas.tool_calls) {

        // Step 3: call the function
        let name = deltas.tool_calls[0]?.function?.name || ''
        if (name != '') {
          functionName = name
        }
        let args = deltas.tool_calls[0]?.function?.arguments || ''
        if (args != '') {
          // args are streamed as JSON string so we need to concatenate all chunks
          functionArgs += args
        }
      }
      // check to see if it is finished
      finishReason = chunk.choices[0].finish_reason

      // need to call function on behalf of Chat GPT with the arguments it parsed from the conversation
      if (finishReason === 'tool_calls') {
        // parse JSON string of args into JSON object
        try {
          functionArgs = JSON.parse(functionArgs)
        } catch (error) {
          // was seeing an error where sometimes we have two sets of args
          if (functionArgs.indexOf('{') != functionArgs.lastIndexOf('{'))
            functionArgs = JSON.parse(functionArgs.substring(functionArgs.indexOf(''), functionArgs.indexOf('}') + 1))
        }

        const functionToCall = availableFunctions[functionName]
        let functionResponse = null
        // execute the correct function with the correct arguments
        if (functionName === 'check_inventory' || functionName === 'check_price') {
          functionResponse = functionToCall(
            functionArgs.model,
          )
        } else if (functionName === 'place_order') {
          functionResponse = functionToCall(
            functionArgs.model,
            functionArgs.quantity,
          )
        }

        // Step 4: send the info on the function call and function response to GPT
        this.userContext.push({
          role: 'function',
          name: functionName,
          content: functionResponse,
        })
        // extend conversation with function response

        // call the completion function again but pass in the function response to have OpenAI generate a new assistant response
        await this.completion(functionResponse, interactionCount, 'function', functionName)
      } else {
        // We use completeResponse for userContext
        completeResponse += content
        // We use partialResponse to provide a chunk for TTS
        partialResponse += content
        // Emit last partial response and add complete response to userContext
        if (content.trim().slice(-1) === '•' || finishReason === 'stop') {
          const gptReply: { partialResponse: string; partialResponseIndex: number } = {
            partialResponseIndex: this.partialResponseIndex,
            partialResponse,
          }

          this.emit('gptreply', gptReply, interactionCount)
          this.partialResponseIndex++
          partialResponse = ''
        }
      }
    }
    this.userContext.push({'role': 'assistant', 'content': completeResponse})
    console.log(`User context length: ${this.userContext.length}`)
    // console.log(this.userContext);
  }
}