/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { handleForum } from '../../../../lib/forum/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = request => handleForum(request, 'forum-list');
export const POST = request => handleForum(request, 'forum-create');
