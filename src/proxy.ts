import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/privacy(.*)',
  '/share(.*)',
  '/api/webhooks/clerk(.*)',
  // Authentication and RBAC are enforced inside the Route Handler so it can
  // preserve the explicit 401/403 authorization contract.
  '/api/health(.*)',
  // Vercel Blob calls this endpoint after a direct upload. Token generation is
  // still authenticated inside the Route Handler.
  '/api/upload(.*)',
  // This endpoint verifies CRON_SECRET itself; it never accepts a user ID.
  '/api/recording-uploads/cleanup',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
};
