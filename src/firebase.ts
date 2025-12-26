console.log("FIREBASE_API_KEY =", process.env.EXPO_PUBLIC_FIREBASE_API_KEY);
console.log("PROJECT_ID =", process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID);

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
};

// (중요) 키가 안 들어오면 바로 알 수 있게
if (!firebaseConfig.apiKey) {
    throw new Error("EXPO_PUBLIC_FIREBASE_API_KEY 가 비어있어요. .env / 실행 재시작 확인!");
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);