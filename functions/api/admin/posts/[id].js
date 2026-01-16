// /functions/api/admin/posts/[id].js
// D1 버전 - 관리자 글 삭제

export async function onRequest(context) {
    const { request, env, params } = context;
    const postId = params.id;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    if (request.method === 'DELETE') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== 'luzruz555') {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        try {
            // 대댓글 삭제
            const comments = await env.FROST_DB.prepare(`
                SELECT id FROM comments WHERE post_id = ?
            `).bind(postId).all();

            for (const comment of comments.results) {
                await env.FROST_DB.prepare(`DELETE FROM replies WHERE comment_id = ?`).bind(comment.id).run();
            }

            // 댓글 삭제
            await env.FROST_DB.prepare(`DELETE FROM comments WHERE post_id = ?`).bind(postId).run();

            // 글 삭제
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

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}
