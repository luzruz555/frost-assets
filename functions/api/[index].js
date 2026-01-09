// /functions/api/admin/posts/[id]/comments/[index].js
// 관리자 전용 - 댓글 삭제 API

export async function onRequest(context) {
    const { request, env, params } = context;
    const postId = params.id;
    const commentIndex = parseInt(params.index);

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
        return handleDeleteComment(postId, commentIndex, env, corsHeaders);
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

async function handleDeleteComment(postId, commentIndex, env, corsHeaders) {
    try {
        // 글 가져오기
        const postData = await env.FROST_POSTS.get(`post:${postId}`);
        if (!postData) {
            return new Response(JSON.stringify({ error: 'Post not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const post = JSON.parse(postData);

        // 댓글 존재 확인
        if (!post.comments || !post.comments[commentIndex]) {
            return new Response(JSON.stringify({ error: 'Comment not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 댓글 삭제
        post.comments.splice(commentIndex, 1);

        // 저장
        await env.FROST_POSTS.put(`post:${postId}`, JSON.stringify(post));

        // 인덱스의 댓글 수 업데이트
        const indexKey = 'posts:index';
        const existingIndex = await env.FROST_POSTS.get(indexKey);
        if (existingIndex) {
            const index = JSON.parse(existingIndex);
            const postIndex = index.findIndex(p => p.id === postId);
            if (postIndex !== -1) {
                index[postIndex].commentCount = post.comments.length;
                await env.FROST_POSTS.put(indexKey, JSON.stringify(index));
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
