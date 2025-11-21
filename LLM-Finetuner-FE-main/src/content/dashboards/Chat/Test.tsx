// src/pages/TestDeepgram.tsx
import React, { useRef, useState } from 'react';

export default function TestDeepgram() {
  const [listening, setListening]   = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError]           = useState<string|null>(null);

  const socketRef   = useRef<WebSocket|null>(null);
  const recorderRef = useRef<MediaRecorder|null>(null);
  const streamRef   = useRef<MediaStream|null>(null);

  const DG_KEY = process.env.REACT_APP_DEEPGRAM_API_KEY;
  if (!DG_KEY) throw new Error('Missing REACT_APP_DEEPGRAM_API_KEY');

  const params = new URLSearchParams(window.location.search);
  const model = params.get('model') || 'nova-3'; // fallback to 'nova' if not specified

  const start = async () => {
    try {
      // 1) Grab the mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 2) Open WS to Deepgram with proper sub-protocol
      const url = [
        'wss://api.deepgram.com/v1/listen',
        '?language=en-US',
        '&interim_results=true',
        '&punctuate=true',
        `&model=${encodeURIComponent(model)}`
      ].join('');
      const ws = new WebSocket(url, ['token', DG_KEY]);
      socketRef.current = ws;

      ws.onopen = () => {
        setListening(true);

        // 3) Send mic chunks
        const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        recorderRef.current = rec;
        rec.ondataavailable = (e) => {
          if (ws.readyState === WebSocket.OPEN && e.data.size > 0) {
            ws.send(e.data);
          }
        };
        rec.start(250);
      };

      ws.onmessage = (evt) => {
        // Deepgram sends back JSON with transcripts
        const msg = JSON.parse(evt.data);
        const alt = msg.channel?.alternatives?.[0];
        if (alt && alt.transcript !== undefined) {
          setTranscript(alt.transcript);
        }
      };

      ws.onerror = (err) => {
        console.error('❌ WS error', err);
        setError('WebSocket error—check your key & network');
      };

      ws.onclose = (evt) => {
        setListening(false);
        stream.getTracks().forEach(t => t.stop());
      };
    } catch (err: any) {
      console.error(err);
      setError(err.message || String(err));
    }
  };

  const stop = () => {
    setListening(false);

    // stop recording
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    // close WS
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.close();
    }
  };

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h2>Deepgram Live STT (direct WebSocket)</h2>

      <p><strong>Status:</strong> {listening ? '🎙️ Listening…' : 'Idle'}</p>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      <p>
        <button onClick={start} disabled={listening}>Start</button>{' '}
        <button onClick={stop}  disabled={!listening}>Stop</button>
      </p>

      <div style={{
        marginTop:    20,
        padding:      12,
        minHeight:    80,
        border:       '1px solid #ccc',
        borderRadius: 4,
        background:   '#fafafa'
      }}>
        {transcript || <em>No transcript yet…</em>}
      </div>
    </main>
  );
}
