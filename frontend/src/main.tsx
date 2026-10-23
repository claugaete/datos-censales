import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';

// Import the generated route tree
import { routeTree } from './routeTree.gen';

import './index.css';

function stringifySearch(search: Record<string, unknown>): string {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(search)) {
        if (value === undefined || value === null) continue;

        if (Array.isArray(value)) {
            value.forEach((item) => params.append(key, String(item)));
        } else {
            params.set(key, String(value));
        }
    }

    const query = params.toString().replace(/%3A/gi, ':');
    return query ? `?${query}` : '';
}

// Create a new router instance
const router = createRouter({ routeTree, stringifySearch });

// Register the router instance for type safety
declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}

// Render the app
const rootElement = document.getElementById('root')!;
if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <StrictMode>
            <Toaster/>
            <RouterProvider router={router} />
        </StrictMode>,
    );
}
