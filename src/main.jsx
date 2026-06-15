import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { bitable } from '@lark-base-open/js-sdk';
import './styles.css';

const FIELD_NAMES = {
  isToday: '是否当日',
  totalWorkdays: '本月总工作日数',
  currentWorkday: '当月第几个工作日',
  stageText: '当前日期所处阶段',
  progress: '当前日期所处工作日进度',
  stageCode: '当前阶段编码',
  stage1End: '第一阶段截止',
  stage2End: '第二阶段截止',
};

const DEMO = {
  stageText: '第二阶段',
  stageCode: 2,
  currentWorkday: 11,
  totalWorkdays: 21,
  progress: 52.38,
  stage1End: 7,
  stage2End: 14,
  source: '本地预览数据'
};

function normalizeValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    return normalizeValue(value[0]);
  }
  if (typeof value === 'object') {
    if ('text' in value) return value.text;
    if ('name' in value) return value.name;
    if ('value' in value) return value.value;
    if ('title' in value) return value.title;
    if ('id' in value) return value.id;
  }
  return String(value);
}

function toNumber(value, fallback = 0) {
  const raw = normalizeValue(value);
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw).replace('%', '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function toPercent(value) {
  const n = toNumber(value, 0);
  return n <= 1 ? n * 100 : n;
}

function isYes(value) {
  const v = String(normalizeValue(value)).trim();
  return v === '是' || v === 'true' || v === 'TRUE' || v === '1';
}

async function getFieldByName(table, name) {
  try {
    return await table.getField(name);
  } catch (_) {
    return null;
  }
}

async function readLiveData() {
  if (!bitable?.base?.getActiveTable) {
    throw new Error('当前不是飞书多维表格插件环境');
  }

  const table = await bitable.base.getActiveTable();
  const fieldMap = {};
  await Promise.all(Object.entries(FIELD_NAMES).map(async ([key, name]) => {
    fieldMap[key] = await getFieldByName(table, name);
  }));

  const required = ['isToday', 'totalWorkdays', 'currentWorkday', 'stageText', 'progress', 'stage1End', 'stage2End'];
  const missing = required.filter(k => !fieldMap[k]);
  if (missing.length) {
    throw new Error(`缺少字段：${missing.map(k => FIELD_NAMES[k]).join('、')}`);
  }

  const recordIds = await table.getRecordIdList();
  let todayRecordId = null;

  for (const recordId of recordIds) {
    const val = await fieldMap.isToday.getValue(recordId);
    if (isYes(val)) {
      todayRecordId = recordId;
      break;
    }
  }

  if (!todayRecordId) {
    throw new Error('没有找到「是否当日 = 是」的记录');
  }

  const data = {};
  for (const [key, field] of Object.entries(fieldMap)) {
    if (!field) continue;
    data[key] = await field.getValue(todayRecordId);
  }

  const stageText = String(normalizeValue(data.stageText) || '未知阶段');
  const totalWorkdays = toNumber(data.totalWorkdays);
  const currentWorkday = toNumber(data.currentWorkday);
  const stage1End = toNumber(data.stage1End);
  const stage2End = toNumber(data.stage2End);
  const progress = toPercent(data.progress);
  let stageCode = toNumber(data.stageCode);
  if (!stageCode) {
    if (stageText.includes('第一')) stageCode = 1;
    else if (stageText.includes('第二')) stageCode = 2;
    else if (stageText.includes('第三')) stageCode = 3;
  }

  return {
    stageText,
    stageCode,
    currentWorkday,
    totalWorkdays,
    progress,
    stage1End,
    stage2End,
    source: '飞书实时数据'
  };
}

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const live = await readLiveData();
      setData(live);
    } catch (e) {
      console.warn(e);
      setError(e?.message || '读取飞书数据失败');
      setData(DEMO);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    let off;
    try {
      if (bitable?.base?.onDataChange) {
        off = bitable.base.onDataChange(load);
      }
    } catch (_) {}
    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  const stageRanges = useMemo(() => {
    const total = data?.totalWorkdays || 0;
    const a = data?.stage1End || 0;
    const b = data?.stage2End || 0;
    return [
      { code: 1, title: '阶段①', range: total ? `1-${a}` : '--' },
      { code: 2, title: '阶段②', range: total ? `${a + 1}-${b}` : '--' },
      { code: 3, title: '阶段③', range: total ? `${b + 1}-${total}` : '--' },
    ];
  }, [data]);

  if (loading && !data) return <div className="center">正在读取阶段数据...</div>;

  const progress = Math.max(0, Math.min(100, data?.progress || 0));

  return (
    <main className="card">
      <section className="hero">
        <div>
          <div className="label">当前阶段</div>
          <div className="stage">{data.stageText}</div>
        </div>
        <div className="badge">{data.source}</div>
      </section>

      <section className="metrics">
        <div className="metric">
          <span>当前工作日</span>
          <strong>{data.currentWorkday || '-'} / {data.totalWorkdays || '-'}</strong>
        </div>
        <div className="metric">
          <span>工作日进度</span>
          <strong>{progress.toFixed(2)}%</strong>
        </div>
      </section>

      <section className="progressBox">
        <div className="progressTrack">
          <div className="progressBar" style={{ width: `${progress}%` }} />
        </div>
        <div className="marks">
          <span>0%</span><span>33.33%</span><span>66.67%</span><span>100%</span>
        </div>
      </section>

      <section className="ranges">
        {stageRanges.map(item => (
          <div key={item.code} className={`range ${data.stageCode === item.code ? 'active' : ''}`}>
            <span>{item.title}</span>
            <strong>{item.range}</strong>
          </div>
        ))}
      </section>

      {error && (
        <section className="notice">
          本地预览/读取失败：{error}<br />
          放进飞书仪表盘后会自动读取「是否当日=是」这一行。
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
