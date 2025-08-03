// src/index.ts
import express from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './trpc/routers'; // Your combined tRPC router
import { createContext } from './trpc/context'; // Your tRPC context creator

// Load Firebase Admin SDK (this will run when index.ts is imported)
import './firebase';

const app = express();
const port = process.env.PORT || 3001; // Use environment variable for port, default to 3001

// Enable CORS for your client application
// For production, you'll want to restrict this to your specific client origin(s)
app.use(cors({
    origin: ['http://localhost:3000', 'https://fitnesschronicle-d9080.web.app'], // Example client origins
}));

// Set up tRPC middleware
app.use(
    '/trpc', // Your API endpoint prefix (e.g., http://localhost:3001/trpc/fitness.getLogs)
    createExpressMiddleware({
        router: appRouter,
        createContext, // Pass your context creator
    })
);

// Simple root endpoint for health check
app.get('/', (req, res) => {
    res.send('Fitness Chronicle tRPC Server is running!');
});

// Start the server
app.listen(port, () => {
    console.log(`🚀 Fitness Chronicle tRPC server listening on http://localhost:${port}`);
    console.log(`tRPC API available at http://localhost:${port}/trpc`);
});
