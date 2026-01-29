import { generateText, type ModelMessage, type StaticToolResult, stepCountIs } from "ai"
import { db } from "../lib/db"
import { getHeavyModel } from "./client"
import { routeMessage, type RouterIntent } from "./router"
import { tools, type GenerateEmailInput, type GenerateEmailOutput } from "./tools"
import { stripMarkdown, formatTimestamp } from "../utils/text"

const GENERATION_SYSTEM_PROMPT = `You are a professional job application assistant. Your role is to generate tailored application emails.

STRICT RULES:
1. You MUST use the generate_email tool to create job applications
2. You NEVER generate markdown - all output must be plain text
3. You ground all content strictly in the user's actual experience from their CV
4. You NEVER invent or exaggerate skills or experience
5. After generating, present a brief summary and wait for confirmation

When generating an email:
1. Analyze the job requirements against the CV
2. Use the generate_email tool with all relevant details
3. Present the preview and ask for confirmation before sending`

export interface ChatToolCall {
    name: string
    args: GenerateEmailInput
    result: GenerateEmailOutput
}

export interface ChatResult {
    response: string
    toolCalls?: ChatToolCall[]
    routedBy: "light" | "heavy"
}

export async function chat(
    userId: string,
    userMessage: string,
    cvText: string | null
): Promise<ChatResult> {
    const history = await getMessageHistory(userId)

    await saveMessage(userId, "user", userMessage)

    const modelMessages: ModelMessage[] = history.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
    }))

    const routerResult = await routeMessage(userMessage, cvText, modelMessages)

    if (routerResult.type === "conversation") {
        await saveMessage(userId, "assistant", routerResult.response)
        return {
            response: routerResult.response,
            routedBy: "light",
        }
    }

    return await generateJobApplication(
        userId,
        routerResult,
        cvText!,
        modelMessages
    )
}

async function generateJobApplication(
    userId: string,
    intent: Extract<RouterIntent, { type: "job_application" }>,
    cvText: string,
    history: ModelMessage[]
): Promise<ChatResult> {
    const systemContent = `${GENERATION_SYSTEM_PROMPT}\n\nUser's CV content:\n${cvText}`

    const applicationPrompt = intent.recipientEmail
        ? `Generate a job application email for this position. Send to: ${intent.recipientEmail}\n\nJob Description:\n${intent.jobDescription}`
        : `Generate a job application email for this position. Ask the user for the recipient email after generating.\n\nJob Description:\n${intent.jobDescription}`

    const messages: ModelMessage[] = [
        ...history,
        { role: "user", content: applicationPrompt },
    ]

    const result = await generateText({
        model: getHeavyModel(),
        system: systemContent,
        messages,
        tools,
        stopWhen: stepCountIs(5),
    })

    const responseText = stripMarkdown(result.text)
    await saveMessage(userId, "assistant", responseText)

    type ToolsType = typeof tools
    type GenerateEmailToolResult = StaticToolResult<ToolsType> & { toolName: "generate_email" }

    const toolCalls: ChatToolCall[] = result.steps
        .flatMap((step) => step.toolResults ?? [])
        .filter((tr): tr is GenerateEmailToolResult => tr.toolName === "generate_email")
        .map((tr) => ({
            name: tr.toolName,
            args: tr.input,
            result: tr.output,
        }))

    return {
        response: responseText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        routedBy: "heavy",
    }
}

async function getMessageHistory(userId: string) {
    const messages = await db.message.findMany({
        where: { userId },
        orderBy: { timestamp: "desc" },
        take: 20,
    })

    return messages.reverse().map((msg) => ({
        role: msg.role,
        content: `[${formatTimestamp(msg.timestamp)}] ${stripMarkdown(msg.content)}`,
    }))
}

async function saveMessage(userId: string, role: string, content: string) {
    await db.message.create({
        data: {
            userId,
            role,
            content: stripMarkdown(content),
        },
    })
}
