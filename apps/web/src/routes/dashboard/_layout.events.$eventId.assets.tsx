import { createFileRoute, redirect } from '@tanstack/react-router'

// Asset uploads have moved into the Flow Builder module panels (V4-5.1).
// Logo upload is now in the Config page Branding section.
export const Route = createFileRoute(
  '/dashboard/_layout/events/$eventId/assets',
)({
  loader: ({ params }) => {
    throw redirect({
      to: '/dashboard/events/$eventId/flow',
      params: { eventId: params.eventId },
    })
  },
})
