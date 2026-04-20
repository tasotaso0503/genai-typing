import { resolve } from 'path'
import { config } from 'dotenv'

config({ path: resolve(__dirname, '../../.env') })

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  modules: ['@pinia/nuxt'],
  runtimeConfig: {
    googleApiKey: process.env.GOOGLE_API_KEY || '',
    groqApiKey: process.env.GROQ_API_KEY || '',
    kvRestApiUrl: process.env.KV_REST_API_URL || '',
    kvRestApiToken: process.env.KV_REST_API_TOKEN || '',
  },
  app: {
    head: {
      title: 'GenAI Typing - AIコード タイピング練習',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },
css: ['~/assets/css/main.css'],
})
