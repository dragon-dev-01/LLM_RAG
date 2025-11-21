/* eslint-disable react/jsx-max-props-per-line */
import React, { ChangeEvent, useEffect, useState, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import Papa from 'papaparse';
import {
  Grid, Tab, Tabs, Divider, Container, Card, Box, useTheme, Checkbox, CardHeader, Table,
  TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, Button, TextField,
  IconButton, Collapse, Typography, CardContent, MenuItem, FormControlLabel, CircularProgress
} from '@mui/material';
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  PlayArrow as PlayArrowIcon,
  FileUpload as FileUploadIcon,
  Download as DownloadIcon,
  Settings,
  Tune,
  Layers
} from '@mui/icons-material';

import PageTitleWrapper from 'src/components/PageTitleWrapper';
import Footer from 'src/components/Footer';
import PageHeader from './components/PageHeader';
import TabsContainerWrapper from './components/TabsContainerWrapper';

function DashboardLLM() {
  const theme = useTheme();
  const API_HOST = process.env.REACT_APP_API_HOST;
  const POD_API_HOST = (id: string) => `https://${id}.proxy.runpod.net`;
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [currentTab, setCurrentTab] = useState<'llm'|'vlm'>('llm');

  // Use a single "mode" for logic
  const isLLM = (currentTab === 'llm');
  const isVLM = !isLLM;

  interface DataRow {
    checked: boolean;
    input: string;
    output: string;
    image?: string | null;
    file?: File;
  }

  const [searchParams] = useSearchParams();
  const [retrainFlag, setRetrainFlag] = useState('');
  const queryModelId = searchParams.get('model_id') || '';

  const podCastIDRef = useRef("");
  const [podCastID, setPodCastID] = useState('');

  const dotIntervalRef = useRef<NodeJS.Timeout|null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout|null>(null);

  // Common states for LLM or VLM
  const [modelName, setModelName] = useState('');
  const [baseModel, setBaseModel] = useState('');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<DataRow[]>([
    {
      checked: false,
      input: '',   // changed here
      output: '',  // changed here
      image: isVLM ? null : undefined,
      file: undefined
    }
  ]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isUploadingCSV, setIsUploadingCSV] = useState(false);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isFinetuning, setIsFinetuning] = useState(false);
  const [logMessage, setLogMessage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [startStreaming, setStartStreaming] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [dotCount, setDotCount] = useState(2);

  // Hyperparams
  const [epoch, setEpoch] = useState(1);
  const [learningRate, setLearningRate] = useState(0.000005);
  const [warmupRatio, setWarmupRatio] = useState(0.1);
  const [optim, setOptim] = useState('adamw_torch_fused');
  const [gradientSteps, setGradientSteps] = useState(8);
  const [peftR, setPeftR] = useState(16);
  const [peftAlpha, setPeftAlpha] = useState(16);
  const [peftDropout, setPeftDropout] = useState(0.0);

  // Deploy
  const [deployOnly, setDeployOnly] = useState(false);
  const [runpodApiKey, setRunpodApiKey] = useState('');

  // Errors
  const [errors, setErrors] = useState({
    modelName: '', baseModel: '', description: '', epoch: '', learningRate: '',
    warmupRatio: '', optimizer: '', gradientSteps: '', peftR: '', peftAlpha: '',
    peftDropout: '', rows: [] as { input: string; output: string }[]
  });

  // Tabs
  const tabList = [
    { value: 'llm', label: 'Finetune LLM' },
    { value: 'vlm', label: 'Finetune VLM' }
  ];

  // Fetch user from localStorage
  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) {
      try { setUser(JSON.parse(u)); } catch {}
    }
  }, []);

  // If retrain
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

  // On mount or user changes
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

  // Switch tabs -> reset relevant states
  const handleTabChange = (_: ChangeEvent<{}>, val: 'llm'|'vlm') => {
    if (isFinetuning){
      alert("Finetuning is already running..")
      return;
    }
    setCurrentTab(val);
    setModelName('');
    setBaseModel(val === 'llm' ? 'DeepSeek-R1-Qwen-7B' : 'Qwen2VL');
    setDescription('');
    setRows([
      {
        checked: false,
        input: '',   // changed here
        output: '',  // changed here
        image: isVLM ? null : undefined,
        file: undefined
      }
    ]);
    setPage(0);
    setRowsPerPage(10);
    setIsUploadingCSV(false);
    setShowAdvanced(false);
    setIsFinetuning(false);
    setLogMessage('');
    setLogs([]);
    setStartStreaming(false);
    setIsDownloading(false);
    setDotCount(2);

    setEpoch(val === 'llm' ? 2 : 2);
    setLearningRate(val === 'llm' ? 0.000005 : 0.00005);
    setWarmupRatio(0.1);
    setOptim('adamw_torch_fused');
    setGradientSteps(8);
    setPeftR(val === 'llm' ? 16 : 16);
    setPeftAlpha(val === 'llm' ? 16 : 16);
    setPeftDropout(val === 'llm' ? 0.0 : 0.01);
    setDeployOnly(false);
    setRunpodApiKey('');
    setErrors({
      modelName: '', baseModel: '', description: '', epoch: '', learningRate: '',
      warmupRatio: '', optimizer: '', gradientSteps: '', peftR: '', peftAlpha: '',
      peftDropout: '', rows: []
    });
  };

  // Helpers
  const canTrain = () => {
    if (!user?.email) return false;
    if (isFinetuning) return false;
    if (retrainFlag) return true;
    return podCastID === '';
  };

  const getStartIcon = () => {
    if (!user?.email) return <PlayArrowIcon />;
    if (!canTrain()) return <CircularProgress size={20} color="inherit" />;
    return <PlayArrowIcon />;
  };

  const getButtonText = () => {
    if (isFinetuning) return 'Finetuning...';
    if (retrainFlag) return 'Continue Finetuning';
    return 'Start Finetuning';
  };

  const handleFieldChange = (f: 'modelName'|'description', val: string) => {
    if (f === 'modelName') {
      setModelName(val);
      setErrors(e => ({...e, modelName: val?'':'Model name is required'}));
    } else if (f === 'description') {
      setDescription(val);
      setErrors(e => ({...e, description: val?'':'Description is required'}));
    }
  };

  // Table
  const handlePageChange = (_:unknown, p:number)=> setPage(p);
  const handleRowsPerPageChange = (e:React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(+e.target.value);
    setPage(0);
  };
  const handleCheckboxChange = (i:number) => {
    setRows(r=>{ const u=[...r]; u[i].checked=!u[i].checked; return u; });
  };
  const handleInputChange = (i:number, val:string) => {
    setRows(r=>{ const u=[...r]; u[i].input=val; return u; });
    setErrors(es=>{
      if (es.rows[i]?.input) es.rows[i].input = val?'':'Input required';
      return {...es};
    });
  };
  const handleOutputChange = (i:number, val:string) => {
    setRows(r=>{ const u=[...r]; u[i].output=val; return u; });
    setErrors(es=>{
      if (es.rows[i]?.output) es.rows[i].output = val?'':'Output required';
      return {...es};
    });
  };
  const handleAddRow = () => {
    setRows(r=>[...r,{checked:false, input:'',output:'',image: isVLM?null:undefined}]);
  };
  const handleRemoveRow = (i:number) => {
    setRows(r=> r.filter((_,idx)=> idx!==i));
  };

  // CSV
  const handleCSVUpload = async (e:React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setIsUploadingCSV(true);
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const txt = reader.result?.toString().trim() || '';
      if (!txt) { setIsUploadingCSV(false); return; }
      Papa.parse(txt, {
        header: true, skipEmptyLines:true, dynamicTyping:false,
        complete:(res)=>{
          if (!res.data || res.data.length===0) { setIsUploadingCSV(false); return; }
          const arr = res.data as any[];
          const newRows = arr.map(o => ({
            checked:false,
            input:o.input||'',
            output:o.output||'',
            image: isVLM ? (o.image_url||null): undefined,
            file: undefined
          }));
          setRows(prev=>{
            const upd=[...prev,...newRows];
            if (upd.length && !upd[0].input && !upd[0].output) upd.shift();
            return upd;
          });
          setIsUploadingCSV(false);
        },
        error:()=> setIsUploadingCSV(false)
      });
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = isLLM ? '/upload_template_llm.csv':'/upload_template.csv';
    link.download = isLLM ? 'upload_template_llm.csv':'upload_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Validate
  const validateAllFields = () => {
    let rowErr:Array<{input:string;output:string}>=[];
    if (!deployOnly) {
      rowErr=rows.map(r=>({
        input: r.input?'':'Input required',
        output:r.output?'':'Output required'
      }));
    }
    const e = {
      modelName: modelName?'':'Model name is required',
      baseModel: baseModel?'':'Base model is required',
      description: description?'':'Description is required',
      epoch: epoch>0?'':'Epoch>0',
      learningRate: learningRate>0?'':'LR>0',
      warmupRatio: warmupRatio>=0 && warmupRatio<=1?'':'0<=ratio<=1',
      optimizer: optim?'':'Choose optimizer',
      gradientSteps: gradientSteps>0?'':'GradSteps>0',
      peftR: peftR>0?'':'peftR>0',
      peftAlpha: peftAlpha>0?'':'peftAlpha>0',
      peftDropout: peftDropout>=0 && peftDropout<=1?'':'0<=dropout<=1',
      rows: rowErr
    };
    setErrors(e);
    const hasRowErr = rowErr.some(rr=>Object.values(rr).some(v=>v!==''));
    const hasFieldErr = Object.entries(e).some(([k,v])=> k!=='rows' && v!=='');
    return !hasRowErr && !hasFieldErr;
  };

  // Start Finetuning
  const handleStartFinetuning = async () => {
    if (!validateAllFields()) return;
    if (retrainFlag && rows.length===0) {
      alert('Cannot retrain with zero data rows!');
      return;
    }
    if (!deployOnly && rows.some(r=>!r.input||!r.output)) {
      alert('Please fill all input/output fields!');
      return;
    }
    setIsFinetuning(true);
    try {
      // If brand new (not retrain), do /finetune first
      if (!retrainFlag) {
        const body = {
          email:user?.email||'', model_name:modelName, model_type:baseModel, description,
          is_llm:isLLM, runpod_api_key:runpodApiKey||null, peft_r:peftR, peft_alpha:peftAlpha, peft_dropout:peftDropout
        };
        const finRes = await fetch(`${API_HOST}/finetune`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(body)
        });
        if (!finRes.ok) { setIsFinetuning(false); return; }
        // Wait 30s
        let s=60; setLogMessage(`Creating docker image ${s} seconds remaining... (DO NOT REFRESH/CLOSE PAGE)`);
        await new Promise<void>(r=>{
          const it=setInterval(()=>{
            s-=1;
            if (s>0) setLogMessage(`Creating docker image ${s} seconds remaining... (DO NOT REFRESH/CLOSE PAGE)`);
            else {clearInterval(it);setLogMessage(''); r();}
          },1000);
        });
      }
      // Dot animation
      let d=0; setLogMessage('Preparing docker image (DO NOT REFRESH/CLOSE PAGE)');
      const dotInt=setInterval(()=>{
        d=(d%6)+1;
        setLogMessage(`Preparing docker image${'.'.repeat(d)} (DO NOT REFRESH/CLOSE PAGE)`);
      },2000);

      const poll=async()=>{
        try {
          const head=await fetch(`${POD_API_HOST(podCastIDRef.current)}/logs`,{method:'HEAD'});
          if (head.ok) {
            clearInterval(pi); clearInterval(dotInt);
            setLogMessage(''); setStartStreaming(true);
            const dataToSend = deployOnly?[]: rows.map((r,i)=>({rowIndex:i,input:r.input,output:r.output}));
            const meta = {
              user_email:user?.email||'', model_name:modelName, model_type:baseModel, description,
              epochs:epoch, learning_rate:learningRate, warmup_ratio:warmupRatio, optimizer:optim,
              gradient_accumulation_steps:gradientSteps, peft_r:peftR, peft_alpha:peftAlpha,
              peft_dropout:peftDropout, data:dataToSend, model_id:podCastIDRef.current,
              retrain_flag: retrainFlag||''
            };
            if (isLLM) {
              const r=await fetch(`${POD_API_HOST(podCastIDRef.current)}/run_model_llm`,{
                method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify(meta)
              });
              if (!r.ok) throw new Error('Fail start LLM finetuning');
            } else {
              const formData=new FormData();
              formData.append('data',JSON.stringify(meta));
              rows.forEach(r=>{
                if(r.file) formData.append('files',r.file);
              });
              const r=await fetch(`${POD_API_HOST(podCastIDRef.current)}/run_model`,{
                method:'POST',body:formData
              });
              if(!r.ok) throw new Error('Fail start VLM finetuning');
            }
          }
        } catch {}
      };
      poll();
      const pi=setInterval(poll,30000);
    } catch {
      setIsFinetuning(false);
    }
  };

  // Streaming logs
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

  // Watch logs
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
          await fetch(`${API_HOST}/finished_finetuning?podcast_id=${encodeURIComponent(podCastIDRef.current)}&is_llm=${isLLM}`);
        }catch{}
      })();
    }
  },[logs,API_HOST,isLLM]);

  // Animate "Downloading shards"
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

  return (
    <>
      <Helmet><title>VAIS Console</title></Helmet>
      <PageTitleWrapper><PageHeader/></PageTitleWrapper>
      <Container maxWidth="lg">
        <TabsContainerWrapper>
          <Tabs value={currentTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" disabled={isFinetuning}>
            {tabList.map(t=> <Tab key={t.value} label={t.label} value={t.value as 'llm'|'vlm'}/>)}
          </Tabs>
        </TabsContainerWrapper>

        <Card>
          <Grid container spacing={0}>
            {/* Model Settings */}
            <Grid item xs={12}>
              <Box p={4}>
                <Card>
                  <CardHeader title="Model Settings"/>
                  <Divider/>
                  <Box p={4}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth variant="outlined"
                          label="Tuned Model Name" placeholder="Enter model name"
                          value={modelName}
                          onChange={e=>handleFieldChange('modelName', e.target.value)}
                          error={!!errors.modelName} helperText={errors.modelName}
                          disabled={!!retrainFlag}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          select fullWidth variant="outlined"
                          label="Choose Base Model" value={baseModel}
                          onChange={e=> setBaseModel(e.target.value)}
                          SelectProps={{native:true}}
                          error={!!errors.baseModel} helperText={errors.baseModel}
                          disabled={!!retrainFlag}
                        >
                          {isLLM ? (
                            <>
                              <optgroup label="Instruct Models">
                                <option value="DeepSeek-R1-Qwen-7B">DeepSeek-R1-Qwen-7B</option>
                                <option value="DeepSeek-R1-Llama-8B">DeepSeek-R1-Llama-8B</option>
                                <option value="DeepSeek-R1-Distill-32B">DeepSeek-R1-Distill-32B-4bit</option>
                                <option value="Meta-Llama-3.1-8B">Meta-Llama-3.1-8B</option>
                                <option value="Mistral-7B">Mistral-7B</option>
                                <option value="Mistral-7B-Instruct-v0.3">Mistral-7B-IT</option>
                                <option value="Phi-3-mini-4k-instruct">Phi-3-mini-4k</option>
                                <option value="Phi-3.5-mini">Phi-3.5-mini</option>
                                <option value="Phi-4">Phi-4</option>
                                <option value="Qwen2.5-1.5B">Qwen2.5-1.5B</option>
                                <option value="Qwen2.5-3B">Qwen2.5-3B</option>
                                <option value="Qwen2.5-7B">Qwen2.5-7B</option>
                                <option value="SmolLM2-135M">SmolLM2-135M</option>
                                <option value="SmolLM2-360M">SmolLM2-360M</option>
                                <option value="SmolLM2-1.7B">SmolLM2-1.7B</option>
                              </optgroup>
                              <optgroup label="Code Models">
                                <option value="CodeLlama-7B">CodeLlama-7B</option>
                                <option value="Qwen2.5-Coder-1.5B-Instruct">Qwen2.5-Coder-1.5B</option>
                                <option value="Qwen2.5-Coder-7B-Instruct">Qwen2.5-Coder-7B</option>
                              </optgroup>
                              <optgroup label="Math Models">
                                <option value="Qwen2.5-Math-1.5B-Instruct">Qwen2.5-Math-1.5B-Instruct</option>
                                <option value="Qwen2.5-Math-7B-Instruct">Qwen2.5-Math-7B-Instruct</option>
                              </optgroup>
                            </>
                          ) : (
                            <>
                              <option value="Qwen2VL">Qwen2-VL</option>
                              <option value="Qwen2VL-Mini">Qwen2-VL-Mini</option>
                              <option value="Qwen2.5VL">Qwen2.5-VL</option>
                              <option value="Llama3.2V">Llama3.2V</option>
                              <option value="Llava1.5">Llava1.5</option>
                              <option value="Llava1.6-Mistral">Llava1.6-Mistral</option>
                              <option value="Phi3V">Phi3-V</option>
                              <option value="Phi3.5V">Phi3.5-V</option>
                              <option value="Pixtral">Pixtral</option>
                            </>
                          )}
                        </TextField>
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth multiline minRows={2} variant="outlined"
                          label="Description" placeholder="Enter description"
                          value={description}
                          onChange={e=>handleFieldChange('description', e.target.value)}
                          error={!!errors.description} helperText={errors.description}
                          disabled={!!retrainFlag}
                        />
                      </Grid>
                    </Grid>
                  </Box>
                </Card>

                <Card sx={{mt:2}}>
                  <CardHeader
                    title="Advanced Settings"
                    action={
                      <IconButton onClick={()=>setShowAdvanced(!showAdvanced)}>
                        {showAdvanced? <ExpandLessIcon/>:<ExpandMoreIcon/>}
                      </IconButton>
                    }
                  />
                  <Collapse in={showAdvanced}>
                    <Divider/>
                    <CardContent>
                      <Box sx={{ mb:4 }}>
                        <Typography variant="h6" sx={{ mb:2,display:'flex',alignItems:'center' }}>
                          <Settings fontSize="small" sx={{mr:1}}/> Hyperparameters
                        </Typography>
                        <TextField
                          label="Epoch" type="number" sx={{m:1,width:'25ch'}}
                          value={epoch} onChange={e=>setEpoch(+e.target.value)}
                          error={!!errors.epoch} helperText={errors.epoch}
                        />
                        <TextField
                          label="Learning Rate" type="number" sx={{m:1,width:'25ch'}}
                          value={learningRate} onChange={e=>setLearningRate(+e.target.value)}
                          error={!!errors.learningRate} helperText={errors.learningRate}
                        />
                        <TextField
                          label="Warmup Ratio" type="number" sx={{m:1,width:'25ch'}}
                          value={warmupRatio} onChange={e=>setWarmupRatio(+e.target.value)}
                          error={!!errors.warmupRatio} helperText={errors.warmupRatio}
                        />
                      </Box>
                      <Divider sx={{my:3}}/>
                      <Box sx={{ mb:4 }}>
                        <Typography variant="h6" sx={{ mb:2,display:'flex',alignItems:'center' }}>
                          <Tune fontSize="small" sx={{mr:1}}/> Gradients
                        </Typography>
                        <TextField
                          label="Optimizer" select sx={{m:1,width:'25ch'}}
                          value={optim} onChange={e=>setOptim(e.target.value)}
                          error={!!errors.optimizer} helperText={errors.optimizer}
                        >
                          <MenuItem value="adamw_torch_fused">adamw_torch_fused</MenuItem>
                          <MenuItem value="adamw_torch">adamw_torch</MenuItem>
                          <MenuItem value="adamw_hf">adamw_hf</MenuItem>
                        </TextField>
                        <TextField
                          label="Gradient Accumulation Steps" type="number" sx={{m:1,width:'25ch'}}
                          value={gradientSteps} onChange={e=>setGradientSteps(+e.target.value)}
                          error={!!errors.gradientSteps} helperText={errors.gradientSteps}
                        />
                      </Box>
                      <Divider sx={{my:3}}/>
                      <Box>
                        <Typography variant="h6" sx={{ mb:2,display:'flex',alignItems:'center' }}>
                          <Layers fontSize="small" sx={{mr:1}}/> LoRA
                        </Typography>
                        <TextField
                          label="Peft R" type="number" sx={{m:1,width:'25ch'}}
                          value={peftR} onChange={e=>setPeftR(+e.target.value)}
                          error={!!errors.peftR} helperText={errors.peftR}
                          disabled={!!retrainFlag}
                        />
                        <TextField
                          label="Peft Alpha" type="number" sx={{m:1,width:'25ch'}}
                          value={peftAlpha} onChange={e=>setPeftAlpha(+e.target.value)}
                          error={!!errors.peftAlpha} helperText={errors.peftAlpha}
                          disabled={!!retrainFlag}
                        />
                        <TextField
                          label="Peft Dropout" type="number" sx={{m:1,width:'25ch'}}
                          value={peftDropout} onChange={e=>setPeftDropout(+e.target.value)}
                          error={!!errors.peftDropout} helperText={errors.peftDropout}
                          disabled={!!retrainFlag}
                        />
                      </Box>
                      <Divider sx={{my:3}}/>
                      <Box>
                        <Typography variant="h6" sx={{ mb:2 }}>Custom Runpod API Key (Optional)</Typography>
                        <TextField
                          label="Runpod API Key" variant="outlined" sx={{m:1,width:'75ch'}}
                          value={runpodApiKey} onChange={e=>setRunpodApiKey(e.target.value)}
                        />
                      </Box>
                    </CardContent>
                  </Collapse>
                </Card>
              </Box>
            </Grid>

            {/* Structured Data Table */}
            <Grid item xs={12}>
              <Divider/>
              <Box p={4} sx={{background:theme.colors.alpha.black[5]}}>
                <Card>
                  <CardHeader
                    title="Create Structured Data"
                    action={
                      <FormControlLabel
                        control={
                          <Checkbox color="primary" checked={deployOnly}
                            onChange={e=>setDeployOnly(e.target.checked)}
                            disabled={!!retrainFlag}
                          />
                        }
                        label="Deploy model only"
                      />
                    }
                  />
                  <Divider/>
                  {!deployOnly && (
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell padding="checkbox"><Checkbox color="primary"/></TableCell>
                            {isVLM && <TableCell>Image</TableCell>}
                            <TableCell>Input</TableCell>
                            <TableCell>Output</TableCell>
                            <TableCell align="center" width={70}>X</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.slice(page*rowsPerPage, page*rowsPerPage+rowsPerPage).map((row,idx)=>{
                            const realIdx=idx+page*rowsPerPage;
                            return(
                              <TableRow key={realIdx} sx={{verticalAlign:'top'}}>
                                <TableCell sx={{width:'3%'}} padding="checkbox">
                                  <Checkbox color="primary" checked={row.checked}
                                    onChange={()=>handleCheckboxChange(realIdx)}
                                  />
                                </TableCell>

                                {isVLM && (
                                  <TableCell sx={{width:'20%'}}>
                                    {row.image && (
                                      <Box component="img" src={row.image} alt=""
                                        sx={{width:'100%',height:'auto',objectFit:'contain',mb:1,borderRadius:1}}
                                      />
                                    )}
                                    <Box>
                                      <Button variant="outlined" component="label" disabled={false}>
                                        Upload
                                        <input type="file" hidden accept="image/*"
                                          onChange={e=>{
                                            if(!e.target.files?.[0])return;
                                            const f=e.target.files[0];
                                            const url=URL.createObjectURL(f);
                                            setRows(r=>{
                                              const u=[...r];
                                              u[realIdx].image=url;
                                              u[realIdx].file=f;
                                              return u;
                                            });
                                          }}
                                        />
                                      </Button>
                                    </Box>
                                  </TableCell>
                                )}

                                <TableCell>
                                  <TextField
                                    variant="outlined" multiline minRows={3} fullWidth
                                    value={row.input}
                                    onChange={e=>handleInputChange(realIdx, e.target.value)}
                                    error={!!errors.rows[realIdx]?.input}
                                    helperText={errors.rows[realIdx]?.input}
                                    placeholder="The user's input"
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    variant="outlined" multiline minRows={3} fullWidth
                                    value={row.output}
                                    onChange={e=>handleOutputChange(realIdx, e.target.value)}
                                    error={!!errors.rows[realIdx]?.output}
                                    helperText={errors.rows[realIdx]?.output}
                                    placeholder="The model's response"
                                  />
                                </TableCell>
                                <TableCell align="center" sx={{width:'3%'}}>
                                  <IconButton color="error" size="small" 
                                    onClick={()=>handleRemoveRow(realIdx)}
                                    disabled={rows.length===1 && !!retrainFlag}
                                  ><CloseIcon/></IconButton>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                  <Box p={2} display="flex" alignItems="center" justifyContent="space-between">
                    <TablePagination
                      component="div" count={rows.length} page={page}
                      onPageChange={handlePageChange} rowsPerPage={rowsPerPage}
                      onRowsPerPageChange={handleRowsPerPageChange}
                      rowsPerPageOptions={[5,10,25,50]}
                    />
                    <Box display="flex" alignItems="center">
                      <Button variant="contained" onClick={handleAddRow} sx={{mr:1}} disabled={deployOnly}>
                        Add Row
                      </Button>
                      <Button variant="outlined" onClick={handleDownloadTemplate} startIcon={<DownloadIcon/>} sx={{mr:1}} disabled={deployOnly}>
                        Template
                      </Button>
                      <Button
                        variant="outlined" component="label" sx={{mr:1}}
                        startIcon={isUploadingCSV?<CircularProgress size={16} color="inherit"/>:<FileUploadIcon/>}
                        disabled={isUploadingCSV||deployOnly}
                      >
                        {isUploadingCSV?'Uploading...':'Upload CSV'}
                        <input type="file" hidden accept=".csv" onChange={handleCSVUpload}/>
                      </Button>
                      <Box>
                        <span style={{fontSize:'0.7em',color:'white',lineHeight:'1.2em'}}>
                          *input, output<br />{isVLM? '& image_url ':''} columns
                        </span>
                      </Box>
                    </Box>
                  </Box>
                </Card>
              </Box>
              <Divider/>
            </Grid>

            {/* Logs + Start Finetuning */}
            <Grid item xs={12}>
              <Box p={4} sx={{background:theme.colors.alpha.white[70]}}>
                <Button
                  variant="contained" color="info" fullWidth sx={{mb:2}}
                  onClick={handleStartFinetuning}
                  startIcon={getStartIcon()}
                  disabled={!canTrain()}
                >
                  {getButtonText()}
                </Button>
                {!user?.email && (
                  <Typography variant="subtitle1" sx={{mb:2,color:'white'}}>
                    *Please sign in to start finetuning
                  </Typography>
                )}
                <Card>
                  <CardHeader title="Logs"/>
                  <Divider/>
                  <Box p={2} sx={{
                    backgroundColor:'rgba(0,0,0,0.8)',color:'white',
                    overflowY:'auto',maxHeight:400,fontFamily:'monospace',whiteSpace:'pre-wrap'
                  }}>
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
      <Footer/>
    </>
  );
}

export default DashboardLLM;
