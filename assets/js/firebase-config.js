// Firebase configuration and initialization using modular v9+ (ES modules, CDN imports)
// Replace the firebaseConfig object values with your actual project config.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Use your existing firebaseConfig object here.
// Example shape (replace with the values you already have):
const firebaseConfig = {
    apiKey: "AIzaSyB4GhVA79nTfQsJwHmOLA3LoehQ7HTLOfg",
    authDomain: "reward-committee.firebaseapp.com",
    projectId: "reward-committee",
    storageBucket: "reward-committee.firebasestorage.app",
    messagingSenderId: "1033258013316",
    appId: "1:1033258013316:web:a4b4375e27e9b80f0768d1",
    measurementId: "G-3M95FLD9Y4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
const auth = getAuth(app);
const db = getFirestore(app);

// Small app salt for client-side encryption (MVP). Change to a secure server key in production.
export const ENCRYPTION_SALT = "replace-with-your-own-short-salt";

export { app, auth, db };
