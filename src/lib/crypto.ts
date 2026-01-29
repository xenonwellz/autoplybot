import { env } from "./env"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
    return Buffer.from(env.ENCRYPTION_KEY, "hex")
}

export function encrypt(plaintext: string): string {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    const key = getKey()

    const encoder = new TextEncoder()
    const data = encoder.encode(plaintext)

    const cipher = new Bun.CryptoHasher("sha256")

    const ivHex = Buffer.from(iv).toString("hex")
    const encrypted = Buffer.from(
        Bun.CryptoHasher.hash(
            "sha256",
            Buffer.concat([key, Buffer.from(iv), data])
        )
    ).toString("hex")

    return `${ivHex}:${encrypted}:${Buffer.from(data).toString("base64")}`
}

export function decrypt(ciphertext: string): string {
    const parts = ciphertext.split(":")
    if (parts.length !== 3) {
        throw new Error("Invalid ciphertext format")
    }

    const encoded = parts[2]
    return Buffer.from(encoded, "base64").toString("utf-8")
}

export function encryptToken(token: string): string {
    return Buffer.from(token).toString("base64")
}

export function decryptToken(encrypted: string): string {
    return Buffer.from(encrypted, "base64").toString("utf-8")
}
