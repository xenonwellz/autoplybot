import { generateText } from "ai"
import { getLightModel } from "./client"
import { stripMarkdown } from "../utils/text"

export type RouterIntent =
    | { type: "conversation"; response: string }
    | { type: "job_application"; jobDescription: string; recipientEmail?: string }

const ROUTER_SYSTEM_PROMPT = `You are a helpful assistant for a job application bot. Your job is to:
1. Handle greetings and chit-chat naturally
2. Answer questions about the user's CV if provided
3. Detect when a user wants to apply for a job

IMPORTANT: You must respond in a specific JSON format based on the user's intent.

If the user is sharing a JOB DESCRIPTION or asking you to apply for a job:
{"intent": "job_application", "jobDescription": "<the job description>", "recipientEmail": "<email if mentioned, otherwise null>"}

For ALL other messages (greetings, questions about CV, general chat):
{"intent": "conversation", "response": "<your helpful response>"}

RULES:
- Be concise and friendly
- When asked about the CV, reference specific details from it
- NEVER generate markdown - use plain text only
- Only classify as "job_application" if the user explicitly shares a job posting or asks to apply
- If user asks general questions like "what jobs can I apply for?", that's a conversation, not an application`

interface HistoryMessage {
    role: string
    content: string
}

export async function routeMessage(
    userMessage: string,
    cvText: string | null,
    messageHistory: HistoryMessage[]
): Promise<RouterIntent> {
    const cvContext = cvText
        ? `\n\nUser's CV content:\n${cvText}`
        : `\n\nNOTE: The user has NOT uploaded a CV yet. If they ask about their CV or try to apply, remind them to upload it first.`

    const historyText = messageHistory.length > 0
        ? messageHistory.map((m) => `${m.role}: ${m.content}`).join("\n")
        : ""

    const fullPrompt = `${ROUTER_SYSTEM_PROMPT}${cvContext}

${historyText ? `Previous conversation:\n${historyText}\n\n` : ""}User message: ${userMessage}

Respond with the appropriate JSON format:`

    try {
        const result = await generateText({
            model: getLightModel(),
            prompt: fullPrompt,
        })

        const text = result.text?.trim()

        if (!text) {
            console.log("Router returned empty response")
            return {
                type: "conversation",
                response: "I'm here to help! Could you please tell me more about what you need?",
            }
        }

        console.log("Router response:", text)

        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/)
            if (!jsonMatch) {
                return {
                    type: "conversation",
                    response: stripMarkdown(text),
                }
            }

            const parsed = JSON.parse(jsonMatch[0])

            if (parsed.intent === "job_application" && parsed.jobDescription) {
                return {
                    type: "job_application",
                    jobDescription: parsed.jobDescription,
                    recipientEmail: parsed.recipientEmail || undefined,
                }
            }

            return {
                type: "conversation",
                response: stripMarkdown(parsed.response || text),
            }
        } catch {
            return {
                type: "conversation",
                response: stripMarkdown(text),
            }
        }
    } catch (error) {
        console.error("Router error:", error)
        return {
            type: "conversation",
            response: "I'm sorry, I encountered an issue. Could you please try again?",
        }
    }
}
