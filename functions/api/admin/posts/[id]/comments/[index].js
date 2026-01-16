// /functions/api/admin/comments/[id].js
// D1 버전 - 관리자 댓글/대댓글 삭제

export async function onRequest(context) {
    const { request, env, params } = context;
    const commentId = params.id;

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
            const url = new URL(request.url);
            const type = url.searchParams.get('type'); // 'comment' or 'reply'

            if (type === 'reply') {
                // 대댓글 삭제
                await env.FROST_DB.prepare(`DELETE FROM replies WHERE id = ?`).bind(commentId).run();
            } else {
                // 댓글의 post_id 찾기 (댓글 수 업데이트용)
                const comment = await env.FROST_DB.prepare(`SELECT post_id FROM comments WHERE id = ?`).bind(commentId).first();
                
                if (comment) {
                    // 대댓글 먼저 삭제
                    await env.FROST_DB.prepare(`DELETE FROM replies WHERE comment_id = ?`).bind(commentId).run();
                    // 댓글 삭제
                    await env.FROST_DB.prepare(`DELETE FROM comments WHERE id = ?`).bind(commentId).run();

                    // 댓글 수 업데이트
                    const countResult = await env.FROST_DB.prepare(`
                        SELECT 
                            (SELECT COUNT(*) FROM comments WHERE post_id = ?) +
                            (SELECT COUNT(*) FROM replies WHERE comment_id IN (SELECT id FROM comments WHERE post_id = ?))
                        as total
                    `).bind(comment.post_id, comment.post_id).first();

                    await env.FROST_DB.prepare(`
                        UPDATE posts SET comment_count = ? WHERE id = ?
                    `).bind(countResult.total, comment.post_id).run();
                }
            }

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
