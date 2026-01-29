import { Hono } from "hono"
import { logger } from "hono/logger"
import { env } from "./lib/env"
import { handleUpdate } from "./telegram/handler"
import { exchangeCodeForTokens } from "./gmail/oauth"
import { db } from "./lib/db"

const app = new Hono()

app.use("*", logger())

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() })
})

app.post("/webhook", async (c) => {
  try {
    const update = await c.req.json()
    await handleUpdate(update, env.TELEGRAM_BOT_TOKEN)
    return c.json({ ok: true })
  } catch (error) {
    console.error("Webhook error:", error)
    return c.json({ ok: false }, 500)
  }
})

app.get("/oauth/callback", async (c) => {
  const code = c.req.query("code")
  const state = c.req.query("state")

  if (!code || !state) {
    return c.html(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>Error</h1>
          <p>Missing authorization code or state.</p>
        </body>
      </html>
    `)
  }

  try {
    const user = await db.user.findUnique({
      where: { telegramId: state },
    })

    if (!user) {
      return c.html(`
        <html>
          <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>Error</h1>
            <p>User not found. Please start the bot first with /start.</p>
          </body>
        </html>
      `)
    }

    await exchangeCodeForTokens(code, user.id)
    console.log(`Gmail successfully connected for user: ${user.id} (${user.telegramId})`)

    return c.html(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>Gmail Connected!</h1>
          <p>You can now close this window and return to Telegram.</p>
          <p>Use /connect in the bot to see your available sender emails.</p>
        </body>
      </html>
    `)
  } catch (error) {
    console.error("OAuth callback error:", error)
    return c.html(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>Error</h1>
          <p>Failed to connect Gmail. Please try again with /connect.</p>
        </body>
      </html>
    `)
  }
})

console.log(`Autoply Bot starting on port ${env.PORT}...`)

export default {
  port: env.PORT,
  fetch: app.fetch,
}
