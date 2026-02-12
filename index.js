import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'

import express from 'express'
import axios from 'axios'
import qrcode from 'qrcode-terminal'

// ==============================
// EXPRESS SERVER (FOR RENDER)
// ==============================
const app = express()

app.get('/', (req, res) => {
  res.send('Bot is running 🚀')
})

app.listen(process.env.PORT || 3000, () => {
  console.log('🌍 Web server running')
})

// ==============================
// N8N WEBHOOK
// ==============================
const N8N_WEBHOOK_URL =
  'https://nothingxd7.app.n8n.cloud/webhook/7617a1fb-62b3-4758-89a7-7e4150859d3a'

// ==============================
// START BOT
// ==============================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    auth: state,
    version,
    browser: ['Windows', 'Chrome', '120.0.0']
  })

  sock.ev.on('creds.update', saveCreds)

  // =========================
  // CONNECTION HANDLING
  // =========================
  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update

    if (qr) {
      console.log('📱 Scan this QR code with WhatsApp:')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp connected successfully')
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

      console.log('❌ WhatsApp disconnected')

      if (shouldReconnect) {
        console.log('🔄 Reconnecting in 5 seconds...')
        setTimeout(() => {
          startBot()
        }, 5000)
      } else {
        console.log('🚫 Logged out. Delete auth folder and scan again.')
      }
    }
  })

  // =========================
  // MESSAGE LISTENER
  // =========================
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]

    if (!msg.message) return
    if (msg.key.fromMe) return
    if (msg.key.remoteJid.endsWith('@g.us')) return

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text) return

    console.log('📩 Message received:', text)

    try {
      const response = await axios.post(
        N8N_WEBHOOK_URL,
        {
          from: msg.key.remoteJid,
          message: text,
        },
        { timeout: 15000 }
      )

      console.log('🔎 n8n response:', response.data)

      const replyText =
        response.data?.reply ||
        response.data?.text ||
        response.data?.output ||
        null

      if (!replyText) {
        console.log('⚠️ No reply received from n8n')
        return
      }

      await new Promise(resolve =>
        setTimeout(resolve, 2000 + Math.random() * 2000)
      )

      await sock.sendMessage(msg.key.remoteJid, {
        text: replyText,
      })

      console.log('📤 Reply sent')

    } catch (err) {
      console.error('❌ n8n error:', err.message)
    }
  })
}

startBot()
