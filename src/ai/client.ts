import { createOpenAI } from "@ai-sdk/openai"
import { env } from "../lib/env"

export const openrouter = createOpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
})

export function getLightModel() {
    return openrouter(env.OPENROUTER_LIGHT_MODEL)
}

export function getHeavyModel() {
    return openrouter(env.OPENROUTER_HEAVY_MODEL)
}
