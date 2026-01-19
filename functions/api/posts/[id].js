// /functions/api/posts/[id].js
// D1 버전 - 글 상세 조회 + 삭제 + 수정 + 추천

export async function onRequest(context) {
    const { request, env, params } = context;
    const postId = params.id;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, DELETE, PUT, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
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

    if (request.method === 'PUT') {
        return handleEditPost(postId, request, env, corsHeaders);
    }

    if (request.method === 'POST') {
        return handleLikePost(postId, request, env, corsHeaders);
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

// 글 상세 조회
async function handleGetPost(postId, env, corsHeaders) {
    try {
        const post = await env.FROST_DB.prepare(`
            SELECT id, type, title, author, content, is_notice as isNotice, created_at as createdAt, likes
            FROM posts WHERE id = ?
        `).bind(postId).first();

        if (!post) {
            return new Response(JSON.stringify({ error: '글을 찾을 수 없습니다.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const comments = await env.FROST_DB.prepare(`
            SELECT id, author, content, created_at as createdAt, edited_at as editedAt
            FROM comments WHERE post_id = ? ORDER BY created_at ASC
        `).bind(postId).all();

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

// 글 수정
async function handleEditPost(postId, request, env, corsHeaders) {
    try {
        const { password, title, content, type, isNotice } = await request.json();
        const adminKey = request.headers.get('X-Admin-Key');

        const post = await env.FROST_DB.prepare(`
            SELECT password FROM posts WHERE id = ?
        `).bind(postId).first();

        if (!post) {
            return new Response(JSON.stringify({ error: '글을 찾을 수 없습니다.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 관리자 or 비밀번호 확인
        if (adminKey !== 'luzruz555' && post.password !== password) {
            return new Response(JSON.stringify({ error: '비밀번호가 일치하지 않습니다.' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 관리자만 공지/타입 변경 가능
        if (adminKey === 'luzruz555') {
            await env.FROST_DB.prepare(`
                UPDATE posts SET title = ?, content = ?, type = ?, is_notice = ? WHERE id = ?
            `).bind(title, content, type, isNotice ? 1 : 0, postId).run();
        } else {
            await env.FROST_DB.prepare(`
                UPDATE posts SET title = ?, content = ? WHERE id = ?
            `).bind(title, content, postId).run();
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

// 추천
async function handleLikePost(postId, request, env, corsHeaders) {
    try {
        // IP 가져오기
        const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
        const likeId = `like_${postId}_${ip.replace(/\./g, '_')}`;

        // 중복 체크
        const existing = await env.FROST_DB.prepare(`
            SELECT id FROM likes WHERE post_id = ? AND user_ip = ?
        `).bind(postId, ip).first();

        if (existing) {
            return new Response(JSON.stringify({ error: '이미 추천했습니다.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 추천 추가
        await env.FROST_DB.prepare(`
            INSERT INTO likes (id, post_id, user_ip, created_at) VALUES (?, ?, ?, ?)
        `).bind(likeId, postId, ip, Date.now()).run();

        // 글 추천수 증가
        await env.FROST_DB.prepare(`
            UPDATE posts SET likes = likes + 1 WHERE id = ?
        `).bind(postId).run();

        // 새 추천수 조회
        const post = await env.FROST_DB.prepare(`
            SELECT likes FROM posts WHERE id = ?
        `).bind(postId).first();

        return new Response(JSON.stringify({ success: true, likes: post.likes }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
