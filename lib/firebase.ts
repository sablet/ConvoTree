import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Firebase アプリの初期化（重複を避ける）
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Firestore インスタンス
export const db = getFirestore(app);

// Firestoreの永続化キャッシュを有効化（オフライン対応）
if (typeof window !== 'undefined') {
  enableMultiTabIndexedDbPersistence(db)
    .then(() => {
      console.log('✅ Firestore persistence enabled (multi-tab)');
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        // Multiple tabs open, persistence can only be enabled in one tab at a time.
        console.warn('⚠️ Firestore persistence failed: Multiple tabs open');
        // Fallback to single-tab persistence
        enableIndexedDbPersistence(db).catch((err2) => {
          console.error('❌ Firestore persistence error:', err2);
        });
      } else if (err.code === 'unimplemented') {
        console.warn('⚠️ Firestore persistence not supported in this browser');
      } else {
        console.error('❌ Firestore persistence error:', err);
      }
    });
}

// Firebase Auth インスタンス
export const auth = getAuth(app);

export default app;
