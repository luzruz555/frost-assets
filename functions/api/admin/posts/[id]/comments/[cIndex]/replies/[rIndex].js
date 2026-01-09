// /functions/api/admin/posts/[id]/comments/[cIndex]/replies/[rIndex].js
// 관리자 전용 - 대댓글 삭제 API

export async function onRequest(context) {
    const { request, env, params } = context;
    const postId = params.id;
    const commentIndex = parseInt(params.cIndex);
    const replyIndex = parseInt(params.rIndex);

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
        return handleDeleteReply(postId, commentIndex, replyIndex, env, corsHeaders);
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

async function handleDeleteReply(postId, commentIndex, replyIndex, env, corsHeaders) {
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

        const comment = post.comments[commentIndex];

        // 대댓글 존재 확인
        if (!comment.replies || !comment.replies[replyIndex]) {
            return new Response(JSON.stringify({ error: 'Reply not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 대댓글 삭제
        comment.replies.splice(replyIndex, 1);

        // 저장
        await env.FROST_POSTS.put(`post:${postId}`, JSON.stringify(post));

        // 인덱스의 댓글 수 업데이트
        const indexKey = 'posts:index';
        const existingIndex = await env.FROST_POSTS.get(indexKey);
        if (existingIndex) {
            const index = JSON.parse(existingIndex);
            const postIndex = index.findIndex(p => p.id === postId);
            if (postIndex !== -1) {
                // 총 댓글 수 계산 (대댓글 포함)
                let totalComments = post.comments.length;
                post.comments.forEach(c => {
                    if (c.replies) totalComments += c.replies.length;
                });
                index[postIndex].commentCount = totalComments;
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
