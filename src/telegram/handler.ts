import { db } from "../lib/db"
import { uploadCV, downloadCV } from "../lib/storage"
import { extractCVText } from "../cv/extract"
import { getAuthorizationUrl, getSendAsEmails } from "../gmail/oauth"
import { sendEmailWithCV } from "../gmail/send"
import { chat } from "../ai/chat"

const TELEGRAM_API = "https://api.telegram.org/bot"

interface TelegramUpdate {
    update_id: number
    message?: TelegramMessage
    callback_query?: CallbackQuery
}

interface TelegramMessage {
    message_id: number
    from?: TelegramUser
    chat: { id: number }
    text?: string
    document?: TelegramDocument
}

interface TelegramUser {
    id: number
    first_name?: string
    last_name?: string
}

interface TelegramDocument {
    file_id: string
    file_name?: string
    mime_type?: string
}

interface CallbackQuery {
    id: string
    from: TelegramUser
    message?: TelegramMessage
    data?: string
}

interface TelegramFileResponse {
    ok: boolean
    result?: { file_path: string }
}

interface PendingEmail {
    subject: string
    body: string
    recipientEmail: string
}

const pendingEmails = new Map<string, PendingEmail>()

export async function handleUpdate(
    update: TelegramUpdate,
    botToken: string
): Promise<void> {
    if (update.callback_query) {
        await handleCallback(update.callback_query, botToken)
        return
    }

    if (!update.message) return

    const message = update.message
    const chatId = message.chat.id
    const telegramId = message.from?.id?.toString()

    if (!telegramId) return

    const user = await getOrCreateUser(
        telegramId,
        message.from?.first_name,
        message.from?.last_name
    )

    if (message.document) {
        await handleDocument(message.document, user.id, chatId, botToken)
        return
    }

    if (message.text) {
        await handleText(message.text, user.id, chatId, botToken)
    }
}

async function handleText(
    text: string,
    userId: string,
    chatId: number,
    botToken: string
): Promise<void> {
    const command = text.toLowerCase().trim()

    if (command === "/start") {
        await sendMessage(
            chatId,
            `Welcome to Autoply Bot!

I help you apply for jobs by generating professional application emails.

To get started:
1. Upload your CV (PDF or DOC)
2. Connect your Gmail with /connect
3. Share a job description and I'll draft an email

Commands:
/cv - Check CV status
/connect - Connect Gmail account
/history - View sent applications`,
            botToken
        )
        return
    }

    if (command === "/cv") {
        const user = await db.user.findUnique({ where: { id: userId } })
        if (user?.cvStorageKey) {
            await sendMessage(chatId, "Your CV is on file. Send a new one to replace it.", botToken)
        } else {
            await sendMessage(chatId, "No CV uploaded yet. Please send your CV as a PDF or DOC file.", botToken)
        }
        return
    }

    if (command === "/connect") {
        const user = await db.user.findUnique({
            where: { id: userId },
            include: { oauthTokens: true },
        })

        if (user?.oauthTokens) {
            const emails = user.oauthTokens.sendAsEmails
            if (emails.length > 0) {
                await sendMessage(
                    chatId,
                    `Gmail connected! Available sender emails:\n${emails.join("\n")}\n\nDefault: ${user.selectedEmail || emails[0]}`,
                    botToken
                )
            } else {
                await sendMessage(chatId, "Gmail connected but no sender addresses found.", botToken)
            }
            return
        }

        const authUrl = getAuthorizationUrl(user?.telegramId || userId)
        await sendMessage(
            chatId,
            `Please connect your Gmail account:\n\n${authUrl}`,
            botToken
        )
        return
    }

    if (command === "/history") {
        const apps = await db.application.findMany({
            where: { userId },
            orderBy: { sentAt: "desc" },
            take: 5,
        })

        if (apps.length === 0) {
            await sendMessage(chatId, "No applications sent yet.", botToken)
            return
        }

        const history = apps
            .map(
                (app, i) =>
                    `${i + 1}. ${app.jobSummary}\n   Sent: ${app.sentAt.toISOString().split("T")[0]}`
            )
            .join("\n\n")

        await sendMessage(chatId, `Recent applications:\n\n${history}`, botToken)
        return
    }

    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user?.cvStorageKey) {
        await sendMessage(
            chatId,
            "Please upload your CV first before I can help with job applications.",
            botToken
        )
        return
    }

    const cvBuffer = await downloadCV(user.cvStorageKey)
    const cvText = await extractCVText(cvBuffer, user.cvMimeType!)

    const result = await chat(userId, text, cvText)

    if (result.toolCalls?.length) {
        const emailTool = result.toolCalls.find((tc) => tc.name === "generate_email")
        if (emailTool) {
            const { result: toolResult, args } = emailTool

            pendingEmails.set(userId, {
                subject: toolResult.subject,
                body: toolResult.body,
                recipientEmail: args.recipientEmail,
            })

            const preview = `--- EMAIL PREVIEW ---

To: ${args.recipientEmail}
Subject: ${toolResult.subject}

${toolResult.body}

--- END PREVIEW ---

Your CV will be attached automatically.`

            await sendMessageWithConfirmation(chatId, preview, userId, botToken)
            return
        }
    }

    await sendMessage(chatId, result.response, botToken)
}

async function handleDocument(
    doc: TelegramDocument,
    userId: string,
    chatId: number,
    botToken: string
): Promise<void> {
    const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]

    if (!doc.mime_type || !allowedTypes.includes(doc.mime_type)) {
        await sendMessage(
            chatId,
            "Please upload a PDF or DOC file.",
            botToken
        )
        return
    }

    const fileResponse = await fetch(
        `${TELEGRAM_API}${botToken}/getFile?file_id=${doc.file_id}`
    )
    const fileData = (await fileResponse.json()) as TelegramFileResponse

    if (!fileData.ok || !fileData.result) {
        await sendMessage(chatId, "Failed to download file.", botToken)
        return
    }

    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`
    const fileBuffer = await fetch(downloadUrl).then((r) => r.arrayBuffer())

    const storageKey = await uploadCV(Buffer.from(fileBuffer), doc.mime_type)

    await db.user.update({
        where: { id: userId },
        data: {
            cvStorageKey: storageKey,
            cvMimeType: doc.mime_type,
        },
    })

    await sendMessage(
        chatId,
        "CV uploaded successfully! You can now share job descriptions and I'll help you apply.",
        botToken
    )
}

async function handleCallback(
    callback: CallbackQuery,
    botToken: string
): Promise<void> {
    const userId = callback.from.id.toString()
    const chatId = callback.message?.chat.id
    const data = callback.data

    if (!chatId || !data) return

    const user = await db.user.findUnique({
        where: { telegramId: userId },
    })

    if (!user) return

    await answerCallback(callback.id, botToken)

    if (data === "confirm_send") {
        const pending = pendingEmails.get(user.id)
        if (!pending) {
            await sendMessage(chatId, "No pending email to send.", botToken)
            return
        }

        const emails = await getSendAsEmails(user.id)
        const fromEmail = user.selectedEmail || emails[0]

        if (!fromEmail) {
            await sendMessage(
                chatId,
                "Please connect your Gmail first with /connect",
                botToken
            )
            return
        }

        try {
            await sendEmailWithCV({
                userId: user.id,
                to: pending.recipientEmail,
                subject: pending.subject,
                body: pending.body,
                fromEmail,
            })

            await db.application.create({
                data: {
                    userId: user.id,
                    jobSummary: pending.subject,
                    emailSubject: pending.subject,
                    emailBody: pending.body,
                    senderEmail: fromEmail,
                    cvStorageKey: user.cvStorageKey!,
                },
            })

            pendingEmails.delete(user.id)
            await sendMessage(chatId, "Email sent successfully!", botToken)
        } catch (error) {
            await sendMessage(
                chatId,
                `Failed to send email: ${error instanceof Error ? error.message : "Unknown error"}`,
                botToken
            )
        }
    } else if (data === "cancel_send") {
        pendingEmails.delete(user.id)
        await sendMessage(chatId, "Email cancelled.", botToken)
    }
}

async function getOrCreateUser(
    telegramId: string,
    firstName?: string,
    lastName?: string
) {
    return db.user.upsert({
        where: { telegramId },
        create: { telegramId, firstName, lastName },
        update: { firstName, lastName },
    })
}

async function sendMessage(
    chatId: number,
    text: string,
    botToken: string
): Promise<void> {
    await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text,
        }),
    })
}

async function sendMessageWithConfirmation(
    chatId: number,
    text: string,
    userId: string,
    botToken: string
): Promise<void> {
    await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "Send", callback_data: "confirm_send" },
                        { text: "Cancel", callback_data: "cancel_send" },
                    ],
                ],
            },
        }),
    })
}

async function answerCallback(
    callbackId: string,
    botToken: string
): Promise<void> {
    await fetch(`${TELEGRAM_API}${botToken}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackId }),
    })
}
