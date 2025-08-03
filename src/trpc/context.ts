// src/trpc/context.ts
import { inferAsyncReturnType } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { auth, firestore } from '../firebase'; // Import our Firebase Admin instances
import admin from 'firebase-admin'; // Import the Firebase Admin namespace

/**
 * Creates context for your tRPC procedures.
 * This is where you'd typically handle authentication and other global state.
 */
export async function createContext({ req, res }: CreateExpressContextOptions) {
    // Assume ID Token is sent in an "Authorization" header as a Bearer token
    const idToken = req.headers.authorization?.split('Bearer ')[1];

    let user: admin.auth.DecodedIdToken | null = null;

    if (idToken) {
        try {
            // Verify the Firebase ID token
            user = await auth.verifyIdToken(idToken);
            // console.log('Authenticated user:', user.uid); // For debugging
        } catch (error) {
            console.error('Firebase ID token verification failed:', error);
            // In a real app, you might want to throw a specific error or
            // set an error state on the context. For now, user will remain null.
        }
    }

    return {
        user,        // The authenticated user's decoded token, or null
        auth,        // Firebase Admin Auth instance
        firestore,   // Firebase Admin Firestore instance
        req,
        res
    };
}

export type Context = inferAsyncReturnType<typeof createContext>;
