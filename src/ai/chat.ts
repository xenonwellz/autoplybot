import { generateText, type ModelMessage, type StaticToolResult, stepCountIs } from "ai"
import { db } from "../lib/db"
import { getModel } from "./client"
import { tools, type GenerateEmailInput, type GenerateEmailOutput } from "./tools"
import { stripMarkdown, formatTimestamp } from "../utils/text"

const SYSTEM_PROMPT = `You are a professional job application assistant. Your role is to help users apply for jobs by generating tailored application emails.

STRICT RULES:
1. You MUST use the generate_email tool when asked to create a job application
2. You NEVER generate markdown - all output must be plain text
3. You MUST refuse to generate job applications if the user has not uploaded a CV
4. You ground all content strictly in the user's actual experience from their CV
5. You NEVER invent or exaggerate skills or experience
6. You are helpful but concise

When a user shares a job description:
1. Confirm you have their CV on file
2. Ask for the recipient email if not provided
3. Use the generate_email tool to create the application
4. Present the preview and ask for confirmation before sending`

export interface ChatToolCall {
    name: string
    args: GenerateEmailInput
    result: GenerateEmailOutput
}

export async function chat(
    userId: string,
    userMessage: string,
    cvText: string | null
): Promise<{
    response: string
    toolCalls?: ChatToolCall[]
}> {
    const history = await getMessageHistory(userId)

    await saveMessage(userId, "user", userMessage)

    const messages: ModelMessage[] = history.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
    }))

    messages.push({
        role: "user",
        content: userMessage,
    })

    const systemContent = cvText
        ? `${SYSTEM_PROMPT}\n\nUser's CV content:\n${cvText}`
        : `${SYSTEM_PROMPT}\n\nNOTE: The user has NOT uploaded a CV yet. Remind them to upload their CV before applying for jobs.`

    const result = await generateText({
        model: getModel(),
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
