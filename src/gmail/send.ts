import { refreshAccessToken } from "./oauth"
import { downloadCV, getExtensionFromMimeType } from "../lib/storage"
import { normalizeFilename } from "../cv/normalize"
import { db } from "../lib/db"

const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1"

interface GmailSendResponse {
    id: string
}

export interface SendEmailParams {
    userId: string
    to: string
    subject: string
    body: string
    fromEmail: string
}

export async function sendEmailWithCV(params: SendEmailParams): Promise<string> {
    const { userId, to, subject, body, fromEmail } = params

    const user = await db.user.findUnique({
        where: { id: userId },
    })

    if (!user || !user.cvStorageKey || !user.cvMimeType) {
        throw new Error("User CV not found")
    }

    const cvBuffer = await downloadCV(user.cvStorageKey)
    const filename = normalizeFilename(
        user.firstName,
        user.lastName,
        user.cvMimeType
    )

    const accessToken = await refreshAccessToken(userId)

    const message = buildMimeMessage({
        from: fromEmail,
        to,
        subject,
        body,
        attachment: {
            filename,
            content: cvBuffer,
            mimeType: user.cvMimeType,
        },
    })

    const response = await fetch(`${GMAIL_API_URL}/users/me/messages/send`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            raw: base64UrlEncode(message),
        }),
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to send email: ${error}`)
    }

    const result = (await response.json()) as GmailSendResponse
    return result.id
}

interface MimeParams {
    from: string
    to: string
    subject: string
    body: string
    attachment: {
        filename: string
        content: Buffer
        mimeType: string
    }
}

function buildMimeMessage(params: MimeParams): string {
    const { from, to, subject, body, attachment } = params
    const boundary = `boundary_${crypto.randomUUID()}`

    const headers = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ].join("\r\n")

    const textPart = [
        `--${boundary}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        body,
    ].join("\r\n")

    const attachmentBase64 = attachment.content.toString("base64")
    const attachmentPart = [
        `--${boundary}`,
        `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        attachmentBase64,
    ].join("\r\n")

    const ending = `--${boundary}--`

    return [headers, "", textPart, attachmentPart, ending].join("\r\n")
}

function base64UrlEncode(str: string): string {
    return Buffer.from(str)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")
}
