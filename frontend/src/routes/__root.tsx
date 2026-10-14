import { createRootRoute, ErrorComponent, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

const NAV = [
    { label: 'Visualizaciones', href: '/' },
    { label: 'Descargas', href: '/downloads' },
    { label: 'Acerca de', href: '/about' },
];

export const Route = createRootRoute({
    errorComponent: ErrorComponent,
    component: () => (
        <div className="flex flex-col h-screen">
            <header className="top-bar shrink-0 z-10">
                <nav className="flex gap-4 p-4 bg-white">
                    {NAV.map(({ label, href }) => (
                        <Link
                            key={href}
                            to={href}
                            activeProps={{ className: 'font-bold' }}
                        >
                            {label}
                        </Link>
                    ))}
                </nav>
            </header>

            <main className="flex-1 relative overflow-hidden">
                <Outlet />
                <TanStackRouterDevtools />
            </main>
        </div>
    ),
});
