// src/firebase/index.ts
import * as admin from 'firebase-admin';
import path from 'path';

// IMPORTANT: For production, use environment variables for your service account.
// Example: process.env.FIREBASE_SERVICE_ACCOUNT_KEY
// Or load it from a secure location.
// For local development, we'll load it from a file in the project root.
//TODO - add a .env file to the root of the project and add the service account key there
const serviceAccountPath = path.resolve(__dirname, process.env.FIREBASE_PATH || '');

// Make sure the file exists before trying to initialize
try {
    const serviceAccount = require(serviceAccountPath);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    console.log('Firebase Admin SDK initialized successfully.');

} catch (error) {
    console.error('Failed to load Firebase service account key or initialize Firebase Admin SDK:', error);
    // In a real app, you might want to exit the process if initialization fails
    process.exit(1);
}

// Export Firebase Auth and Firestore instances for use in our tRPC procedures
export const auth = admin.auth();
export const firestore = admin.firestore();
