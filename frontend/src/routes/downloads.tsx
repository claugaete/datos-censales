import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/downloads')({
    component: RouteComponent,
});

function RouteComponent() {
    return <div>Hello "/downloads"!</div>;
}
