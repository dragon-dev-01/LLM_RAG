import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Box, Button, Card, CardHeader, CardContent, Collapse, Divider,
  IconButton, Paper, TextareaAutosize, TextField, CircularProgress, Grid, MenuItem
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SendIcon       from '@mui/icons-material/Send';
import MicIcon        from '@mui/icons-material/Mic';
import MicOffIcon     from '@mui/icons-material/MicOff';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
// import { useSpeechRecognition } from 'react-speech-recognition';
// Optional import - only used if available (speech-polyfill is optional)
// @ts-ignore - Optional vendor package
let SpeechRecognitionPolyfill: any = null;
try {
  // @ts-ignore
  SpeechRecognitionPolyfill = require('../../../vendor/speech-polyfill/dist/index.js');
} catch (e) {
  // Speech polyfill not available - this is optional
}
import { useTheme, useMediaQuery } from '@mui/material';
import ImageIcon from '@mui/icons-material/Image'; 
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
/* ───────────────────────────────────────────────────────────── */
interface Message { role: 'user' | 'assistant'; content: string }
type Conn = 'idle' | 'connecting' | 'connected' | 'error';

/* ───────────────────────────────────────────────────────────── */

export default function Talker() {
  /* state */
  const params   = new URLSearchParams(location.search);
  const paramMobile = params.get('mobile') === 'true';
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md')) || paramMobile; 
  
  // const API_URL = 'https://e359-163-180-179-152.ngrok-free.app'
  // const API_URL = "https://25bcrd95ftj157-8010.proxy.runpod.net"
  const [API_URL, setApiUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState('');
  const [sessionId, setSid]     = useState<number | null>(null);
  const [status, setStatus]     = useState<Conn>('idle');
  const [openCard, setOpenCard] = useState(false);
  const [micOn,   setMicOn]     = useState(false);      // NEW – tracks user’s toggle
  const [modelId, setModelId]   = useState(''); 
  const [temperature, setTemperature] = useState(0.3);
  const [language, setLanguage] = useState('en-US');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [imgUrlInput, setImgUrlInput] = useState('');
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [asrProvider, setAsrProvider] = useState<'deepgram' | 'aws'>('deepgram');
  const deepgramSocketRef   = useRef<WebSocket | null>(null);
  const deepgramRecorderRef = useRef<MediaRecorder | null>(null);
  const deepgramStreamRef   = useRef<MediaStream | null>(null);

  const clampTemp = (v: number) => Math.min(1, Math.max(0.1, Number(v.toFixed(2))));

  /* refs */
  const pcRef        = useRef<RTCPeerConnection | null>(null);
  const videoRef     = useRef<HTMLVideoElement | null>(null);
  const listRef      = useRef<HTMLDivElement | null>(null);
  
  const recognitionRef = useRef<any>(null);   // holds AWS recognizer instance
  const [transcript, setTranscript] = useState('');   // live text
  
  // useEffect(() => {
  //   const AWSCls = SpeechRecognitionPolyfill.create({
  //     IdentityPoolId: process.env.REACT_APP_AWS_IDENTITY_POOL_ID || '',
  //     region: process.env.REACT_APP_AWS_REGION || '',
  //   });
  //   const rec = new AWSCls();
  //   rec.continuous = true;
  //   rec.lang = language;
  //   rec.interimResults  = false;
  //   rec.onresult = async (e: any) => {
  //     const result = e.results[e.results.length - 1];
  //     const txt = result?.[0]?.transcript?.trim() || '';
  //     if (!txt) return;
  //     // setTranscript(txt);

  //     if (result.isFinal) {
  //       setAvatarSpeaking(true);
  //       await processUserTextRef.current(txt);
  //       setAvatarSpeaking(false);
  //     }
  //   };
  //   recognitionRef.current = rec;
  //   return () => rec.abort();
  // }, [language]);

  useEffect(() => {
    async function fetchPodId() {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_HOST}/filter_livetalking_image`);
        const data = await res.json();
        if (data.result) {
          const url = `https://${data.result}-8010.proxy.runpod.net`;
          setApiUrl(url);
        } else {
          setApiUrl("https://c6e8-163-180-179-152.ngrok-free.app");
        }
      } catch (err) {
        console.error("Failed to fetch pod ID:", err);
      }
    }
    fetchPodId();
  }, []);
  

  const processUserText = async (userText: string) => {
    const t = userText.trim(); if (!t) return;
    setMessages(p => [...p, { role: 'user', content: t }]);
    const assistantText = await callGPT(t);
    setMessages(p => [...p, { role: 'assistant', content: assistantText }]);
    if (!sessionId) {
      pushToAvatar(assistantText);
    }
    else{
      // setAvatarSpeaking(true);
      pushToAvatar(assistantText); 
      // setAvatarSpeaking(false);
    }
  };

  const isProcessingRef = useRef(false);
  const deepgramStart = async () => {
    const DG_KEY = process.env.REACT_APP_DEEPGRAM_API_KEY;
    if (!DG_KEY) {
      console.error('Missing REACT_APP_DEEPGRAM_API_KEY');
      return;
    }
  
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      deepgramStreamRef.current = stream;

      const qs = new URLSearchParams({
        language,                 // e.g. "en-US"
        model: 'nova-3',            // e.g. "nova-3"
        interim_results: 'true',  // required for UtteranceEnd
        vad_events:      'true',  // emit SpeechStarted / SpeechFinished
        endpointing:     '200',   // ms of silence before Deepgram finalises
        // utterance_end_ms:'1200',  // ms gap between words → UtteranceEnd msg
        punctuate:       'true'
      }).toString();
  
      const ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?${qs}`,
        ['token', DG_KEY],
      );
      deepgramSocketRef.current = ws;
  
      ws.onopen = () => {
        const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        deepgramRecorderRef.current = rec;
  
        rec.ondataavailable = (e) => {
          if (ws.readyState === WebSocket.OPEN && e.data.size > 0) {
            ws.send(e.data);
          }
        };
        rec.start(250); // ✅ continuous until stop()

      };
  
      // ws.onmessage = async (evt) => {
      //   const msg = JSON.parse(evt.data);
      //   const alt = msg.channel?.alternatives?.[0];
      //   if (alt?.transcript) {
      //     const txt = alt.transcript.trim();
      //     if (txt && !msg.is_final) return;
      //     if (txt) {
      //       setAvatarSpeaking(true);
      //       await processUserTextRef.current(txt);
      //       setAvatarSpeaking(false);
      //     }
      //   }
      // };
      ws.onmessage = async (evt) => {
        const msg = JSON.parse(evt.data);
        const alt = msg.channel?.alternatives?.[0];
        if (alt?.transcript) {
          const txt = alt.transcript.trim();
          if (!txt) return;

      
          if (msg.is_final) {
            if (isProcessingRef.current) {
              console.log('[SKIP] Duplicate triggered during processing');
              return;
            }
            isProcessingRef.current = true;
            deepgramRecorderRef.current?.stop(); // this will trigger onstop
            // setAvatarSpeaking(true);
            await processUserTextRef.current(txt);
            // setAvatarSpeaking(false);
            isProcessingRef.current = false;
          }
        }
      };
      
  
      ws.onerror = (err) => console.error('Deepgram WS error', err);
      ws.onclose = () => {
        stream.getTracks().forEach(t => t.stop());
      };
    } catch (err) {
      console.error('Deepgram error:', err);
    }
  };
  
  const deepgramStop = () => {
    deepgramRecorderRef.current?.stop();
    if (deepgramSocketRef.current?.readyState === WebSocket.OPEN) {
      deepgramSocketRef.current.close();
    }
    deepgramStreamRef.current?.getTracks().forEach(t => t.stop());
  };
  

  const safeStart = () => {
    if (asrProvider === 'deepgram') {
      deepgramStart();
    } else {
      const r = recognitionRef.current;
      try { r.start(); } catch (e: any) {
        if (e.name !== 'InvalidStateError') throw e;
      }
    }
  };
  
  const safeStop = () => {
    if (asrProvider === 'deepgram') {
      deepgramStop();
    } else {
      const r = recognitionRef.current;
      if (r && r.listening) r.stop();
    }
  };
  
  /* ========== helpers ========== */
  const cleanUpPc = () => {
    const pc = pcRef.current;
    if (pc) {
      pc.getReceivers().forEach(r => r.track?.stop());
      pc.getSenders().forEach(s => s.track?.stop());
      pc.close();
      pcRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };
  const connect = async () => {
    cleanUpPc();
    setStatus('connecting');
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          {
            urls: 'stun:stun.l.google.com:19302'
          },
          {
            urls: 'stun:relay1.expressturn.com:3478',
            username: 'efTYZ01RL1QUJ5CFUX',
            credential: 'AOZVt0YaAPWCJPbQ'
          },
          {
            urls: 'turn:relay1.expressturn.com:3478',
            username: 'efTYZ01RL1QUJ5CFUX',
            credential: 'AOZVt0YaAPWCJPbQ'
          }
        ],
        iceTransportPolicy: 'all',
        bundlePolicy: 'balanced',
        rtcpMuxPolicy: 'require'
      });
  
      pcRef.current = pc;
  
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
  
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setStatus('connected');
        if (pc.connectionState === 'failed') setStatus('error');
      };
  
      pc.ontrack = (e) => {
        if (videoRef.current && e.streams[0]) {
          videoRef.current.srcObject = e.streams[0];
          videoRef.current.play().catch(() => {});
        }
      };
  
      await pc.setLocalDescription(await pc.createOffer());
  
      /* cap ICE gather to 5s */
      await new Promise<void>((res) => {
        const t = setTimeout(res, 8000);
        pc.onicecandidate = (ev) => {
          if (!ev.candidate) { clearTimeout(t); res(); }
        };
      });
  
      const reply = await fetch(`${API_URL}/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp: pc.localDescription!.sdp,
          type: pc.localDescription!.type
        })
      });
  
      const ans = await reply.json();   // { sdp, type, sessionid }
      setSid(ans.sessionid);
      await pc.setRemoteDescription(new RTCSessionDescription(ans));
    } catch (err) {
      console.error('Connection error:', err);
      setStatus('error');
    }
  };
  
  const disconnect = () => {
    cleanUpPc();
    setStatus('idle');
    setSid(null);
  };
  
  
  const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;
  const systemPrompt = `
  You are a digital human speaking language based on prompt.
  When generating output:
  
  - Reply no more than 400 tokens, answer concisely and short.
  - Do NOT use asterisks (*), exclamation marks (!), at symbols (@), hashtags (#), dollar signs ($), or other special symbols. (If % use text 'percent')
  - Do NOT output markdown formatting (no bold, italics, headers, etc.)
  `.trim();
  
  const callGPT = async (userText: string): Promise<string> => {
    if (!OPENAI_API_KEY) return '(no API key)';
    
    const content: any[] = [{ type: 'text', text: userText }];
    if (imgUrl) {
      content.push({ type: 'image_url', image_url: { url: imgUrl } });
    }
    
    const body = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content }
      ],
      temperature: 0.7,
      max_tokens: 512
    };
    
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(body)
    });
    
    if (!resp.ok) {
      console.error('OpenAI error', await resp.text());
      return '(error getting answer)';
    }
    
    const result = await resp.json();
    return result.choices?.[0]?.message?.content ?? '(no answer)';
  };
  

  const pushToAvatar = async (txt: string) => {
    if (sessionId == null) return;
    await fetch(`${API_URL}/human`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ type: 'echo', text: txt, interrupt: true, sessionid: sessionId })
    });
  };
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);


  const processUserTextRef = useRef<(text: string) => void>(() => {});
  useEffect(() => {
    processUserTextRef.current = processUserText;
  });
  

  /* manual send */
  const submit = () => { const t = input.trim(); if (!t) return;
                         setInput(''); processUserText(t); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  useEffect(() => {
    if (status === 'connected' && !micOn) {
      // if (!browserSupportsSpeechRecognition) return;
      setMicOn(true);
      setTranscript('');
      safeStart();
    }
  }, [status]);

  /* list autoscroll */
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages]);
  useEffect(() => {
    const el = listRef.current; if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [messages, openCard]);

  const toggleMic = async () => {
    if (micOn) { 
      setMicOn(false);
      safeStop();
      const spoken = transcript.trim();
      setTranscript('');
      if (spoken) await processUserText(spoken);
    } else { // turn ON
      setMicOn(true);
      setTranscript('');
      safeStart();
    }
  };

  useEffect(() => {
    if (avatarSpeaking && micOn) {
      safeStop();
    } else if (!avatarSpeaking && micOn) {
      setTranscript('');
      safeStart()
    }
  }, [avatarSpeaking, micOn, language]);

  const LANGUAGES = [
    { code: 'en-US', label: 'English (US)', flag: '🇺🇸' },
    { code: 'en-GB', label: 'English (UK)', flag: '🇬🇧' },
    { code: 'fr-FR', label: 'French',      flag: '🇫🇷' },
    { code: 'de-DE', label: 'German',      flag: '🇩🇪' },
    { code: 'ko', label: 'Korean',      flag: '🇰🇷' },
    { code: 'ja', label: 'Japanese',    flag: '🇯🇵' },
    { code: 'zh-CN', label: 'Chinese',     flag: '🇨🇳' },
    { code: 'ms-MY', label: 'Malay',       flag: '🇲🇾' },
    { code: 'id', label: 'Indonesian',  flag: '🇮🇩' }
  ];

  return (
    <>
      <Helmet><title>Live VAIS</title></Helmet>
  
      <Grid container 
        spacing={{ xs: 0, md: 3 }}
          sx={{
            height: '100%',
            color: '#E3E3E3',
            px: { xs: 0, md: 3 },                // no horizontal padding on mobile
            py: 3 
          }}
        >
        {/* LEFT COLUMN */}
        <Grid
          item
          xs={12}
          md={2}
          sx={{
            // force-hide on mobile/tablet, show on md+ (desktop)
            display: isMobile
              ? 'none'
              : { xs: 'none', md: 'flex' },
            flexDirection: 'column',
            gap: 2
          }}
        >
          <Grid container>
            <Grid item xs={11} md={11} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {!isMobile && (
              <>
                <TextField
                  label="Trained Model ID"
                  placeholder="abcde…-5000"
                  size="small"
                  value={modelId}
                  onChange={e => setModelId(e.target.value)}
                  InputLabelProps={{ sx: { color: '#9fa1a7' } }}
                  fullWidth
                />

                <TextField
                  label="Temperature"
                  type="number"
                  size="small"
                  inputProps={{ step: .1, min: .1, max: 1 }}
                  value={temperature}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setTemperature(clampTemp(isNaN(v) ? 0.3 : v));
                  }}
                  InputLabelProps={{ sx: { color: '#9fa1a7' } }}
                  fullWidth
                />

                <TextField
                  label="Language"
                  select
                  size="small"
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  fullWidth
                >
                  {LANGUAGES.map(lang => (
                    <MenuItem key={lang.code} value={lang.code}>
                      <span style={{ marginRight: 8 }}>{lang.flag}</span> {lang.label}
                    </MenuItem>
                  ))}
                </TextField>
              </>
            )}
            <TextField
              label="ASR Provider"
              select
              size="small"
              value={asrProvider}
              onChange={e => setAsrProvider(e.target.value as 'deepgram' | 'aws')}
              fullWidth
            >
              <MenuItem value="deepgram">Deepgram (Default)</MenuItem>
              <MenuItem value="aws">AWS Transcribe</MenuItem>
            </TextField>

            </Grid>
          </Grid>
        </Grid>
  
        {/* RIGHT COLUMN */}
        <Grid item xs={12} lg={9} md={12} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <Box
              sx={{
                position:   'relative',
                flexGrow:   1,
                display:    'flex',
                justifyContent: isMobile ? 'center'     : 'flex-start',
                alignItems:     isMobile ? 'center'     : 'flex-start',
                width:           '100%',
                height:          isMobile ? '100vh'     : 'auto'
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{
                  width:      '100%',                        // full width
                  height:     isMobile
                              ? '100%'                     // fills the wrapper's 100vh
                              : (openCard ? '60vh' : '72vh'),
                  objectFit:  isMobile ? 'cover' : 'contain',
                  background: '#000',
                  borderRadius: isMobile ? 0 : 12           // zero radius on mobile
                }}
              />
              {status === 'connecting' && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderRadius: 12,
                    zIndex: 1
                  }}
                >
                  <CircularProgress color="inherit" />
                </Box>
              )}
          </Box>
          <Card sx={{
            mt: 2,
            bgcolor: '#202123',
            color: '#E3E3E3',
            width: { xs: '100%', md: '80%' },
            mx: 'auto'
          }}>
            <CardHeader
              title="Show Conversation"
              sx={{ '.MuiCardHeader-title': { fontSize: 16 }, py: 0.85 }}
              action={
                <IconButton sx={{ color: '#fff' }} onClick={() => setOpenCard(o => !o)}>
                  {openCard ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              }
            />
            <Collapse in={openCard} unmountOnExit>
              <Divider />
              <CardContent sx={{ p: 0 }}>
                <Box
                  ref={listRef}
                  sx={{ height: 160, overflowY: 'auto', px: 3, pt: 2, pb: 1 }}
                >
                  {messages.map((m, i) => (
                    <Box
                      key={i}
                      sx={{
                        display: 'flex',
                        justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                        mb: 1.5
                      }}
                    >
                      <Paper elevation={3}
                        sx={{
                          px: 2,
                          py: 1,
                          maxWidth: '75%',
                          bgcolor: m.role === 'user' ? '#3E3F4B' : '#202123',
                          color: '#E3E3E3',
                          fontSize: 14,
                          whiteSpace: 'pre-wrap',
                          borderTopRightRadius: m.role === 'user' ? 0 : 2,
                          borderTopLeftRadius:  m.role === 'assistant' ? 0 : 2,
                          borderBottomRightRadius: 2,
                          borderBottomLeftRadius:  2
                        }}
                      >
                        {m.content}
                      </Paper>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Collapse>
  
            <Divider />
            <Box sx={{
              position: 'sticky',
              bottom: 0,
              left: 0,
              right: 0,
              bgcolor: '#202123',
              px: 2,
              py: 1.2,
              display: 'flex',
              alignItems: 'flex-end',
              gap: 1.5
            }}>
              <TextareaAutosize
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                minRows={1}
                placeholder="Send a message…"
                style={{
                  flexGrow: 1,
                  resize: 'none',
                  background: 'transparent',
                  border: 0,
                  outline: 'none',
                  color: '#fff',
                  fontSize: 14
                }}
              />
            {!modelId.trim() && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {/* Show image URL or placeholder */}
                <Box
                  sx={{
                    fontSize: 12,
                    color: '#ccc',
                    maxWidth: 150,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    userSelect: 'all',
                    cursor: imgUrl ? 'pointer' : 'default'
                  }}
                  onClick={() => imgUrl && window.open(imgUrl, '_blank')}
                  title={imgUrl || ''}
                >
                  {imgUrl ?? ''}
                </Box>

                <IconButton
                  size="small"
                  sx={{
                    bgcolor: '#343541',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: '1px solid #fff',
                    color: '#fff',
                    p: 0,
                    '&:hover': { bgcolor: '#444' }
                  }}
                  onClick={() => setShowUrlModal(true)}
                >
                  <ImageIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            )}
  
              <Box sx={{ position: 'relative', width: 28, height: 28 }}>
                <IconButton
                  onClick={toggleMic}
                  sx={{
                    bgcolor: !micOn || avatarSpeaking ? '#343541' : '#ff1744',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {avatarSpeaking && micOn ? (
                    <CircularProgress
                      size={20}                    // match IconButton
                      thickness={4}
                      sx={{
                        color: '#00E5FF',
                        position: 'absolute',
                        top: 4,
                        left: 4
                      }}
                    />
                  ) : micOn ? (
                    <MicIcon sx={{ color: '#fff' }} />
                  ) : (
                    <MicOffIcon sx={{ color: '#fff' }} />
                  )}
                </IconButton>
              </Box>
  
              {status === 'idle' || status === 'error' ? (
                <Button size="small" variant="contained" onClick={connect}>Start</Button>
              ) : status === 'connecting' ? (
                <Button size="small" disabled>Connecting…</Button>
              ) : (
                <Button size="small" color="error" onClick={disconnect}>Stop</Button>
              )}
            </Box>
          </Card>

        </Grid>
  

      </Grid>
      <Dialog open={showUrlModal} onClose={() => setShowUrlModal(false)} fullWidth maxWidth="sm">
        <DialogTitle>Enter Image URL</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            placeholder="https://example.com/image.jpg"
            value={imgUrlInput}
            onChange={(e) => setImgUrlInput(e.target.value)}
            error={!!urlError}
            helperText={urlError}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowUrlModal(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={() => {
                if (imgUrlInput.trim() === '') {
                  // empty input means no image URL
                  setUrlError(null);
                  setImgUrl(null);
                  setShowUrlModal(false);
                  return;
                }
                try {
                  const url = new URL(imgUrlInput);
                  if (!url.protocol.startsWith('http')) {
                    setUrlError('URL must start with http or https');
                    return;
                  }
                  setUrlError(null);
                  setImgUrl(imgUrlInput);
                  setShowUrlModal(false);
                } catch {
                  setUrlError('Invalid URL');
                }
              }}
            >
              Save
            </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}  