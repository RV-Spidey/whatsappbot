import fs from 'fs'

if (fs.existsSync('./auth')) {
  fs.rmSync('./auth', { recursive: true, force: true })
}
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from '@whiskeysockets/baileys'

import express from 'express'

const app = express()
app.get('/', (req, res) => {
  res.send('Bot is running')
})

app.listen(process.env.PORT || 3000, () => {
  console.log('🌍 Web server running')
})

import axios from 'axios'
import qrcode from 'qrcode-terminal'

// 🔁 MAKE SURE THIS IS YOUR PRODUCTION WEBHOOK URL
const N8N_WEBHOOK_URL =
  'https://nothingxd7.app.n8n.cloud/webhook/7617a1fb-62b3-4758-89a7-7e4150859d3a'

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth')

  const sock = makeWASocket({
    auth: state,
  })

  sock.ev.on('creds.update', saveCreds)

  // =========================
  // CONNECTION HANDLING
  // =========================
  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update

    if (qr) {
      console.log('📱 Scan this QR code with WhatsApp')
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
        console.log('🔄 Reconnecting...')
        startBot()
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
    if (msg.key.remoteJid.endsWith('@g.us')) return // Ignore groups

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text) return

    console.log('📩 Message received:', text)
    console.log('📡 Sending to n8n...')

    try {
      const response = await axios.post(
        N8N_WEBHOOK_URL,
        {
          from: msg.key.remoteJid,
          message: text,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      )

      console.log('🔎 Full n8n response:', response.data)

      // Try multiple possible formats safely
      let replyText = null

      if (response.data?.reply) {
        replyText = response.data.reply
      } else if (response.data?.text) {
        replyText = response.data.text
      } else if (typeof response.data === 'string') {
        replyText = response.data
      }

      if (!replyText) {
        console.log('⚠️ No valid reply field found in n8n response')
        return
      }

      // Human-like delay (2–5 seconds)
      await new Promise((resolve) =>
        setTimeout(resolve, 2000 + Math.random() * 3000)
      )

      await sock.sendMessage(msg.key.remoteJid, {
        text: replyText,
      })

      console.log('📤 Reply sent:', replyText)

    } catch (err) {
      if (err.response) {
        console.error('❌ n8n responded with error:', err.response.status)
        console.error('❌ Response body:', err.response.data)
      } else {
        console.error('❌ n8n request failed:', err.message)
      }
    }
  })
}

startBot()
