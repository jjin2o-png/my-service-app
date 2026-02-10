import React, { useState, useEffect, useRef } from 'react';

/**
 * [버전 정보] v3.8.5
 * 1. 개선: 초기 로딩 화면 제거 (UI 즉시 렌더링)
 * 2. 최적화: 백그라운드 Firestore 초기화로 체감 속도 향상
 * 3. 유지: 기존 디자인, 360px 레이아웃, long-polling 안정성
 */

const firebaseConfig = {
  apiKey: "AIzaSyCQVfwjkQ7IMZdPkXSoeOiL9GGfTrI7bgI",
  authDomain: "rdb1-c8163.firebaseapp.com",
  projectId: "rdb1-c8163",
  storageBucket: "rdb1-c8163.firebasestorage.app",
  messagingSenderId: "976959936942",
  appId: "1:976959936942:web:d0bbbc15cb849cfbdf103f"
};

const ADMIN_PASSWORD = "20260331"; 

const App = () => {
  const [view, setView] = useState('form'); 
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('idle'); // 초기 상태를 idle로 변경하여 로딩 화면 제거
  const [logs, setLogs] = useState([]);
  const [editingId, setEditingId] = useState(null);

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
  const [lastAuthorId, setLastAuthorId] = useState('');

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

  // 백그라운드에서 조용히 Firebase 초기화
  useEffect(() => {
    const initFirebase = async () => {
      try {
        const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        const { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const { getAuth, signInAnonymously, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        
        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
        
        // 안정성은 유지하되 백그라운드에서 초기화
        const firestore = initializeFirestore(app, {
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
          experimentalForceLongPolling: true,
          useFetchStreams: false
        });
        
        const firebaseAuth = getAuth(app);
        setDb(firestore);
        setAuth(firebaseAuth);

        signInAnonymously(firebaseAuth).catch(() => {
          setUser({ uid: 'guest-' + Math.random().toString(36).substr(2, 9) });
        });
        
        onAuthStateChanged(firebaseAuth, (u) => {
          if (u) setUser(u);
        });

      } catch (error) {
        console.error("Background Sync Init Failed:", error);
      }
    };
    initFirebase();
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
      const { collection, getDocs, query, orderBy, limit } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      const q = query(collection(db, 'service_logs'), orderBy('createdAt', 'desc'), limit(500));
      const querySnapshot = await getDocs(q);
      const fetchedLogs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(fetchedLogs);
      setStatus('idle');
    } catch (error) {
      console.error("데이터 조회 실패:", error);
      setStatus('idle');
    }
  };

  useEffect(() => {
    if ((view === 'admin' || view === 'userLogs') && db) {
      fetchLogs();
    }
  }, [view, db]);

  const filteredLogs = logs.filter(log => {
    const createdDate = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt || Date.now());
    const logDateStr = createdDate.toISOString().split('T')[0];
    const isWithinDate = logDateStr >= filter.startDate && logDateStr <= filter.endDate;
    
    if (view === 'userLogs') {
      return isWithinDate && log.authorId === lastAuthorId;
    }
    return isWithinDate;
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

  const handleUserLogAccess = () => {
    const name = formData.authorId || lastAuthorId;
    if (!name) {
      alert("로그를 조회할 담당자명을 먼저 입력하거나 내역을 작성해주세요.");
      return;
    }
    setLastAuthorId(name);
    setView('userLogs');
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

  const handleEdit = (log) => {
    setFormData({
      date: log.date || today,
      authorId: log.authorId,
      customerName: log.customerName,
      supportOrder: log.supportOrder,
      method: log.method,
      types: log.types || [],
      matrix: log.matrix || { "의사랑": [], "부가": [], "기타": [] },
      hours: log.hours || 0,
      minutes: log.minutes || 0,
      content: log.content || ''
    });
    setEditingId(log.id);
    setView('form');
  };

  const handleSubmit = async () => {
    if (!formData.authorId) { alert('담당자명을 입력해주세요.'); return; }
    if (!formData.customerName) { alert('고객명을 입력해주세요.'); return; }
    
    // DB 연결이 아직 안되었을 경우를 대비한 짧은 대기
    if (!db) {
        alert('서버 연결 중입니다. 잠시 후 다시 시도해주세요.');
        return;
    }
    
    setStatus('saving');
    try {
      const { collection, addDoc, doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      
      const payload = { 
        ...formData, 
        updatedAt: serverTimestamp() 
      };

      if (editingId) {
        const docRef = doc(db, 'service_logs', editingId);
        await updateDoc(docRef, payload);
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'service_logs'), { 
          ...payload,
          createdAt: serverTimestamp() 
        });
      }
      
      setLastAuthorId(formData.authorId);
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
      setStatus('idle');
      alert('네트워크 연결이 지연되고 있습니다. 잠시 후 다시 시도해주세요.');
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
      width: '100%',
      maxWidth: '360px', 
      backgroundColor: 'white', 
      borderRadius: '24px', 
      padding: '18px', 
      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', 
      marginBottom: '20px',
      boxSizing: 'border-box'
    },
    header: { backgroundColor: '#111827', color: 'white', padding: '20px', borderRadius: '20px', marginBottom: '20px' },
    label: { display: 'block', fontSize: '10px', fontWeight: 'bold', color: '#9ca3af', marginBottom: '5px', textTransform: 'uppercase' },
    input: { width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e5e7eb', boxSizing: 'border-box', fontSize: '14px' },
    textarea: { width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e5e7eb', boxSizing: 'border-box', fontSize: '14px', minHeight: '80px', marginTop: '10px' },
    button: (active, isPrimary) => ({
      padding: '10px 12px', margin: '2px', border: '1px solid #e5e7eb', borderRadius: '10px', cursor: 'pointer', fontSize: '12px',
      fontWeight: 'bold', backgroundColor: active ? (isPrimary ? '#2563eb' : '#4f46e5') : 'white', color: active ? 'white' : '#4b5563',
    }),
    nav: { display: 'flex', gap: '5px', marginBottom: '15px' },
    filterBox: { backgroundColor: '#f9fafb', padding: '15px', borderRadius: '15px', marginBottom: '15px', border: '1px solid #e5e7eb' },
    timeControlCard: {
      flex: 1, 
      backgroundColor: '#1f2937', 
      padding: '12px 5px', 
      borderRadius: '15px', 
      color: 'white', 
      textAlign: 'center'
    },
    timeControlBtn: {
      background: 'none', 
      border: 'none', 
      color: 'white', 
      fontSize: '18px',
      width: '30px', 
      cursor: 'pointer'
    },
    sideButton: {
      fontSize: '10px', 
      background: 'none', 
      border: '1px solid #60a5fa', 
      color: '#60a5fa', 
      borderRadius: '5px', 
      padding: '3px 8px',
      marginBottom: '4px',
      width: '100%',
      textAlign: 'center',
      cursor: 'pointer',
      display: 'block'
    }
  };

  if ((view === 'admin' || view === 'userLogs')) {
    const isUserMode = view === 'userLogs';
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.nav}>
            <button onClick={() => setView('form')} style={{...styles.button(false), flex: 1}}>작성 페이지</button>
            <button style={{...styles.button(true, true), flex: 1}}>{isUserMode ? '본인 내역' : '전체 조회'}</button>
          </div>
          <div style={styles.filterBox}>
            <label style={styles.label}>{isUserMode ? `담당자 [${lastAuthorId}] 내역 필터` : '조회 기간 설정'}</label>
            <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
              <input type="date" style={{...styles.input, flex: 1}} value={filter.startDate} onChange={e => setFilter({...filter, startDate: e.target.value})} />
              <span style={{fontSize: '12px', color: '#9ca3af'}}>~</span>
              <input type="date" style={{...styles.input, flex: 1}} value={filter.endDate} onChange={e => setFilter({...filter, endDate: e.target.value})} />
            </div>
          </div>
          {!isUserMode && (
            <button onClick={downloadCSV} style={{width: '100%', padding: '12px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '10px', marginBottom: '15px', fontWeight: 'bold'}}>Excel(CSV) 다운로드</button>
          )}
          <div style={{maxHeight: '500px', overflowY: 'auto'}}>
            {status === 'loading' ? <p style={{textAlign: 'center', color: '#9ca3af', padding: '20px'}}>데이터를 불러오는 중...</p> : 
             filteredLogs.length === 0 ? <p style={{textAlign: 'center', color: '#9ca3af', padding: '20px'}}>해당 데이터가 없습니다.</p> : 
              filteredLogs.map(log => {
                const displayDate = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('ko-KR', {month:'numeric', day:'numeric', hour:'numeric', minute:'numeric'}) : log.date;
                return (
                  <div key={log.id} style={{padding: '15px 10px', borderBottom: '1px solid #eee', fontSize: '13px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between'}}>
                      <span style={{fontWeight: 'bold', color: '#1f2937'}}>{log.customerName}</span>
                      <div style={{display: 'flex', gap: '5px'}}>
                        <span style={{fontSize: '11px', color: '#9ca3af'}}>{displayDate}</span>
                        {isUserMode && (
                           <button onClick={() => handleEdit(log)} style={{fontSize: '10px', padding: '0 5px', border: '1px solid #2563eb', color: '#2563eb', borderRadius: '4px', background: 'white'}}>수정</button>
                        )}
                      </div>
                    </div>
                    <div style={{color: '#4b5563', marginTop: '4px'}}>담당: {log.authorId} | {log.method} | {log.hours}시간 {log.minutes}분</div>
                    <div style={{fontSize: '11px', color: '#2563eb', marginTop: '4px', fontWeight: '500', wordBreak: 'break-all'}}>{formatMatrix(log.matrix)}</div>
                  </div>
                );
              })
            }
          </div>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={styles.container}>
        <div style={{...styles.card, textAlign: 'center', padding: '40px 18px'}}>
          <div style={{fontSize: '40px', marginBottom: '10px'}}>✅</div>
          <h2 style={{color: '#2563eb', margin: '0 0 10px 0'}}>{editingId ? '수정 완료!' : '저장 완료!'}</h2>
          <p style={{color: '#6b7280', fontSize: '13px', lineHeight: '1.5'}}>지원내역이 성공적으로 반영되었습니다.<br/>원하시는 작업을 선택해주세요.</p>
          <button onClick={() => { setEditingId(null); setStatus('idle'); }} style={{...styles.button(true, true), marginTop: '25px', width: '100%', padding: '15px', fontSize: '13px'}}>새 지원내역 작성</button>
          <button onClick={() => setView('userLogs')} style={{...styles.button(false), marginTop: '8px', width: '100%', padding: '15px', fontSize: '13px', border: '1px solid #4f46e5', color: '#4f46e5'}}>나의 로그 확인하기 (수정 가능)</button>
          <button onClick={handleAdminAccess} style={{...styles.button(false), marginTop: '8px', width: '100%', padding: '15px', fontSize: '13px'}}>전체 로그 확인하기 (관리자용)</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
            <div>
              <h1 style={{margin: 0, fontSize: '20px', fontStyle: 'italic'}}>{editingId ? '지원내역 수정' : '2026 서비스 조사'}</h1>
              <p style={{margin: 0, fontSize: '10px', color: '#60a5fa'}}>CLOUD SYNC v3.8.5 {editingId && '· EDIT MODE'}</p>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end'}}>
              <button onClick={handleAdminAccess} style={styles.sideButton}>ADMIN</button>
              <button onClick={handleUserLogAccess} style={{...styles.sideButton, borderColor: '#f472b6', color: '#f472b6'}}>MY LOG</button>
            </div>
          </div>
        </div>

        <div style={{display: 'flex', gap: '8px', marginBottom: '15px'}}>
          <div style={{flex: 1}}><label style={styles.label}>담당자명</label><input type="text" style={styles.input} value={formData.authorId} onChange={e => setFormData({...formData, authorId: e.target.value})} placeholder="이름" /></div>
          <div style={{flex: 1}}><label style={styles.label}>지원일자</label><input type="date" style={styles.input} value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} /></div>
        </div>

        <div style={{marginBottom: '15px'}}>
          <label style={styles.label}>상호명/대표자</label>
          <input type="text" style={styles.input} value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} placeholder="고객명 입력 *" />
        </div>

        <div style={{marginBottom: '20px'}}>
          <label style={styles.label}>지원 순번</label>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '12px 15px', borderRadius: '18px', border: '1px solid #f1f5f9'}}>
            <span style={{fontSize: '20px', fontWeight: '900', color: '#2563eb'}}># {formData.supportOrder}</span>
            <div style={{display: 'flex', gap: '8px'}}>
              <button onClick={() => adjustValue('supportOrder', -1)} style={{...styles.button(false), width: '36px', flex: 'none', height: '36px', borderRadius: '50%', padding: 0, fontSize: '16px'}}>–</button>
              <button onClick={() => adjustValue('supportOrder', 1)} style={{...styles.button(true, true), width: '36px', flex: 'none', height: '36px', borderRadius: '50%', padding: 0, fontSize: '16px'}}>+</button>
            </div>
          </div>
        </div>

        <label style={styles.label}>지원 방법</label>
        <div style={{display: 'flex', backgroundColor: '#f3f4f6', padding: '4px', borderRadius: '12px', marginBottom: '20px'}}>
          {options.methods.map(m => (
            <button key={m} type="button" onClick={() => setFormData({...formData, method: m})} style={{...styles.button(formData.method === m, true), flex: 1, border: 'none', fontSize: '11px', padding: '10px 5px'}}>{m}</button>
          ))}
        </div>

        <div style={{marginBottom: '15px'}}>
          <label style={styles.label}>지원 유형(중복 선택 가능)</label>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px'}}>
            {options.types.map(t => (
              <button key={t} type="button" onClick={() => setFormData(p => ({...p, types: p.types.includes(t) ? p.types.filter(x => x !== t) : [...p.types, t]}))} style={{...styles.button(formData.types.includes(t), true), padding: '12px 5px', fontSize: '11px'}}>{t}</button>
            ))}
          </div>
        </div>

        {formData.types.length > 0 && (
          <div style={{marginTop: '20px', borderTop: '2px solid #f3f4f6', paddingTop: '15px'}}>
            <label style={styles.label}>지원 내역 및 제품</label>
            {options.rows.filter(r => r.group === 'common' || formData.types.includes(r.group)).map(row => (
              <div key={row.id} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6'}}>
                <div style={{flex: 1}}><div style={{fontSize: '11px', fontWeight: 'bold', color: '#374151'}}>{row.label}</div></div>
                <div style={{display: 'flex', gap: '2px'}}>{options.items.map(item => (<button key={item} type="button" onClick={() => toggleMatrix(item, row.label)} style={{...styles.button(formData.matrix[item].includes(row.label), true), padding: '5px 6px', fontSize: '9px'}}>{item}</button>))}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{marginTop: '20px'}}>
          <label style={styles.label}>지원 시간</label>
          <div style={{display: 'flex', gap: '8px'}}>
            <div style={styles.timeControlCard}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'}}>
                <button type="button" onClick={() => adjustValue('hours', -1)} style={styles.timeControlBtn}>—</button>
                <span style={{fontWeight: 'bold', fontSize: '14px', minWidth: '40px'}}>{formData.hours}시</span>
                <button type="button" onClick={() => adjustValue('hours', 1)} style={styles.timeControlBtn}>+</button>
              </div>
            </div>
            <div style={styles.timeControlCard}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'}}>
                <button type="button" onClick={() => adjustValue('minutes', -5)} style={styles.timeControlBtn}>—</button>
                <span style={{fontWeight: 'bold', fontSize: '14px', minWidth: '40px'}}>{formData.minutes}분</span>
                <button type="button" onClick={() => adjustValue('minutes', 5)} style={styles.timeControlBtn}>+</button>
              </div>
            </div>
          </div>
        </div>

        <div style={{marginTop: '20px'}}>
          <label style={styles.label}>상세 내역</label>
          <textarea style={styles.textarea} placeholder="특이사항이나 상세 지원 내역을 입력하세요..." value={formData.content} onChange={e => setFormData({...formData, content: e.target.value})} />
        </div>

        <div style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
          {editingId && (
            <button onClick={() => { setEditingId(null); setView('userLogs'); }} style={{flex: 1, padding: '16px', backgroundColor: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb', borderRadius: '18px', fontWeight: 'bold', fontSize: '14px'}}>취소</button>
          )}
          <button onClick={handleSubmit} disabled={status === 'saving'} style={{flex: 2, padding: '16px', backgroundColor: status === 'saving' ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: '18px', fontWeight: 'bold', fontSize: '14px'}}>{status === 'saving' ? '저장 중...' : (editingId ? '수정 완료' : '작성 완료')}</button>
        </div>
      </div>
    </div>
  );
};

export default App;