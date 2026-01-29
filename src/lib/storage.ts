import { env } from "./env"

const s3Client = new Bun.S3Client({
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
})

export async function uploadCV(
    fileBuffer: Buffer,
    mimeType: string
): Promise<string> {
    const key = crypto.randomUUID()

    const s3File = s3Client.file(key)
    await s3File.write(fileBuffer, { type: mimeType })

    return key
}

export async function downloadCV(key: string): Promise<Buffer> {
    const s3File = s3Client.file(key)
    const arrayBuffer = await s3File.arrayBuffer()
    return Buffer.from(arrayBuffer)
}

export async function deleteCV(key: string): Promise<void> {
    const s3File = s3Client.file(key)
    await s3File.delete()
}

export function getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
        "application/pdf": "pdf",
        "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            "docx",
    }
    return mimeToExt[mimeType] ?? "pdf"
}
