import { getDeclutterStatus } from '$lib/api/declutter';
import { authenticate } from '$lib/utils/auth';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  const status = await getDeclutterStatus();

  return {
    status,
    meta: { title: 'Similar Photo Cleanup' },
  };
}) satisfies PageLoad;
