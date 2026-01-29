import { env } from "../lib/env"
import { db } from "../lib/db"
import { encryptToken, decryptToken } from "../lib/crypto"

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1"

const SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.settings.basic",
].join(" ")

interface GoogleTokenResponse {
    access_token: string
    refresh_token?: string
    expires_in: number
}

interface GmailSendAsResponse {
    sendAs: Array<{ sendAsEmail: string; isDefault?: boolean }>
}

export function getAuthorizationUrl(telegramId: string): string {
    const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        state: telegramId,
    })

    return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export async function exchangeCodeForTokens(
    code: string,
    userId: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: env.GOOGLE_REDIRECT_URI,
            grant_type: "authorization_code",
            code,
        }),
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Token exchange failed: ${error}`)
    }

    const data = (await response.json()) as GoogleTokenResponse
    if (!data.refresh_token) {
        throw new Error("Token exchange failed: no refresh token returned")
    }

    const expiresAt = new Date(Date.now() + data.expires_in * 1000)

    await db.oAuthToken.upsert({
        where: { userId },
        create: {
            userId,
            accessToken: encryptToken(data.access_token),
            refreshToken: encryptToken(data.refresh_token),
            expiresAt,
            sendAsEmails: [],
        },
        update: {
            accessToken: encryptToken(data.access_token),
            refreshToken: encryptToken(data.refresh_token),
            expiresAt,
        },
    })

    const sendAsEmails = await fetchSendAsAddresses(data.access_token)
    await db.oAuthToken.update({
        where: { userId },
        data: { sendAsEmails },
    })

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
    }
}

export async function refreshAccessToken(userId: string): Promise<string> {
    const token = await db.oAuthToken.findUnique({ where: { userId } })
    if (!token) {
        throw new Error("No OAuth token found for user")
    }

    if (token.expiresAt > new Date(Date.now() + 60000)) {
        return decryptToken(token.accessToken)
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: decryptToken(token.refreshToken),
        }),
    })

    if (!response.ok) {
        throw new Error("Failed to refresh access token")
    }

    const data = (await response.json()) as GoogleTokenResponse

    const expiresAt = new Date(Date.now() + data.expires_in * 1000)

    await db.oAuthToken.update({
        where: { userId },
        data: {
            accessToken: encryptToken(data.access_token),
            expiresAt,
        },
    })

    return data.access_token
}

async function fetchSendAsAddresses(accessToken: string): Promise<string[]> {
    const response = await fetch(
        `${GMAIL_API_URL}/users/me/settings/sendAs`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    )

    if (!response.ok) {
        console.error("Failed to fetch Send As addresses")
        return []
    }

    const data = (await response.json()) as GmailSendAsResponse

    return data.sendAs.map((sa) => sa.sendAsEmail)
}

export async function getSendAsEmails(userId: string): Promise<string[]> {
    const token = await db.oAuthToken.findUnique({ where: { userId } })
    return token?.sendAsEmails ?? []
}
