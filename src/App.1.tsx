import React, { useState, useEffect } from 'react';
import { STORAGE_KEY, firebaseConfig, ADMIN_PASSWORD } from './App';

export const App = () => {
  const [view, setView] = useState('form');
  const [db, setDb] = useState(null);
  const [status, setStatus] = useState('initializing');
  const [logs, setLogs] = useState([]);

  const getTodayString = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().split('T')[0];
  };

  const today = getTodayString();
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  const [filter, setFilter] = useState({
    startDate: firstDayOfMonth,
    endDate: today
  });

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  const [formData, setFormData] = useState({
    date: today,
    authorId: '',
    customerName: '',
    supportOrder: 1,
    method: '전화',
    types: [],
    matrix: { "의사랑": [], "부가": [], "기타": [] },
    hours: 0,
    minutes: 0,
    content: ''
  });

  // 초기화: 로컬스토리지 정리 및 날짜 설정
  useEffect(() => {
    const currentToday = getTodayString();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('lastAuthorId');
    localStorage.removeItem('serviceAuthorId');

    setFormData(prev => ({
      ...prev,
      date: currentToday,
      authorId: ''
    }));
    setFilter(prev => ({ ...prev, endDate: currentToday }));
  }, []);

  // Firebase 초기화
  useEffect(() => {
    const loadFirebase = async () => {
      try {
        const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
        const firestore = getFirestore(app);

        setDb(firestore);
        setStatus('idle');
      } catch (error) {
        console.error("Firebase 로딩 실패:", error);
        setStatus('error');
      }
    };
    loadFirebase();
  }, []);

  const options = {
    methods: ["전화", "전화+원격", "방문"],
    types: ["영업/납품/교육", "서비스"],
    items: ["의사랑", "부가", "기타"],
    rows: [
      { id: 'row1', label: '상담', group: '영업/납품/교육' },
      { id: 'row2', label: '계약서 작성', group: '영업/납품/교육' },
      { id: 'row3', label: '납품/설치', group: '영업/납품/교육' },
      { id: 'row4', label: '교육', group: '영업/납품/교육' },
      { id: 'row5', label: '기능 사용 문의', group: '서비스' },
      { id: 'row6', label: 'DB 장애 대응(S/C)', group: '서비스' },
      { id: 'row7', label: '각종 오류 대응', group: '서비스' },
      { id: 'row8', label: '연동 장애 대응', group: '서비스' },
      { id: 'row9', label: '재설치', group: '서비스' },
      { id: 'row10', label: '고객 관리(결제 등)', group: 'common' },
      { id: 'row11', label: '단순 응대(일정 등)', group: 'common' },
    ]
  };

  const fetchLogs = async () => {
    if (!db) return;
    setStatus('loading');
    try {
      const { collection, getDocs, query, orderBy } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      const q = query(collection(db, 'service_logs'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetchedLogs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(fetchedLogs);
      setStatus('idle');
    } catch (error) {
      console.error("데이터 조회 실패:", error);
      setStatus('error');
    }
  };

  useEffect(() => {
    if (view === 'admin' && isAdminAuthenticated && db) {
      fetchLogs();
    }
  }, [view, isAdminAuthenticated, db]);

  const filteredLogs = logs.filter(log => {
    if (!log.createdAt) return false;
    const createdDate = log.createdAt.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
    const logDateStr = createdDate.toISOString().split('T')[0];
    return logDateStr >= filter.startDate && logDateStr <= filter.endDate;
  });

  const handleAdminAccess = () => {
    if (isAdminAuthenticated) {
      setView('admin');
      return;
    }
    const pw = prompt("관리자 비밀번호를 입력하세요.");
    if (pw === ADMIN_PASSWORD) {
      setIsAdminAuthenticated(true);
      setView('admin');
    } else if (pw !== null) {
      alert("비밀번호가 올바르지 않습니다.");
    }
  };

  const formatMatrix = (matrix) => {
    if (!matrix) return "";
    return Object.entries(matrix)
      .filter(([_, values]) => values && values.length > 0)
      .map(([key, values]) => `${key}: ${values.join(", ")}`)
      .join(" | ");
  };

  const downloadCSV = () => {
    if (filteredLogs.length === 0) {
      alert("해당 기간에 데이터가 없습니다.");
      return;
    }
    const headers = ["작성일시(Server)", "지원일자(Input)", "담당자", "고객명", "순번", "방법", "유형", "항목(Matrix)", "지원시간(분)", "상세내용"].join(",");
    const rows = filteredLogs.map(log => {
      const createdDate = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString() : "";
      return [
        `"${createdDate}"`,
        log.date,
        `"${log.authorId}"`,
        `"${log.customerName}"`,
        log.supportOrder,
        log.method,
        `"${(log.types || []).join("/")}"`,
        `"${formatMatrix(log.matrix)}"`,
        (Number(log.hours || 0) * 60) + Number(log.minutes || 0),
        `"${(log.content || "").replace(/"/g, '""').replace(/\n/g, ' ')}"`
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `service_report_${filter.startDate}_to_${filter.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubmit = async () => {
    if (!formData.authorId) { alert('지원자명을 입력해주세요.'); return; }
    if (!formData.customerName) { alert('고객명을 입력해주세요.'); return; }
    if (!db) { alert('데이터베이스 연결 중입니다.'); return; }

    setStatus('saving');
    try {
      const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      await addDoc(collection(db, 'service_logs'), {
        ...formData,
        createdAt: serverTimestamp()
      });

      setStatus('success');
      setFormData(prev => ({
        ...prev,
        customerName: '',
        supportOrder: prev.supportOrder + 1,
        types: [],
        matrix: { "의사랑": [], "부가": [], "기타": [] },
        hours: 0,
        minutes: 0,
        content: ''
      }));
    } catch (error) {
      console.error("전송 오류:", error);
      setStatus('error');
      alert('전송에 실패했습니다.');
    }
  };

  const adjustValue = (field, delta) => {
    setFormData(prev => ({
      ...prev,
      [field]: Math.max(field === 'supportOrder' ? 1 : 0, Number(prev[field]) + delta)
    }));
  };

  const toggleMatrix = (item, rowLabel) => {
    setFormData(prev => {
      const current = prev.matrix[item] || [];
      const updated = current.includes(rowLabel) ? current.filter(l => l !== rowLabel) : [...current, rowLabel];
      return { ...prev, matrix: { ...prev.matrix, [item]: updated } };
    });
  };

  const styles = {
    container: {
      padding: '15px',
      fontFamily: '-apple-system, sans-serif',
      backgroundColor: '#f3f4f6',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    },
    card: {
      width: '85%',
      maxWidth: '380px',
      backgroundColor: 'white',
      borderRadius: '24px',
      padding: '20px',
      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
      marginBottom: '20px',
      boxSizing: 'border-box'
    },
    header: { backgroundColor: '#111827', color: 'white', padding: '20px', borderRadius: '20px', marginBottom: '20px' },
    label: { display: 'block', fontSize: '10px', fontWeight: 'bold', color: '#9ca3af', marginBottom: '5px', textTransform: 'uppercase' },
    input: { width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e5e7eb', boxSizing: 'border-box', fontSize: '14px' },
    textarea: { width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e5e7eb', boxSizing: 'border-box', fontSize: '14px', minHeight: '80px', marginTop: '10px' },
    button: (active, isPrimary) => ({
      padding: '10px 15px', margin: '2px', border: '1px solid #e5e7eb', borderRadius: '10px', cursor: 'pointer', fontSize: '12px',
      fontWeight: 'bold', backgroundColor: active ? (isPrimary ? '#2563eb' : '#4f46e5') : 'white', color: active ? 'white' : '#4b5563',
    }),
    nav: { display: 'flex', gap: '5px', marginBottom: '15px' },
    filterBox: { backgroundColor: '#f9fafb', padding: '15px', borderRadius: '15px', marginBottom: '15px', border: '1px solid #e5e7eb' }
  };

  if (view === 'admin' && isAdminAuthenticated) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.nav}>
            <button onClick={() => setView('form')} style={{ ...styles.button(false), flex: 1 }}>작성 페이지</button>
            <button style={{ ...styles.button(true, true), flex: 1 }}>데이터 조회</button>
          </div>
          <div style={styles.filterBox}>
            <label style={styles.label}>조회 기간 설정 (등록일 기준)</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input type="date" style={{ ...styles.input, flex: 1 }} value={filter.startDate} onChange={e => setFilter({ ...filter, startDate: e.target.value })} />
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>~</span>
              <input type="date" style={{ ...styles.input, flex: 1 }} value={filter.endDate} onChange={e => setFilter({ ...filter, endDate: e.target.value })} />
            </div>
          </div>
          <button onClick={downloadCSV} style={{ width: '100%', padding: '12px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '10px', marginBottom: '15px', fontWeight: 'bold' }}>Excel(CSV) 다운로드</button>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {filteredLogs.length === 0 ? <p style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>선택한 기간에 등록된 데이터가 없습니다.</p> :
              filteredLogs.map(log => {
                const displayDate = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }) : log.date;
                return (
                  <div key={log.id} style={{ padding: '15px 10px', borderBottom: '1px solid #eee', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 'bold', color: '#1f2937' }}>{log.customerName}</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>{displayDate}</span>
                    </div>
                    <div style={{ color: '#4b5563', marginTop: '4px' }}>담당: {log.authorId} | {log.method} | {log.hours}시간 {log.minutes}분</div>
                    <div style={{ fontSize: '11px', color: '#2563eb', marginTop: '4px', fontWeight: '500', wordBreak: 'break-all' }}>{formatMatrix(log.matrix)}</div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.card, textAlign: 'center', padding: '50px 20px' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>✅</div>
          <h2 style={{ color: '#2563eb', margin: '0 0 10px 0' }}>저장 완료!</h2>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>지원내역이 성공적으로 저장되었습니다.<br />지원내역을 추가 작성하시려면 아래 [지원내역 작성]버튼을 눌러주세요.</p>
          <button onClick={() => setStatus('idle')} style={{ ...styles.button(true, true), marginTop: '30px', width: '100%', padding: '15px', fontSize: '14px' }}>새 지원내역 작성</button>
          <button onClick={handleAdminAccess} style={{ ...styles.button(false), marginTop: '10px', width: '100%', padding: '15px', fontSize: '14px' }}>저장된 로그 확인*(관리자 기능)</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ margin: 0, fontSize: '20px', fontStyle: 'italic' }}>2026 서비스 조사</h1>
            <button onClick={handleAdminAccess} style={{ fontSize: '10px', background: 'none', border: '1px solid #60a5fa', color: '#60a5fa', borderRadius: '5px', padding: '2px 5px' }}>ADMIN</button>
          </div>
          <p style={{ margin: 0, fontSize: '10px', color: '#60a5fa' }}>CLOUD SYNC v3.7</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <div style={{ flex: 1 }}><label style={styles.label}>지원자명</label><input type="text" style={styles.input} value={formData.authorId} onChange={e => setFormData({ ...formData, authorId: e.target.value })} placeholder="이름" /></div>
          <div style={{ flex: 1 }}><label style={styles.label}>지원일자</label><input type="date" style={styles.input} value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} /></div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={styles.label}>상호명/대표자</label>
          <input type="text" style={styles.input} value={formData.customerName} onChange={e => setFormData({ ...formData, customerName: e.target.value })} placeholder="고객명 입력 *" />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={styles.label}>지원 순번</label>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '14px 18px', borderRadius: '18px', border: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: '22px', fontWeight: '900', color: '#2563eb' }}># {formData.supportOrder}</span>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => adjustValue('supportOrder', -1)} style={{ ...styles.button(false), width: '40px', flex: 'none', height: '40px', borderRadius: '50%', padding: 0, fontSize: '18px' }}>–</button>
              <button onClick={() => adjustValue('supportOrder', 1)} style={{ ...styles.button(true, true), width: '40px', flex: 'none', height: '40px', borderRadius: '50%', padding: 0, fontSize: '18px' }}>+</button>
            </div>
          </div>
        </div>

        <label style={styles.label}>지원 방법</label>
        <div style={{ display: 'flex', backgroundColor: '#f3f4f6', padding: '5px', borderRadius: '12px', marginBottom: '20px' }}>
          {options.methods.map(m => (
            <button key={m} type="button" onClick={() => setFormData({ ...formData, method: m })} style={{ ...styles.button(formData.method === m, true), flex: 1, border: 'none' }}>{m}</button>
          ))}
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={styles.label}>지원 유형(중복 선택 가능)</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
            {options.types.map(t => (
              <button key={t} type="button" onClick={() => setFormData(p => ({ ...p, types: p.types.includes(t) ? p.types.filter(x => x !== t) : [...p.types, t] }))} style={{ ...styles.button(formData.types.includes(t), true), padding: '15px' }}>{t}</button>
            ))}
          </div>
        </div>

        {formData.types.length > 0 && (
          <div style={{ marginTop: '20px', borderTop: '2px solid #f3f4f6', paddingTop: '15px' }}>
            <label style={styles.label}>지원 내역 및 제품</label>
            {options.rows.filter(r => r.group === 'common' || formData.types.includes(r.group)).map(row => (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>{row.label}</div></div>
                <div style={{ display: 'flex', gap: '3px' }}>{options.items.map(item => (<button key={item} type="button" onClick={() => toggleMatrix(item, row.label)} style={{ ...styles.button(formData.matrix[item].includes(row.label), true), padding: '6px 8px', fontSize: '10px' }}>{item}</button>))}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: '20px' }}>
          <label style={styles.label}>지원 시간</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1, backgroundColor: '#1f2937', padding: '15px 10px', borderRadius: '15px', color: 'white', textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <button type="button" onClick={() => adjustValue('hours', -1)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '18px' }}>—</button>
                <span style={{ fontWeight: 'bold', fontSize: '16px', minWidth: '40px' }}>{formData.hours}시간</span>
                <button type="button" onClick={() => adjustValue('hours', 1)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '18px' }}>+</button>
              </div>
            </div>
            <div style={{ flex: 1, backgroundColor: '#1f2937', padding: '15px 10px', borderRadius: '15px', color: 'white', textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <button type="button" onClick={() => adjustValue('minutes', -5)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '18px' }}>—</button>
                <span style={{ fontWeight: 'bold', fontSize: '16px', minWidth: '40px' }}>{formData.minutes}분</span>
                <button type="button" onClick={() => adjustValue('minutes', 5)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '18px' }}>+</button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '20px' }}>
          <label style={styles.label}>상세 내역</label>
          <textarea style={styles.textarea} placeholder="특이사항이나 상세 지원 내역을 입력하세요..." value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} />
        </div>

        <button onClick={handleSubmit} disabled={status === 'saving'} style={{ width: '100%', padding: '18px', backgroundColor: status === 'saving' ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: '18px', marginTop: '20px', fontWeight: 'bold', fontSize: '14px' }}>{status === 'saving' ? 'UPLOADING...' : '작성 완료'}</button>
      </div>
    </div>
  );
};
