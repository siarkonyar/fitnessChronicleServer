// src/firebase/index.ts
import * as admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

// IMPORTANT: For production, use environment variables for your service account.
// Example: process.env.FIREBASE_SERVICE_ACCOUNT_KEY
// Or load it from a secure location.
// For local development, we'll load it from a file in the project root.
//TODO - add a .env file to the root of the project and add the service account key there
const serviceAccountPath = path.resolve(__dirname, '../../fitnesschronicle-firebase-adminsdk.json');

// Make sure a service account is available from env or local file
try {
    let serviceAccountObj: admin.ServiceAccount | undefined;

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
        try {
            serviceAccountObj = JSON.parse(serviceAccountJson);
        } catch (parseError) {
            throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ' + parseError);
        }
    } else if (fs.existsSync(serviceAccountPath)) {
        const fileContents = fs.readFileSync(serviceAccountPath, 'utf8');
        try {
            serviceAccountObj = JSON.parse(fileContents);
        } catch (parseError) {
            throw new Error('Failed to parse local service account file: ' + parseError);
        }
    } else {
        throw new Error(
            'No Firebase service account found. Set FIREBASE_SERVICE_ACCOUNT_JSON or add the JSON to ' +
            serviceAccountPath
        );
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountObj as admin.ServiceAccount)
    });

    console.log('Firebase Admin SDK initialized successfully.');

} catch (error) {
    console.error('Failed to load Firebase service account key or initialize Firebase Admin SDK:', error);
    process.exit(1);
}

// Export Firebase Auth and Firestore instances for use in our tRPC procedures
export const auth = admin.auth();
export const firestore = admin.firestore();
