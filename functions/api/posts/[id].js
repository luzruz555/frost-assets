// /functions/api/posts/[id].js
// D1 버전 - 글 상세 조회 + 삭제

export async function onRequest(context) {
    const { request, env, params } = context;
    const postId = params.id;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    if (request.method === 'GET') {
        return handleGetPost(postId, env, corsHeaders);
    }

    if (request.method === 'DELETE') {
        return handleDeletePost(postId, request, env, corsHeaders);
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

// 글 상세 조회
async function handleGetPost(postId, env, corsHeaders) {
    try {
        // 글 정보
        const post = await env.FROST_DB.prepare(`
            SELECT id, type, title, author, content, is_notice as isNotice, created_at as createdAt
            FROM posts WHERE id = ?
        `).bind(postId).first();

        if (!post) {
            return new Response(JSON.stringify({ error: '글을 찾을 수 없습니다.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 댓글 조회
        const comments = await env.FROST_DB.prepare(`
            SELECT id, author, content, created_at as createdAt, edited_at as editedAt
            FROM comments WHERE post_id = ? ORDER BY created_at ASC
        `).bind(postId).all();

        // 각 댓글의 대댓글 조회
        const commentsWithReplies = await Promise.all(
            comments.results.map(async (comment) => {
                const replies = await env.FROST_DB.prepare(`
                    SELECT id, author, content, created_at as createdAt, edited_at as editedAt
                    FROM replies WHERE comment_id = ? ORDER BY created_at ASC
                `).bind(comment.id).all();

                return {
                    ...comment,
                    replies: replies.results
                };
            })
        );

        return new Response(JSON.stringify({
            ...post,
            isNotice: !!post.isNotice,
            comments: commentsWithReplies
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

// 글 삭제
async function handleDeletePost(postId, request, env, corsHeaders) {
    try {
        const { password } = await request.json();

        if (!password) {
            return new Response(JSON.stringify({ error: '비밀번호를 입력해주세요.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 비밀번호 확인
        const post = await env.FROST_DB.prepare(`
            SELECT password FROM posts WHERE id = ?
        `).bind(postId).first();

        if (!post) {
            return new Response(JSON.stringify({ error: '글을 찾을 수 없습니다.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (post.password !== password) {
            return new Response(JSON.stringify({ error: '비밀번호가 일치하지 않습니다.' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

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
