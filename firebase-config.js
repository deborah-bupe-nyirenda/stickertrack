// ============================================================
// 🔥 PASTE YOUR FIREBASE CONFIG HERE
// Go to: Firebase Console → Your Project → Project Settings → Your Apps
// Copy the firebaseConfig object and replace the placeholder below
// ============================================================

const firebaseConfig = {
 apiKey: "AIzaSyBTVEygNPY767zU3A7_dK55Ust3Xmg2SGg",
    authDomain: "stickertrack-1d3c2.firebaseapp.com",
    projectId: "stickertrack-1d3c2",
    storageBucket: "stickertrack-1d3c2.firebasestorage.app",
    messagingSenderId: "996527371892",
    appId: "1:996527371892:web:c817fd7e7f40b1c16b0321"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore and make it globally available
const db = firebase.firestore();
