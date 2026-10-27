import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import toast, { Toaster, useToasterStore } from 'react-hot-toast';

// Import the generated route tree
import { routeTree } from './routeTree.gen';

import './index.css';

interface ToasterWithMaxProps extends React.ComponentProps<typeof Toaster> {
    max: number;
}

export function ToasterWithMax({ max, ...props }: ToasterWithMaxProps) {
    const { toasts } = useToasterStore();

    useEffect(() => {
        // consider only visible toasts
        const visibleToasts = toasts
            .filter((t) => t.visible)
            .sort((a, b) => a.createdAt - b.createdAt);
        if (visibleToasts.length > max) {
            const excessCount = visibleToasts.length - max;
            for (let i = 0; i < excessCount; i++) {
                toast.dismiss(visibleToasts[i].id);
            }
        }
    }, [toasts, max]);

    return <Toaster {...props} />;
}

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
            <ToasterWithMax max={1} />
            <RouterProvider router={router} />
        </StrictMode>,
    );
}
