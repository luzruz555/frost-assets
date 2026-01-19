// /functions/api/admin/posts.js
// 관리자 글 작성

export async function onRequest(context) {
    const { request, env } = context;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    if (request.method === 'POST') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== 'luzruz555') {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        try {
            const { type, title, content, isNotice } = await request.json();

            if (!title || !content) {
                return new Response(JSON.stringify({ error: '제목과 내용을 입력해주세요.' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            const id = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const author = '겁많은두더지';
            const password = 'luzruz555';

            await env.FROST_DB.prepare(`
                INSERT INTO posts (id, type, title, author, content, password, is_notice, created_at, comment_count, likes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
            `).bind(id, type || 'free', title, author, content, password, isNotice ? 1 : 0, Date.now()).run();

            return new Response(JSON.stringify({ success: true, id }), {
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
