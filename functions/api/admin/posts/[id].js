// /functions/api/admin/posts/[id].js
// 관리자 전용 - 글 삭제 API

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

    // 관리자 인증
    const adminKey = request.headers.get('X-Admin-Key');
    if (adminKey !== 'luzruz555') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    if (request.method === 'DELETE') {
        return handleAdminDelete(postId, env, corsHeaders);
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

async function handleAdminDelete(postId, env, corsHeaders) {
    try {
        // 글 존재 확인
        const post = await env.FROST_POSTS.get(`post:${postId}`);
        if (!post) {
            return new Response(JSON.stringify({ error: 'Post not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // KV에서 삭제
        await env.FROST_POSTS.delete(`post:${postId}`);

        // 인덱스에서 제거
        const indexKey = 'posts:index';
        const existingIndex = await env.FROST_POSTS.get(indexKey);
        if (existingIndex) {
            const index = JSON.parse(existingIndex);
            const newIndex = index.filter(p => p.id !== postId);
            await env.FROST_POSTS.put(indexKey, JSON.stringify(newIndex));
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
