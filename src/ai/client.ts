import { createOpenAI } from "@ai-sdk/openai"
import { env } from "../lib/env"

export const openrouter = createOpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
})

export function getModel() {
    return openrouter(env.OPENROUTER_MODEL)
}
