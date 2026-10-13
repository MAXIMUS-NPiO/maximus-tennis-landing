/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { handleForum } from '../../../../../lib/forum/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = async (request, { params }) => handleForum(request, 'forum-detail', await params);
