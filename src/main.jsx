import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { bitable } from '@lark-base-open/js-sdk';
import '@semi-bot/semi-theme-feishu-dashboard/semi.min.css';
import './style.css';

const CONFIG_KEY = 'stage_dashboard_config_v1';

const defaultConfig = {
  tableId: '',
  viewId: '',
  todayField: '',
  totalWorkdayField: '',
  currentWorkdayField: '',
  progressField: '',
  stageField: '',
  targetProgressField: '',
  actualProgressField: '',
  title: '阶段进度'
};

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    if ('text' in v) return toNumber(v.text);
    if ('value' in v) return toNumber(v.value);
  }
  const s = String(v).replace('%', '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(toText).join('');
  if (typeof v === 'object') return v.text || v.name || v.value || JSON.stringify(v);
  return String(v);
}

function normalizePercent(v) {
  const n = toNumber(v);
  if (n === null) return null;
  return n <= 1 ? n * 100 : n;
}

function calcStageByProgress(progress) {
  if (progress === null) return 0;
  if (progress <= 33.33) return 1;
  if (progress <= 66.67) return 2;
  return 3;
}

function stageName(stage) {
  return stage === 1 ? '第一阶段' : stage === 2 ? '第二阶段' : stage === 3 ? '第三阶段' : '未识别';
}

function rangeText(total) {
  const end1 = Math.ceil(total / 3);
  const end2 = Math.ceil(total * 2 / 3);
  return {
    end1,
    end2,
    ranges: [
      `1-${end1}`,
      `${end1 + 1}-${end2}`,
      `${end2 + 1}-${total}`
    ]
  };
}

async function safeGetConfig() {
  try {
    const cfg = await bitable.dashboard.getConfig();
    return { ...defaultConfig, ...(cfg || {}) };
  } catch (e) {
    return defaultConfig;
  }
}

async function saveConfig(cfg) {
  try {
    await bitable.dashboard.setConfig(cfg);
  } catch (e) {
    console.warn('setConfig failed', e);
  }
}

async function loadTables() {
  const tables = await bitable.base.getTableMetaList();
  return tables || [];
}

async function loadViews(tableId) {
  if (!tableId) return [];
  const table = await bitable.base.getTableById(tableId);
  return await table.getViewMetaList();
}

async function loadFields(tableId, viewId) {
  if (!tableId) return [];
  const table = await bitable.base.getTableById(tableId);
  if (viewId) {
    const view = await table.getViewById(viewId);
    return await view.getFieldMetaList();
  }
  return await table.getFieldMetaList();
}

async function readTodayRow(cfg) {
  const table = await bitable.base.getTableById(cfg.tableId);
  const view = cfg.viewId ? await table.getViewById(cfg.viewId) : null;
  const ids = view ? await view.getVisibleRecordIdList() : await table.getRecordIdList();

  for (const recordId of ids) {
    const isToday = toText(await table.getCellValue(cfg.todayField, recordId));
    if (isToday === '是' || isToday.toLowerCase() === 'true' || isToday === '1') {
      const total = toNumber(await table.getCellValue(cfg.totalWorkdayField, recordId)) || 0;
      const current = toNumber(await table.getCellValue(cfg.currentWorkdayField, recordId)) || 0;
      const progress = normalizePercent(await table.getCellValue(cfg.progressField, recordId));
      const stageFromField = cfg.stageField ? toText(await table.getCellValue(cfg.stageField, recordId)) : '';
      let stage = stageFromField.includes('一') ? 1 : stageFromField.includes('二') ? 2 : stageFromField.includes('三') ? 3 : calcStageByProgress(progress);
      const target = cfg.targetProgressField ? normalizePercent(await table.getCellValue(cfg.targetProgressField, recordId)) : null;
      const actual = cfg.actualProgressField ? normalizePercent(await table.getCellValue(cfg.actualProgressField, recordId)) : null;
      return { total, current, progress, stage, target, actual };
    }
  }
  return null;
}

function ConfigPanel({ cfg, setCfg, tables, views, fields, onConfirm }) {
  const opts = fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>);
  return <div className="configWrap">
    <div className="preview"><Card data={null} cfg={cfg} isPreview /></div>
    <div className="settings">
      <h3>配置阶段卡片</h3>
      <label>标题<input value={cfg.title} onChange={e=>setCfg({...cfg,title:e.target.value})}/></label>
      <label>数据表<select value={cfg.tableId} onChange={e=>setCfg({...cfg, tableId:e.target.value, viewId:'', todayField:''})}><option value="">请选择</option>{tables.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>视图<select value={cfg.viewId} onChange={e=>setCfg({...cfg, viewId:e.target.value})}><option value="">全部记录</option>{views.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <label>是否当日字段<select value={cfg.todayField} onChange={e=>setCfg({...cfg,todayField:e.target.value})}><option value="">请选择</option>{opts}</select></label>
      <label>本月总工作日数字段<select value={cfg.totalWorkdayField} onChange={e=>setCfg({...cfg,totalWorkdayField:e.target.value})}><option value="">请选择</option>{opts}</select></label>
      <label>当月第几个工作日字段<select value={cfg.currentWorkdayField} onChange={e=>setCfg({...cfg,currentWorkdayField:e.target.value})}><option value="">请选择</option>{opts}</select></label>
      <label>工作日进度字段<select value={cfg.progressField} onChange={e=>setCfg({...cfg,progressField:e.target.value})}><option value="">请选择</option>{opts}</select></label>
      <label>阶段文本字段（可选）<select value={cfg.stageField} onChange={e=>setCfg({...cfg,stageField:e.target.value})}><option value="">按进度自动判断</option>{opts}</select></label>
      <label>阶段目标字段（可选）<select value={cfg.targetProgressField} onChange={e=>setCfg({...cfg,targetProgressField:e.target.value})}><option value="">不显示</option>{opts}</select></label>
      <label>实际完成进度字段（可选）<select value={cfg.actualProgressField} onChange={e=>setCfg({...cfg,actualProgressField:e.target.value})}><option value="">不显示</option>{opts}</select></label>
      <button onClick={onConfirm}>确定</button>
    </div>
  </div>
}

function Card({ data, cfg, isPreview=false }) {
  const demo = data || { total: 21, current: 11, progress: 52.38, stage: 2, target: 66.67, actual: null };
  const { ranges } = rangeText(demo.total || 21);
  const target = demo.target;
  const actual = demo.actual;
  const showWarn = target !== null && actual !== null && actual < target;
  return <div className="card">
    <div className="top">
      <div>
        <div className="label">{cfg.title || '阶段进度'}</div>
        <div className="stage">{stageName(demo.stage)}</div>
      </div>
      <div className="badge">{demo.current}/{demo.total}</div>
    </div>
    <div className="progressLine"><div style={{width:`${Math.min(demo.progress || 0,100)}%`}} /></div>
    <div className="progressText">工作日进度 {Number(demo.progress || 0).toFixed(2)}%</div>
    <div className="ranges">
      {[1,2,3].map((n,i)=><div key={n} className={demo.stage===n?'active':''}><span>阶段{n}</span><b>{ranges[i]}</b></div>)}
    </div>
    {target !== null && <div className="mini"><span>阶段目标</span><b>{target.toFixed(2)}%</b></div>}
    {actual !== null && <div className="mini"><span>当前完成</span><b>{actual.toFixed(2)}%</b></div>}
    {target !== null && actual !== null && <div className={showWarn?'notice warn':'notice ok'}>{showWarn ? '⚠ 当前阶段未达标' : '✅ 当前阶段已达标'}</div>}
    {isPreview && <div className="hint">预览数据，保存后读取今日记录</div>}
  </div>
}

function App() {
  const [state, setState] = useState('View');
  const [cfg, setCfg] = useState(defaultConfig);
  const [tables, setTables] = useState([]);
  const [views, setViews] = useState([]);
  const [fields, setFields] = useState([]);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async()=>{
      const s = await bitable.dashboard.getState().catch(()=> 'View');
      setState(s);
      const c = await safeGetConfig();
      setCfg(c);
      setTables(await loadTables());
    })();
  }, []);

  useEffect(()=>{ loadViews(cfg.tableId).then(setViews).catch(()=>setViews([])); }, [cfg.tableId]);
  useEffect(()=>{ loadFields(cfg.tableId, cfg.viewId).then(setFields).catch(()=>setFields([])); }, [cfg.tableId, cfg.viewId]);

  useEffect(()=>{
    if (!cfg.tableId || !cfg.todayField || !cfg.totalWorkdayField || !cfg.currentWorkdayField || !cfg.progressField) return;
    readTodayRow(cfg).then(setData).catch(e=>setErr(String(e?.message || e)));
    const off = bitable.base.onDataChange?.(()=> readTodayRow(cfg).then(setData).catch(()=>{}));
    return () => off?.();
  }, [cfg]);

  async function confirm() { await saveConfig(cfg); setState('View'); readTodayRow(cfg).then(setData); }

  if (state === 'Create' || state === 'Config') return <ConfigPanel cfg={cfg} setCfg={setCfg} tables={tables} views={views} fields={fields} onConfirm={confirm}/>;
  if (!cfg.tableId) return <div className="empty">请先配置阶段进度插件</div>;
  if (err) return <div className="empty">读取失败：{err}</div>;
  if (!data) return <div className="empty">未找到“是否当日=是”的记录</div>;
  return <Card data={data} cfg={cfg} />;
}

createRoot(document.getElementById('root')).render(<App />);
