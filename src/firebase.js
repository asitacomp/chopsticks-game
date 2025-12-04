import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDCyLnFtj4nF1g32Gb6uhx40G8nKetlIvE",
  authDomain: "chopsticks-game-a58dc.firebaseapp.com",
  projectId: "chopsticks-game-a58dc",
  storageBucket: "chopsticks-game-a58dc.firebasestorage.app",
  messagingSenderId: "609663233872",
  appId: "1:609663233872:web:7bf6cf00c2ee6d0bc90655"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestoreを取得
export const db = getFirestore(app);