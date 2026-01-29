import { App } from './App.1';

/**
 * [버전 정보] v3.7 (사용자 커스텀 안정화 버전)
 * 1. 레이아웃 안정화: 가로 폭 흔들림 방지 및 중앙 정렬 강화
 * 2. 명칭 복구: '지원자명', '지원 내역 및 제품', '상세 내역' 등 사용자 선호 명칭 사용
 * 3. 기능: Firebase Real-time 연동, CSV 다운로드, 관리자 모드(PW: 20260331)
 */

export const firebaseConfig = {
  apiKey: "AIzaSyCQVfwjkQ7IMZdPkXSoeOiL9GGfTrI7bgI",
  authDomain: "rdb1-c8163.firebaseapp.com",
  projectId: "rdb1-c8163",
  storageBucket: "rdb1-c8163.firebasestorage.app",
  messagingSenderId: "976959936942",
  appId: "1:976959936942:web:d0bbbc15cb849cfbdf103f"
};

export const ADMIN_PASSWORD = "20260331"; 
export const STORAGE_KEY = "serviceLog_AuthorName_v2";

export default App;