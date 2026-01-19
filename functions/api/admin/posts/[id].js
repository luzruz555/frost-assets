// /functions/api/admin/posts/[id].js
// D1 버전 - 관리자 글 삭제/수정

export async function onRequest(context) {
    const { request, env, params } = context;
    const postId = params.id;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'DELETE, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const adminKey = request.headers.get('X-Admin-Key');
    if (adminKey !== 'luzruz555') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    if (request.method === 'DELETE') {
        try {
            const comments = await env.FROST_DB.prepare(`
                SELECT id FROM comments WHERE post_id = ?
            `).bind(postId).all();

            for (const comment of comments.results) {
                await env.FROST_DB.prepare(`DELETE FROM replies WHERE comment_id = ?`).bind(comment.id).run();
            }

            await env.FROST_DB.prepare(`DELETE FROM comments WHERE post_id = ?`).bind(postId).run();
            await env.FROST_DB.prepare(`DELETE FROM likes WHERE post_id = ?`).bind(postId).run();
            await env.FROST_DB.prepare(`DELETE FROM posts WHERE id = ?`).bind(postId).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });

        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }

    if (request.method === 'PUT') {
        try {
            const { title, content, type, isNotice } = await request.json();

            await env.FROST_DB.prepare(`
                UPDATE posts SET title = ?, content = ?, type = ?, is_notice = ? WHERE id = ?
            `).bind(title, content, type, isNotice ? 1 : 0, postId).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });

        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}
