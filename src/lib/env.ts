import { z } from "zod"

const envSchema = z.object({
    // Telegram
    TELEGRAM_BOT_TOKEN: z.string().min(1),

    // Database
    DATABASE_URL: z.string().url(),

    // S3 Storage
    S3_ENDPOINT: z.string().url(),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_REGION: z.string().default("auto"),

    // Gmail OAuth
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_REDIRECT_URI: z.string().url(),

    // AI
    OPENROUTER_API_KEY: z.string().min(1),
    OPENROUTER_LIGHT_MODEL: z.string().default("google/gemini-2.0-flash-lite"),
    OPENROUTER_HEAVY_MODEL: z.string().default("moonshotai/kimi-k2.5"),

    // Encryption
    ENCRYPTION_KEY: z.string().length(64),

    // Server
    PORT: z.coerce.number().default(3000),
})

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
    const result = envSchema.safeParse(process.env)

    if (!result.success) {
        console.error("Environment validation failed:")
        console.error(result.error.flatten().fieldErrors)
        process.exit(1)
    }

    return result.data
}

export const env = loadEnv()
