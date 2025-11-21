/* eslint-disable react/jsx-max-props-per-line */
import React, { useEffect, useState, useRef, ChangeEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import {
  Grid, Divider, Container, Card, Box, useTheme, Checkbox, CardHeader,
  Button, TextField, IconButton, Collapse, Typography, CardContent,
  MenuItem, FormControlLabel, CircularProgress, List, ListItem, ListItemText, Avatar,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Dialog, DialogTitle, DialogContent, DialogActions, RadioGroup, Radio,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  PlayArrow as PlayArrowIcon,
  Settings,
  Tune,
  Layers,
  Close as CloseIcon,
  Info as InfoIcon,
  PersonOutline as PersonOutlineIcon,
  Business as BusinessIcon,
  Rule as RuleIcon,
  PictureAsPdf as PictureAsPdfIcon,
  TableView as TableViewIcon,
  BarChart as BarChartIcon,
  ImageSearch as ImageSearchIcon,
  Slideshow as SlideshowIcon,
  Description as DescriptionIcon,
  Language as LanguageIcon
} from '@mui/icons-material';
import TextareaAutosize from '@mui/material/TextareaAutosize';

import PageTitleWrapper from 'src/components/PageTitleWrapper';
import Footer from 'src/components/Footer';
import PageHeader from './components/PageHeader';
import TabsContainerWrapper from './components/TabsContainerWrapper';

interface AgentLLMProps {
  mode?: 'finetune-rag' | 'finetune' | 'rag' | 'prompt';
}

function AgentLLM(props: AgentLLMProps) {
  const { mode = 'finetune-rag' } = props; 
  const theme = useTheme();
  const API_HOST = process.env.REACT_APP_API_HOST;
  const POD_API_HOST = (id: string) => `https://${id}.proxy.runpod.net`;
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [retrainFlag, setRetrainFlag] = useState('');
  const queryModelId = searchParams.get('model_id') || '';
  const podCastIDRef = useRef('');
  const [podCastID, setPodCastID] = useState('');
  const dotIntervalRef = useRef<NodeJS.Timeout|null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout|null>(null);

  type Role = 'user' | 'agent';
  interface ChatMessage {
    role: Role;
    content: string;
  }
  interface Conversation {
    id: number;
    title: string;
    messages: ChatMessage[];
  }

  interface UploadedFile {
    name: string;
    type: string;
    file?: File;
  }

  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: 1,
      title: 'Conv #1',
      messages: []
    }
  ]);
  const [selectedConvId, setSelectedConvId] = useState<number>(1);
  const [currentSpeaker, setCurrentSpeaker] = useState<Role>('user');
  const [typedMessage, setTypedMessage] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  const [modelName, setModelName] = useState('');
  const [baseModel, setBaseModel] = useState(mode === 'prompt' ? 'Qwen2.5-7B-Ori' : 'Meta-Llama-3.1-8B');
  const [description, setDescription] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOCRModel, setShowOCRModel] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(mode === 'prompt');

  const [isFinetuning, setIsFinetuning] = useState(false);
  const [logMessage, setLogMessage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [startStreaming, setStartStreaming] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [dotCount, setDotCount] = useState(2);

  const [epoch, setEpoch] = useState(10);
  const [learningRate, setLearningRate] = useState(0.00001);
  const [warmupRatio, setWarmupRatio] = useState(0.1);
  const [optim, setOptim] = useState('adamw_8bit');
  const [gradientSteps, setGradientSteps] = useState(4);
  const [peftR, setPeftR] = useState(32);
  const [peftAlpha, setPeftAlpha] = useState(32);
  const [peftDropout, setPeftDropout] = useState(0.0);

  const [deployOnly, setDeployOnly] = useState(false);
  const [runpodApiKey, setRunpodApiKey] = useState('');

  const [errors, setErrors] = useState({
    modelName: '',
    baseModel: '',
    description: '',
    epoch: '',
    learningRate: '',
    warmupRatio: '',
    optimizer: '',
    gradientSteps: '',
    peftR: '',
    peftAlpha: '',
    peftDropout: '',
    chunkDelimiter: '',
    chunkLength: '',
    chunkOverlap: '',
    openAIKEY: '',
  });

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) {
      try {
        setUser(JSON.parse(u));
      } catch {}
    }
  }, []);

  useEffect(() => {
    const isRetrainMode = searchParams.get('retrain');
    if (!isRetrainMode) return;
    setRetrainFlag('retrain');
    (async () => {
      try {
        await fetch(`${API_HOST}/clear_logs`);
        const r = await fetch(`${API_HOST}/get_retrain_info?model_id=${queryModelId}`);
        const d = await r.json();
        setModelName(d.model_name || '');
        setBaseModel(d.model_type || '');
        setDescription(d.description || '');
        setPeftR(d.peft_r ?? 16);
        setPeftAlpha(d.peft_alpha ?? 16);
        setPeftDropout(d.peft_dropout ?? 0);
      } catch {}
    })();
  }, [API_HOST, queryModelId, searchParams]);

  useEffect(() => {
    if (!user?.email) return;
    if (retrainFlag) {
      setPodCastID(queryModelId);
      podCastIDRef.current = queryModelId;
      return;
    }
    const check = async () => {
      try {
        const r = await fetch(`${API_HOST}/get_podcast?email=${user.email}`);
        const d = await r.json();
        setPodCastID(d.podcast_id);
        podCastIDRef.current = d.podcast_id;
      } catch {
        setPodCastID('');
        podCastIDRef.current = '';
      }
    };
    check();
    const i = setInterval(check, 20000);
    return () => clearInterval(i);
  }, [user, retrainFlag, queryModelId, API_HOST]);

  const [agentRole, setAgentRole] = useState((mode === 'finetune-rag' || mode === 'rag') ? 
                                              'You are an AI assistant with knowledge of retrieved documents. Please answer based on retrived context and do not hallucinate.'
                                              : 'You are a helpful AI assistant. Please answer in clear and concise.');
  const [businessInformation, setBusinessInformation] = useState('');
  const [specificRules, setSpecificRules] = useState('');

  const selectedConv = conversations.find(c => c.id === selectedConvId);
  const messages = selectedConv ? selectedConv.messages : [];

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConvId(conv.id);
    setCurrentSpeaker('user');
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleAddConversation = () => {
    const newId = conversations.length
      ? conversations[conversations.length - 1].id + 1
      : 1;
    const newConv: Conversation = {
      id: newId,
      title: `Conv #${newId}`,
      messages: []
    };
    setConversations(prev => [...prev, newConv]);
    setSelectedConvId(newId);
    setCurrentSpeaker('user');
    setTypedMessage('');
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleDeleteConversation = (conv: Conversation) => {
    setConversations(prev => {
      let filtered = prev.filter(c => c.id !== conv.id);
      filtered = filtered.map((c, idx) => ({
        ...c,
        id: idx + 1,
        title: `Conv #${idx + 1}`
      }));
      if (!filtered.length) {
        setSelectedConvId(0);
      } else {
        const stillExists = filtered.find(c2 => c2.id === selectedConvId);
        if (!stillExists) {
          const first = filtered[0];
          setSelectedConvId(first.id);
        }
      }
      return filtered;
    });
    setTypedMessage('');
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleSendMessage = () => {
    if (!typedMessage.trim() || !selectedConvId) return;
    setConversations(prev =>
      prev.map(c => {
        if (c.id === selectedConvId) {
          return {
            ...c,
            messages: [...c.messages, { role: currentSpeaker, content: typedMessage.trim() }]
          };
        }
        return c;
      })
    );
    setTypedMessage('');
    setCurrentSpeaker(prev => (prev === 'user' ? 'agent' : 'user'));
  };

  const startEditing = (index: number, content: string) => {
    setEditingMessageId(index);
    setEditingText(content);
  };

  const saveEditedMessage = (index: number) => {
    if (!selectedConvId) return;
    if (editingText.trim()) {
      setConversations(prev =>
        prev.map(conv => {
          if (conv.id !== selectedConvId) return conv;
          const newData = [...conv.messages];
          newData[index] = { ...newData[index], content: editingText };
          return { ...conv, messages: newData };
        })
      );
    }
    setEditingMessageId(null);
    setEditingText('');
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const canTrain = () => {
    if (!user?.email) return false;
    if (isFinetuning) return false;
    if (retrainFlag) return true;
    return podCastID === '';
  };

  const handleFieldChange = (field: 'modelName' | 'description', val: string) => {
    if (field === 'modelName') {
      setModelName(val);
      setErrors(e => ({ ...e, modelName: val ? '' : 'Model name is required' }));
    } else {
      setDescription(val);
      setErrors(e => ({ ...e, description: val ? '' : 'Description is required' }));
    }
  };

  const validateAllFields = () => {
    const e = {
      modelName: modelName ? '' : 'Model name is required',
      openAIKEY: baseModel === 'GPT-4o'
        ? (openAIKEY.trim()
            ? ''  // No error if user filled in the key
            : 'Open AI API KEY is required'
          )
        : '',      // No error if baseModel != 'GPT-4o'
      baseModel: baseModel ? '' : 'Base model is required',
      description: description ? '' : 'Description is required',
      epoch: epoch > 0 ? '' : 'Epoch>0',
      learningRate: learningRate > 0 ? '' : 'LR>0',
      warmupRatio: warmupRatio >= 0 && warmupRatio <= 1 ? '' : '0<=ratio<=1',
      optimizer: optim ? '' : 'Choose optimizer',
      gradientSteps: gradientSteps > 0 ? '' : 'GradSteps>0',
      peftR: peftR > 0 ? '' : 'peftR>0',
      peftAlpha: peftAlpha > 0 ? '' : 'peftAlpha>0',
      peftDropout: peftDropout >= 0 && peftDropout <= 1 ? '' : '0<=dropout<=1',
      chunkDelimiter: chunkDelimiter.length > 0
        ? ''
        : 'Delimiter is required',
    chunkLength:
      chunkLength >= 100 && chunkLength <= 8000
        ? ''
        : 'Must be between 100 and 8000',
    chunkOverlap:
      chunkOverlap >= 1 && chunkOverlap <= 8000
        ? ''
        : 'Must be between 1 and 8000'

    };
    setErrors(e);
    const hasFieldErr = Object.values(e).some(v => v !== '');
    return !hasFieldErr;
  };

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [websiteUrlInput, setWebsiteUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');

  const handleAddWebsiteUrl = () => {
    setShowUrlModal(true);
  };

  const handleCloseUrlModal = () => {
    setShowUrlModal(false);
    setWebsiteUrlInput('');
    setUrlError('');
  };

  const handleSaveUrl = () => {
    if (!websiteUrlInput.trim()) {
      setUrlError('Invalid URL');
      return;
    }
    setUploadedFiles(prev => [
      ...prev,
      { name: websiteUrlInput.trim(), type: 'url' }
    ]);
    handleCloseUrlModal();
  };

  const handleFileClick = (accept: string, fileType: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const maxSizeMB = 15 * 1024 * 1024;
        if ((fileType === 'csv' || fileType === 'txt') && file.size > maxSizeMB) {
          alert('File too large. Max allowed size is 15 MB.');
          return;
        }
        setUploadedFiles(prev => [...prev, { name: file.name, type: fileType, file }]);
      }
    };
    input.click();
  };  

  const handleDeleteFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (type: string) => {
    if (type === 'pdf') return <PictureAsPdfIcon />;
    if (type === 'csv') return <TableViewIcon />;
    if (type === 'chartImage') return <BarChartIcon />;
    if (type === 'imageOcr') return <ImageSearchIcon />;
    if (type === 'pptx') return <SlideshowIcon />;
    if (type === 'imageDesc') return <PictureAsPdfIcon />;
    if (type === 'txt') return <DescriptionIcon />;
    if (type === 'url') return <LanguageIcon />;
    if (type === 'pdfOcr') return <PictureAsPdfIcon />;
    return <DescriptionIcon />;
  };

  const handleStartFinetuning = async () => {
    if (!validateAllFields()) return;
    setIsFinetuning(true);
    try {
      if (!retrainFlag) {
        const body = {
          email: user?.email||'', model_name: modelName, model_type: baseModel, description,
          is_llm:true, runpod_api_key: runpodApiKey||null, peft_r:peftR, peft_alpha:peftAlpha, peft_dropout:peftDropout, 
          is_agent:true,
        };
        const finRes = await fetch(`${API_HOST}/finetune`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(body)
        });
        if (!finRes.ok) { setIsFinetuning(false); return; }
        let s=60; setLogMessage(`Creating docker image ${s} seconds remaining... (DO NOT REFRESH/CLOSE PAGE)`);
        await new Promise<void>(r=>{
          const it=setInterval(()=>{
            s-=1;
            if (s>0) setLogMessage(`Creating docker image ${s} seconds remaining... (DO NOT REFRESH/CLOSE PAGE)`);
            else {clearInterval(it);setLogMessage(''); r();}
          },1000);
        });
      }
      let d=0; setLogMessage('Preparing docker image (DO NOT REFRESH/CLOSE PAGE)');
      const dotInt=setInterval(()=>{
        d=(d%6)+1;
        setLogMessage(`Preparing docker image${'.'.repeat(d)} (DO NOT REFRESH/CLOSE PAGE)`);
      },2000);

      const poll=async()=>{
        try {
          const head=await fetch(`${POD_API_HOST(podCastIDRef.current)}/logs`,{method:'HEAD'});
          if (head.ok) {
            clearInterval(pi); 
            clearInterval(dotInt);
            setLogMessage(''); 
            setStartStreaming(true);

            for (const item of uploadedFiles) {
              const formData = new FormData();
              if (item.type === 'url') {
                formData.append('website_url', item.name);
              } else {
                if (!item.file) continue;
                formData.append('file', item.file);
                formData.append('type', item.type);
              }
              await fetch(`${POD_API_HOST(podCastIDRef.current)}/upload_file`, {
                method:'POST',
                body: formData
              });
            }

            const dataToSend = conversations.filter((c) => c.messages.length > 0);
            const systemPromptParts: string[] = [];
            if (agentRole.trim()) {
              systemPromptParts.push(agentRole.trim());
            }
            if (specificRules.trim()) {
              systemPromptParts.push(specificRules.trim());
            }
            if (businessInformation.trim()) {
              systemPromptParts.push(`Business Information:\n${businessInformation.trim()}`);
            }
            const systemPrompt = systemPromptParts.join('\n\n');

            const meta = {
              user_email:user?.email||'', model_name:modelName, model_type:baseModel, description,
              epochs:epoch, learning_rate:learningRate, warmup_ratio:warmupRatio, optimizer:optim,
              gradient_accumulation_steps:gradientSteps, peft_r:peftR, peft_alpha:peftAlpha,
              peft_dropout:peftDropout, data:dataToSend, model_id:podCastIDRef.current,
              retrain_flag: retrainFlag||'', system_prompt: systemPrompt, is_agent:true,
              separator: chunkDelimiter, chunk_size: chunkLength, chunk_overlap: chunkOverlap,
              replace_spaces: replaceSpaces, delete_urls: deleteUrls, ocr_model: ocrModel, gpt_api_key: gptAPIKEY,
              openai_api_key: openAIKEY
            };
            const r=await fetch(`${POD_API_HOST(podCastIDRef.current)}/run_model_llm`,{
              method:'POST',headers:{'Content-Type':'application/json'},
              body:JSON.stringify(meta)
            });
            if (!r.ok) throw new Error('Fail start LLM finetuning');
          }
        } catch {}
      };
      poll();
      const pi=setInterval(poll,30000);
    } catch {
      setIsFinetuning(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/conversation.json';
    link.download = 'conversation.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };
  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setConversations(prev => {
        let newConvs = [...prev];
        const conv1 = newConvs.find(c => c.id === 1);
        if (conv1 && conv1.messages.length === 0) {
          newConvs = newConvs.filter(c => c.id !== 1);
        }
        let maxId = newConvs.reduce((acc, c) => Math.max(acc, c.id), 0);
        data.forEach((convObj: any) => {
          maxId += 1;
          const mappedMessages = (convObj.messages || []).map((m: any) => ({
            role: m.role === 'assistant' ? 'agent' : m.role,
            content: m.content
          }));
          newConvs.push({
            id: maxId,
            title: `Conv #${maxId}`,
            messages: mappedMessages
          });
        });
        return newConvs;
      });
    } catch {
      alert('Failed to import JSON file. Check console.');
    } finally {
      e.target.value = '';
    }
  };

  useEffect(()=>{
    if(!startStreaming){
      if(pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      return;
    }
    pollingIntervalRef.current=setInterval(async()=>{
      try{
        const resp=await fetch(`${POD_API_HOST(podCastIDRef.current)}/current_logs`);
        if(resp.ok){
          const txt=await resp.text();
          const lines=txt.split('\n').filter(x=>x.trim()!=='');
          setLogs(prev=>Array.from(new Set([...prev,...lines])));
        }
      }catch{}
    },1000);
    return()=> pollingIntervalRef.current && clearInterval(pollingIntervalRef.current);
  },[startStreaming]);

  useEffect(()=>{
    if(!logs.length) return;
    if(logs.some(l=>/Downloading shards:.*0%/.test(l))) setIsDownloading(true);
    if(logs.some(l=>/Downloading shards:.*100%/.test(l)||/Loading checkpoint shards/.test(l))) {
      setIsDownloading(false);
    }
    if(logs.some(l=>/Finetuning completed successfully\./.test(l))) {
      setStartStreaming(false);
      if(pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      (async()=>{
        try {
          if(!podCastIDRef.current) return;
          await fetch(`${API_HOST}/finished_finetuning?podcast_id=${encodeURIComponent(podCastIDRef.current)}&is_llm=${true}`);
        }catch{}
      })();
    }
  },[logs,API_HOST]);

  useEffect(()=>{
    if(isDownloading){
      dotIntervalRef.current=setInterval(()=> setDotCount(p=>p<6?p+1:2),500);
    } else {
      if(dotIntervalRef.current) clearInterval(dotIntervalRef.current);
      setDotCount(2);
    }
    return()=> dotIntervalRef.current && clearInterval(dotIntervalRef.current);
  },[isDownloading]);

  const combinedLogs = [...logs, ...(isDownloading?[`Downloading shards${'.'.repeat(dotCount)}`]:[])];

  // --------------- Chunk settings (NEW) ---------------
  const [chunkMode, setChunkMode] = useState<'general' | 'parent'>('general');
  const [chunkDelimiter, setChunkDelimiter] = useState(' ');  // Default "\n"
  const [chunkLength, setChunkLength] = useState(4096);         // 100-8000
  const [chunkOverlap, setChunkOverlap] = useState(50);         // 1-8000
  const [replaceSpaces, setReplaceSpaces] = useState(false);
  const [deleteUrls, setDeleteUrls] = useState(false);
  const [ocrModel, setOcrModel] = useState('Qwen2.5VL');
  const [gptAPIKEY, setGptAPIKEY] = useState('');
  const [openAIKEY, setOpenAIKEY] = useState('');

  return (
    <>
      <Helmet>
        <title>VAIS Console</title>
      </Helmet>

      <style>{
        `
        .sendNewMessage {
          background-color: #fff;
          display: flex;
          justify-content: space-between;
          padding: 5px 10px;
          border-radius: 6px;
        }
        .sendNewMessage button {
          width: 32px;
          height: 32px;
          background-color: #ecefff;
          border: none;
          outline: none;
          cursor: pointer;
          font-size: 16px;
          color: #4665ff;
          border-radius: 50%;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sendNewMessage button:hover {
          transform: scale(1.2);
        }
        #sendMsgBtn {
          background-color: #3b5bfe;
          color: #fff;
        }
        `
      }</style>

      <PageTitleWrapper>
        <PageHeader />
      </PageTitleWrapper>

      <Container maxWidth="lg">
        <TabsContainerWrapper />

        <Card>
          <Grid container spacing={0}>
            <Grid item xs={12}>
              <Box p={4}>
                <Card>
                  <CardHeader 
                    title="Model Settings"
                  />
                  <Divider />
                  <Box p={4}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          variant="outlined"
                          label="LLM Agent Name"
                          placeholder="Enter model name"
                          value={modelName}
                          onChange={e => handleFieldChange('modelName', e.target.value)}
                          error={!!errors.modelName}
                          helperText={errors.modelName}
                          disabled={!!retrainFlag}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          select
                          fullWidth
                          variant="outlined"
                          label="Choose Base Model"
                          value={baseModel}
                          onChange={e => setBaseModel(e.target.value)}
                          SelectProps={{ native: true }}
                          error={!!errors.baseModel}
                          helperText={errors.baseModel}
                          disabled={!!retrainFlag}
                        >
                          {mode === 'prompt' ? 
                          <>
                            <option value="Qwen2.5-7B-Ori">Qwen2.5-7B-128K</option> 
                            <option value="GPT-4o">GPT-4o</option> 
                          </>:
                          <><optgroup label="Instruct Models">
                            <option value="Meta-Llama-3.1-8B">Meta-Llama-3.1-8B</option>
                            <option value="Qwen2.5-7B">Qwen2.5-7B</option>
                            <option value="Mistral-7B-Instruct-v0.3">Mistral-7B-IT</option>
                            <option value="Llama-3.2-3B">Llama-3.2-3B</option>
                            <option value="Gemma-3-12B">Gemma-3-12B</option>
                          </optgroup>
                          <optgroup label="Reasoning Models">
                            <option value="DeepSeek-R1-Qwen-7B">DeepSeek-R1-Qwen-7B</option>
                            <option value="DeepSeek-R1-Llama-8B">DeepSeek-R1-Llama-8B</option>
                          </optgroup>
                          <optgroup label="Code Models">
                            <option value="Qwen2.5-Coder-7B-Instruct">Qwen2.5-Coder-7B</option>
                          </optgroup></>
                          }
                        </TextField>
                      </Grid>
                      <Grid item xs={12} hidden={baseModel !== 'GPT-4o'}>
                        <TextField
                          fullWidth
                          variant="outlined"
                          label="Open AI API Key"
                          placeholder="sk-..."
                          value={openAIKEY}
                          onChange={e => setOpenAIKEY(e.target.value)}
                          error={!!errors.openAIKEY}
                          helperText={errors.openAIKEY}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          multiline
                          minRows={2}
                          variant="outlined"
                          label="Description"
                          placeholder="Enter description"
                          value={description}
                          onChange={e => handleFieldChange('description', e.target.value)}
                          error={!!errors.description}
                          helperText={errors.description}
                          disabled={!!retrainFlag}
                        />
                      </Grid>
                    </Grid>
                  </Box>
                </Card>
              </Box>
            </Grid>

            <Grid item xs={12}>
              <Divider />
              <Box p={4} sx={{ background: theme.colors.alpha.black[5] }}>
                <Card>
                  <CardHeader
                    title="Assistant Configuration & Business Context"
                    subheader="Set up how the assistant role, provide your business details, and define specific rules to ensure accurate and relevant interactions."
                    action={
                      <IconButton onClick={() => setShowSystemPrompt(!showSystemPrompt)}>
                        {showSystemPrompt ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    }
                  />
                  <Collapse in={showSystemPrompt}>
                    <Divider />
                    <Box p={2}>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                          <Card sx={{ p: 2 }}>
                            <Box display="flex" alignItems="center" mb={1}>
                              <PersonOutlineIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
                              <Typography variant="h6">Agent Role</Typography>
                            </Box>
                            <TextField
                              fullWidth
                              multiline
                              placeholder="You are a helpful customer service assistant..."
                              value={agentRole}
                              onChange={(e) => {
                                if (e.target.value.length <= 5000) {
                                  setAgentRole(e.target.value);
                                }
                              }}
                              sx={{
                                width: '100%',
                                '& .MuiInputBase-root': {
                                  p: 1,                  // padding around the input area
                                  alignItems: 'flex-start',
                                },
                                '& textarea': {
                                  height: '100px !important',  // fixed height
                                  overflow: 'auto !important', // ensures scroll
                                }
                              }}
                            />
                            <Typography variant="caption" display="block" sx={{ mt: 0, textAlign: 'right' }}>
                              {agentRole.length}/5000
                            </Typography>
                          </Card>
                        </Grid>

                        <Grid item xs={12} sm={6}>
                          <Card sx={{ p: 2 }}>
                            <Box display="flex" alignItems="center" mb={1}>
                              <RuleIcon sx={{ mr: 1, color: theme.palette.warning.main }} />
                              <Typography variant="h6">Specific Rules</Typography>
                            </Box>
                            <TextField
                              fullWidth
                              multiline
                              placeholder="Add any specific rules here, such as 'Reply in Malaysia language only', etc..."
                              value={specificRules}
                              onChange={(e) => {
                                if (e.target.value.length <= 5000) {
                                  setSpecificRules(e.target.value);
                                }
                              }}
                              sx={{
                                width: '100%',
                                '& .MuiInputBase-root': {
                                  p: 1,                  // padding around the input area
                                  alignItems: 'flex-start',
                                },
                                '& textarea': {
                                  height: '100px !important',  // fixed height
                                  overflow: 'auto !important', // ensures scroll
                                }
                              }}
                            />
                            <Typography variant="caption" display="block" sx={{ mt: 0, textAlign: 'right' }}>
                              {specificRules.length}/5000
                            </Typography>
                          </Card>
                        </Grid>

                        <Grid item xs={12} sm={12} hidden={mode !== 'prompt'}>
                          <Card sx={{ p: 2, height: '250px', display: 'flex', flexDirection: 'column' }}>
                            <Box display="flex" alignItems="center" mb={1}>
                              <BusinessIcon sx={{ mr: 1, color: theme.palette.success.main }} />
                              <Typography variant="h6">Business Information</Typography>
                            </Box>
                            <TextField
                              fullWidth
                              multiline
                              placeholder="Enter your business details here, such as product information, business location, contact, etc..."
                              value={businessInformation}
                              onChange={(e) => {
                                if (e.target.value.length <= 80000) {
                                  setBusinessInformation(e.target.value);
                                }
                              }}
                              sx={{
                                width: '100%',
                                '& .MuiInputBase-root': {
                                  p: 1,                  // padding around the input area
                                  alignItems: 'flex-start',
                                },
                                '& textarea': {
                                  height: '150px !important',  // fixed height
                                  overflow: 'auto !important', // ensures scroll
                                }
                              }}
                            />
                            <Typography variant="caption" display="block" sx={{ mt: 0, textAlign: 'right' }}>
                              {businessInformation.length}/80000
                            </Typography>
                          </Card>
                        </Grid>
                      </Grid>
                    </Box>
                  </Collapse>
                </Card>
              </Box>
              <Divider />
            </Grid>

            <Grid item xs={12} hidden={(mode === 'finetune' || mode === 'prompt')}>
              <Divider />
              <Box p={4} sx={{ background: theme.colors.alpha.white[70] }}>
                <Card>
                  <CardHeader
                    title="Choose Data Source"
                    subheader="Select the knowledge base or document source to enhance the assistant's responses using Retrieval-Augmented Generation (RAG) for accurate and up-to-date information."
                  />
                  <Divider />
                  <Box p={2}>
                    <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', p: 2, borderRadius: 2 }}>
                      <Typography variant="h6" sx={{ mb: 1 }}>
                        PDF & Table Imports
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={4}>
                          <Button
                            variant="outlined"
                            color="primary"
                            fullWidth
                            startIcon={<PictureAsPdfIcon />}
                            onClick={() => handleFileClick('.pdf', 'pdf')}
                            sx={{
                              textTransform: 'none',
                              justifyContent: 'flex-start'
                            }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'none' }}>
                                Import from PDF
                              </Typography>
                              <Typography variant="caption" sx={{ textTransform: 'none' }}>
                                Best for mostly text-based documents
                              </Typography>
                            </Box>
                          </Button>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Button
                            variant="outlined"
                            color="primary"
                            fullWidth
                            startIcon={<TableViewIcon />}
                            onClick={() => handleFileClick('.csv', 'csv')}
                            sx={{
                              textTransform: 'none',
                              justifyContent: 'flex-start'
                            }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'none' }}>
                                Import from CSV{' '}
                                <Typography
                                  component="span"
                                  sx={{ fontSize: '0.75rem', fontWeight: 'normal' }}
                                >
                                  (Max 15 MB)
                                </Typography>
                              </Typography>
                              <Typography variant="caption" sx={{ textTransform: 'none' }}>
                                Best for tabular data or spreadsheet exports
                              </Typography>
                            </Box>
                          </Button>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Button
                            variant="outlined"
                            color="primary"
                            fullWidth
                            startIcon={<SlideshowIcon />}
                            onClick={() => handleFileClick('.pptx', 'pptx')}
                            sx={{
                              textTransform: 'none',
                              justifyContent: 'flex-start'
                            }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'none' }}>
                                Import from PPTX
                              </Typography>
                              <Typography variant="caption" sx={{ textTransform: 'none' }}>
                                Best for presentation slides or bullet points
                              </Typography>
                            </Box>
                          </Button>
                        </Grid>
                      </Grid>
                    </Box>
                    <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', p: 2, borderRadius: 2 }}>
                      <Typography variant="h6" sx={{ mb: 1 }}>
                        Image & OCR Tools
                      </Typography>
                      <Grid container spacing={2}>
                      <Grid item xs={12} sm={4}>
                          <Button
                            variant="outlined"
                            color="warning"
                            fullWidth
                            startIcon={<PictureAsPdfIcon />}
                            onClick={() => handleFileClick('.pdf', 'pdfOcr')}
                            sx={{
                              textTransform: 'none',
                              justifyContent: 'flex-start'
                            }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'none' }}>
                                PDF Document OCR
                              </Typography>
                              <Typography variant="caption" sx={{ textTransform: 'none', fontSize: '12.5px' }}>
                                Best for reports, proposals with tables & charts
                              </Typography>
                            </Box>
                          </Button>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Button
                            variant="outlined"
                            color="primary"
                            fullWidth
                            startIcon={<BarChartIcon />}
                            onClick={() => handleFileClick('image/*', 'chartImage')}
                            sx={{
                              textTransform: 'none',
                              justifyContent: 'flex-start'
                            }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'none' }}>
                                Chart Image Reader
                              </Typography>
                              <Typography variant="caption" sx={{ textTransform: 'none' }}>
                                Best for bar charts, diagrams, table
                              </Typography>
                            </Box>
                          </Button>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Button
                            variant="outlined"
                            color="primary"
                            fullWidth
                            startIcon={<ImageSearchIcon />}
                            onClick={() => handleFileClick('image/*', 'imageOcr')}
                            sx={{
                              textTransform: 'none',
                              justifyContent: 'flex-start'
                            }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'none' }}>
                                Image OCR Upload
                              </Typography>
                              <Typography variant="caption" sx={{ textTransform: 'none' }}>
                                Best for scanned images or text extraction
                              </Typography>
                            </Box>
                          </Button>
                        </Grid>
                        
                        <Grid item xs={12} sm={4}>
                          <Button
                            variant="outlined"
                            color="primary"
                            fullWidth
                            startIcon={<ImageSearchIcon />}
                            onClick={() => handleFileClick('image/*', 'imageDesc')}
                            sx={{
                              textTransform: 'none',
                              justifyContent: 'flex-start'
                            }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'none' }}>
                                Image Description
                              </Typography>
                              <Typography variant="caption" sx={{ textTransform: 'none' }}>
                                Best for describing general images
                              </Typography>
                            </Box>
                          </Button>
                        </Grid>
                      </Grid>
                    </Box>
                    <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', p: 2, borderRadius: 2 }}>
                      <Typography variant="h6" sx={{ mb: 1 }}>
                        Text & Web Sources
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={4}>
                          <Button
                            variant="outlined"
                            color="primary"
                            fullWidth
                            startIcon={<DescriptionIcon />}
                            onClick={() => handleFileClick('.txt,.md', 'txt')}
                            sx={{
                              textTransform: 'none',
                              justifyContent: 'flex-start'
                            }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                            <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'none' }}>
                                Import from Txt/Md{' '}
                                <Typography
                                  component="span"
                                  sx={{ fontSize: '0.75rem', fontWeight: 'normal' }}
                                >
                                  (Max 15 MB)
                                </Typography>
                              </Typography>
                              <Typography variant="caption" sx={{ textTransform: 'none' }}>
                                Best for raw text data or notes
                              </Typography>
                            </Box>
                          </Button>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Button
                            variant="outlined"
                            color="info"
                            fullWidth
                            startIcon={<LanguageIcon />}
                            onClick={handleAddWebsiteUrl}
                            sx={{
                              textTransform: 'none',
                              justifyContent: 'flex-start'
                            }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'none' }}>
                                Website URL
                              </Typography>
                              <Typography variant="caption" sx={{ textTransform: 'none' }}>
                                Best for crawling text from a public website
                              </Typography>
                            </Box>
                          </Button>
                        </Grid>
                      </Grid>
                    </Box>

                    {/* Existing "Uploaded Files / Sources" section */}
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2">Uploaded Files / Sources:</Typography>
                      <List>
                        {uploadedFiles.map((item, idx) => {
                          const icon = getFileIcon(item.type);
                          return (
                            <ListItem key={idx} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <Avatar sx={{ mr: 2 }}>{icon}</Avatar>
                                <ListItemText primary={item.name} />
                              </Box>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteFile(idx)}
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </ListItem>
                          );
                        })}
                      </List>
                    </Box>
                  </Box>
                </Card>

                <Card sx={{ mt: 2 }}>
                  <CardHeader
                    title="Chunk Settings"
                    action={
                      <IconButton onClick={() => setShowAdvanced(!showAdvanced)}>
                        {showAdvanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    }
                  />
                  <Collapse in={showAdvanced}>
                    <Divider />
                    <CardContent>
                      <Box>
                        <Typography variant="subtitle1" sx={{ mb: 1 }}>
                          Select Chunk Mode
                        </Typography>
                        <RadioGroup
                          row
                          // e.g., chunkMode is 'general' or 'parent'
                          defaultValue="general"
                          name="chunkMode"
                        >
                          <FormControlLabel
                            value="general"
                            control={<Radio />}
                            label="General"
                          />
                          <FormControlLabel
                            value="parent"
                            control={<Radio />}
                            label="Parent-child"
                            disabled
                          />
                        </RadioGroup>
                      </Box>

                      {/* If General is selected */}
                      <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', p: 2, borderRadius: 2 }}>
                        <Typography variant="body1" sx={{ mb: 2 }}>
                          General text chunking mode, the chunks retrieved and recalled are the same.
                        </Typography>

                        <Grid container spacing={2}>
                          <Grid item xs={12} sm={4}>
                            <TextField
                              fullWidth
                              label="Delimiter"
                              placeholder="Default is space (' ')"
                              value={chunkDelimiter}
                              onChange={(e) => setChunkDelimiter(e.target.value)}
                              error={!!errors.chunkDelimiter}
                              helperText={errors.chunkDelimiter}
                            />
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <TextField
                              fullWidth
                              label="Maximum chunk length"
                              type="number"
                              value={chunkLength}
                              onChange={(e) => setChunkLength(+e.target.value)}
                              error={!!errors.chunkLength}
                              helperText={errors.chunkLength}
                              InputProps={{
                                endAdornment: (
                                  <Typography variant="body2" sx={{ ml: 1 }}>
                                    tokens
                                  </Typography>
                                )
                              }}
                            />
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <TextField
                              fullWidth
                              label="Chunk overlap"
                              type="number"
                              value={chunkOverlap}
                              onChange={(e) => setChunkOverlap(+e.target.value)}
                              error={!!errors.chunkOverlap}
                              helperText={errors.chunkOverlap}
                              InputProps={{
                                endAdornment: (
                                  <Typography variant="body2" sx={{ ml: 1 }}>
                                    tokens
                                  </Typography>
                                )
                              }}
                            />
                          </Grid>
                        </Grid>

                        <Box sx={{ mt: 2 }}>
                          <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            Text Pre-processing Rules
                          </Typography>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={replaceSpaces}
                                onChange={(e) => setReplaceSpaces(e.target.checked)}
                              />
                            }
                            label="Replace consecutive spaces, newlines and tabs"
                          />
                          <br />
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={deleteUrls}
                                onChange={(e) => setDeleteUrls(e.target.checked)}
                              />
                            }
                            label="Delete all URLs and email addresses"
                          />
                        </Box>

                      </Box>

                    </CardContent>
                  </Collapse>
                </Card>


                <Card sx={{ mt: 2 }}>
                  <CardHeader
                    title="OCR Model Settings"
                    action={
                      <IconButton onClick={() => setShowOCRModel(!showOCRModel)}>
                        {showOCRModel ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    }
                  />
                  <Collapse in={showOCRModel}>
                    <Divider />
                    <CardContent>
                        <Typography variant="body1" sx={{ mb: 2 }}>
                          Select vision model to perform OCR and vision recognition
                        </Typography>

                        <Grid container spacing={2}>
                          <Grid item xs={12} sm={6}>
                            <TextField
                              select
                              fullWidth
                              variant="outlined"
                              label="Choose OCR Model"
                              value={ocrModel}
                              onChange={e => setOcrModel(e.target.value)}
                              SelectProps={{ native: true }}
                            >
                              <option value="Qwen2.5VL">Qwen2.5VL-7B</option>
                              <option value="GPT-4o-mini">GPT-4o-mini</option>
                            </TextField>
                          </Grid>
                          <Grid item xs={12} sm={6} hidden={ocrModel !== 'GPT-4o-mini'}>
                            <TextField
                              fullWidth
                              label="OpenAI API Key"
                              placeholder="Enter OpenAI API key start with sk-"
                              value={gptAPIKEY}
                              onChange={(e) => setGptAPIKEY(e.target.value)}
                            />
                        </Grid>
                        </Grid>

                    </CardContent>
                  </Collapse>
                </Card>

              </Box>
              <Divider />
            </Grid>

            <Grid item xs={12} hidden={(mode === 'rag' || mode === 'prompt')}>
              <Divider />
              <Box p={4} sx={{ background: theme.colors.alpha.black[5] }}>
                <Card>
                  <CardHeader
                    title="Train Some Conversations for Sample Styling"
                    subheader="Guide the agent's response style, structure, and specific intents, such as collecting user data or addressing FAQs."
                    action={
                      <FormControlLabel
                        control={
                          <Checkbox
                            color="primary"
                            checked={deployOnly}
                            onChange={e => setDeployOnly(e.target.checked)}
                            disabled={!!retrainFlag}
                          />
                        }
                        label="Deploy model only"
                      />
                    }
                  />
                  <Divider />

                  {!deployOnly && (
                    <Box p={2}>
                      <Grid container spacing={2}>
                        <Grid item xs={3}>
                          <Card>
                            <CardHeader
                              title="Conversation Training"
                              action={
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={handleAddConversation}
                                >
                                  Add Row
                                </Button>
                              }
                            />
                            <Divider />
                            <TableContainer sx={{ height: 400, overflowY: 'auto' }}>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Title</TableCell>
                                    <TableCell align="right">#Msg</TableCell>
                                    <TableCell align="center">X</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {conversations.map((c) => (
                                    <TableRow
                                      key={c.id}
                                      hover
                                      onClick={() => handleSelectConversation(c)}
                                      style={{ cursor: 'pointer' }}
                                      selected={c.id === selectedConvId}
                                    >
                                      <TableCell>{c.title}</TableCell>
                                      <TableCell align="right">{c.messages.length}</TableCell>
                                      <TableCell
                                        align="center"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <IconButton
                                          size="small"
                                          color="error"
                                          onClick={() => handleDeleteConversation(c)}
                                        >
                                          <CloseIcon fontSize="small" />
                                        </IconButton>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </Card>
                          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                            <Button variant="outlined" size="small" onClick={handleDownloadTemplate}>
                              Download Template
                            </Button>
                            <Button variant="outlined" size="small" onClick={handleImportClick}>
                              Import JSON
                            </Button>
                            <input
                              type="file"
                              accept=".json"
                              ref={fileInputRef}
                              style={{ display: 'none' }}
                              onChange={handleImportFile}
                            />
                          </Box>
                        </Grid>

                        <Grid item xs={9}>
                          <Typography variant="subtitle1" sx={{ mb: 2 }}>
                            Conversation:
                          </Typography>

                          <div
                            ref={chatContainerRef}
                            style={{
                              height: '434px', 
                              overflowY: 'auto',
                              border: '1px solid #ccc',
                              borderRadius: '12px',
                              marginBottom: '16px'
                            }}
                          >
                            {messages.map((msg, idx) => {
                              const displayName =
                                msg.role === 'agent'
                                  ? (modelName.trim() || 'Agent LLM')
                                  : 'User';
                              return (
                                <ListItem key={idx} alignItems="flex-start">
                                  <Avatar
                                    sx={{
                                      mr: 2,
                                      bgcolor: msg.role === 'user' ? 'primary.main' : 'white.main'
                                    }}
                                  >
                                    {msg.role === 'user' ? (
                                      <i className="fa fa-user" />
                                    ) : (
                                      <img
                                        src="/robot.svg"
                                        alt="Agent"
                                        style={{ width: 20, height: 20 }}
                                      />
                                    )}
                                  </Avatar>
                                  <ListItemText
                                    primary={displayName}
                                    secondary={
                                      editingMessageId === idx ? (
                                        <TextareaAutosize
                                          value={editingText}
                                          onChange={e => setEditingText(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                              e.preventDefault();
                                              saveEditedMessage(idx);
                                            } else if (e.key === 'Escape') {
                                              cancelEditing();
                                            }
                                          }}
                                          onBlur={() => saveEditedMessage(idx)}
                                          autoFocus
                                          style={{
                                            width: '100%',
                                            padding: '6px',
                                            fontSize: '14px',
                                            borderRadius: '4px',
                                            border: '1px solid #ccc',
                                            resize: 'none'
                                          }}
                                        />
                                      ) : (
                                        <Typography
                                          variant="body2"
                                          style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}
                                          onClick={() => startEditing(idx, msg.content)}
                                          title="Click to edit"
                                        >
                                          {msg.content}
                                        </Typography>
                                      )
                                    }
                                  />
                                </ListItem>
                              );
                            })}
                          </div>

                          <Box className="sendNewMessage" sx={{ borderRadius: '50px' }}>
                            <button
                              className="addFiles"
                              style={{
                                borderRadius: '50%',
                                overflow: 'hidden',
                                marginRight: '8px'
                              }}
                            >
                              {currentSpeaker === 'user' ? (
                                <i className="fa fa-user" />
                              ) : (
                                <img
                                  src="/robot.svg"
                                  alt="Agent"
                                  style={{ width: 20, height: 20 }}
                                />
                              )}
                            </button>

                            <TextareaAutosize
                              minRows={1}
                              maxRows={1}
                              placeholder={
                                currentSpeaker === 'user'
                                  ? 'Type a message for User'
                                  : 'Type reply from Agent'
                              }
                              value={typedMessage}
                              onChange={e => setTypedMessage(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSendMessage();
                                }
                              }}
                              style={{
                                flexGrow: 1,
                                padding: '8px',
                                border: 'none',
                                outline: 'none',
                                resize: 'none',
                                fontSize: '14px',
                                borderRadius: '4px',
                                backgroundColor: 'transparent',
                                color: '#000'
                              }}
                            />

                            <button
                              id="sendMsgBtn"
                              onClick={() => {
                                if (!typedMessage.trim()) return;
                                handleSendMessage();
                              }}
                            >
                              <i className="fa fa-paper-plane"></i>
                            </button>
                          </Box>
                        </Grid>
                      </Grid>
                    </Box>
                  )}
                </Card>
                <Card sx={{ mt: 2 }}>
                  <CardHeader
                    title="Advanced Training Settings"
                    action={
                      <IconButton onClick={() => setShowAdvanced(!showAdvanced)}>
                        {showAdvanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    }
                  />
                  <Collapse in={showAdvanced}>
                    <Divider />
                    <CardContent>
                      <Box sx={{ mb: 4 }}>
                        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                          <Settings fontSize="small" sx={{ mr: 1 }} />
                          Hyperparameters
                        </Typography>
                        <TextField
                          label="Epoch"
                          type="number"
                          sx={{ m: 1, width: '25ch' }}
                          value={epoch}
                          onChange={e => setEpoch(+e.target.value)}
                          error={!!errors.epoch}
                          helperText={errors.epoch}
                        />
                        <TextField
                          label="Learning Rate"
                          type="number"
                          sx={{ m: 1, width: '25ch' }}
                          value={learningRate}
                          onChange={e => setLearningRate(+e.target.value)}
                          error={!!errors.learningRate}
                          helperText={errors.learningRate}
                        />
                        <TextField
                          label="Warmup Ratio"
                          type="number"
                          sx={{ m: 1, width: '25ch' }}
                          value={warmupRatio}
                          onChange={e => setWarmupRatio(+e.target.value)}
                          error={!!errors.warmupRatio}
                          helperText={errors.warmupRatio}
                        />
                      </Box>
                      <Divider sx={{ my: 3 }} />

                      <Box sx={{ mb: 4 }}>
                        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                          <Tune fontSize="small" sx={{ mr: 1 }} />
                          Gradients
                        </Typography>
                        <TextField
                          label="Optimizer"
                          select
                          sx={{ m: 1, width: '25ch' }}
                          value={optim}
                          onChange={e => setOptim(e.target.value)}
                          error={!!errors.optimizer}
                          helperText={errors.optimizer}
                        >
                          <MenuItem value="adamw_8bit">adamw_8bit</MenuItem>
                          <MenuItem value="adamw_torch_fused">adamw_torch_fused</MenuItem>
                          <MenuItem value="adamw_torch">adamw_torch</MenuItem>
                          <MenuItem value="adamw_hf">adamw_hf</MenuItem>
                        </TextField>
                        <TextField
                          label="Gradient Accumulation Steps"
                          type="number"
                          sx={{ m: 1, width: '25ch' }}
                          value={gradientSteps}
                          onChange={e => setGradientSteps(+e.target.value)}
                          error={!!errors.gradientSteps}
                          helperText={errors.gradientSteps}
                        />
                      </Box>
                      <Divider sx={{ my: 3 }} />

                      <Box>
                        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                          <Layers fontSize="small" sx={{ mr: 1 }} />
                          LoRA
                        </Typography>
                        <TextField
                          label="Peft R"
                          type="number"
                          sx={{ m: 1, width: '25ch' }}
                          value={peftR}
                          onChange={e => setPeftR(+e.target.value)}
                          error={!!errors.peftR}
                          helperText={errors.peftR}
                          disabled={!!retrainFlag}
                        />
                        <TextField
                          label="Peft Alpha"
                          type="number"
                          sx={{ m: 1, width: '25ch' }}
                          value={peftAlpha}
                          onChange={e => setPeftAlpha(+e.target.value)}
                          error={!!errors.peftAlpha}
                          helperText={errors.peftAlpha}
                          disabled={!!retrainFlag}
                        />
                        <TextField
                          label="Peft Dropout"
                          type="number"
                          sx={{ m: 1, width: '25ch' }}
                          value={peftDropout}
                          onChange={e => setPeftDropout(+e.target.value)}
                          error={!!errors.peftDropout}
                          helperText={errors.peftDropout}
                          disabled={!!retrainFlag}
                        />
                      </Box>
                      <Divider sx={{ my: 3 }} />

                      <Box>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                          Custom Runpod API Key (Optional)
                        </Typography>
                        <TextField
                          label="Runpod API Key"
                          variant="outlined"
                          sx={{ m: 1, width: '75ch' }}
                          value={runpodApiKey}
                          onChange={e => setRunpodApiKey(e.target.value)}
                        />
                      </Box>
                    </CardContent>
                  </Collapse>
                </Card>
              </Box>
              <Divider />
            </Grid>

            <Grid item xs={12}>
              <Box p={4} sx={{ background: theme.colors.alpha.white[70] }}>
                <Button
                  variant="contained"
                  color="info"
                  fullWidth
                  sx={{ mb: 2 }}
                  onClick={handleStartFinetuning}
                  startIcon={
                    !user?.email
                      ? <PlayArrowIcon />
                      : canTrain()
                      ? <PlayArrowIcon />
                      : <CircularProgress size={20} color="inherit" />
                  }
                  disabled={!canTrain()}
                >
                  {isFinetuning
                    ? 'Training...'
                    : retrainFlag
                    ? 'Continue Training'
                    : 'Start Training'}
                </Button>

                {!user?.email && (
                  <Typography variant="subtitle1" sx={{ mb: 2, color: 'white' }}>
                    *Please sign in to start training
                  </Typography>
                )}

                <Card>
                  <CardHeader title="Logs" />
                  <Divider />
                  <Box
                    p={2}
                    sx={{
                      backgroundColor: 'rgba(0,0,0,0.8)',
                      color: 'white',
                      overflowY: 'auto',
                      maxHeight: 400,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    <Typography variant="body2">
                      {combinedLogs.length
                        ? combinedLogs.map((l,i)=><div key={i}>{l}</div>)
                        : logMessage || "Logs will appear here..."}
                    </Typography>
                  </Box>
                </Card>
              </Box>
            </Grid>
          </Grid>
        </Card>
      </Container>
      <Footer />

      <Dialog open={showUrlModal} onClose={handleCloseUrlModal} fullWidth>
        <DialogTitle>Enter Website URL</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            placeholder="https://example.com"
            value={websiteUrlInput}
            onChange={(e) => setWebsiteUrlInput(e.target.value)}
            error={!!urlError}
            helperText={urlError}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseUrlModal}>Cancel</Button>
          <Button onClick={handleSaveUrl} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default AgentLLM;
