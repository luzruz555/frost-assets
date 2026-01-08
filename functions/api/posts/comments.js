// /functions/api/posts/[id]/comments.js
// Pages Functions - /api/posts/:id/comments 엔드포인트

export async function onRequest(context) {
    const { request, env, params } = context;
    const postId = params.id;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    // POST: 댓글 작성
    if (request.method === 'POST') {
        return handleAddComment(postId, request, env, corsHeaders);
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

async function handleAddComment(postId, request, env, corsHeaders) {
    try {
        const { author, content } = await request.json();

        // 유효성 검사
        if (!author || !content) {
            return new Response(JSON.stringify({ error: '닉네임과 내용을 입력해주세요.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (author.length > 20) {
            return new Response(JSON.stringify({ error: '닉네임은 20자 이내로 입력해주세요.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (content.length > 500) {
            return new Response(JSON.stringify({ error: '댓글은 500자 이내로 입력해주세요.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 글 가져오기
        const postData = await env.FROST_POSTS.get(`post:${postId}`);
        if (!postData) {
            return new Response(JSON.stringify({ error: '글을 찾을 수 없습니다.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const post = JSON.parse(postData);

        // 댓글 추가
        const comment = {
            id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            author,
            content,
            createdAt: Date.now()
        };

        if (!post.comments) post.comments = [];
        post.comments.push(comment);

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

        return new Response(JSON.stringify({ success: true, comment }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
