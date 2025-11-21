import './lib/bufferPolyfill'
import AWSRecognizer, { configArgs } from './recognizers/aws'

// ✅ Patch 1: Extend global `Window` type
declare global {
  interface Window {
    SpeechRecognition?: any
    webkitSpeechRecognition?: any
    SpeechRecognitionPolyfill?: any
  }
}

// ✅ Patch 2: Force-cast window to typed version
const w = (typeof window !== 'undefined' ? window : {}) as Window

// ✅ Patch 3: Fallback recognizer setup
const BrowserRecognizer = w.SpeechRecognition || w.webkitSpeechRecognition
const browserSupportsSpeechRecognition = BrowserRecognizer && new BrowserRecognizer()

const recognizer =
  browserSupportsSpeechRecognition
    ? { ...BrowserRecognizer, create: (_: configArgs) => BrowserRecognizer }
    : AWSRecognizer

w.SpeechRecognitionPolyfill = recognizer
export default recognizer
