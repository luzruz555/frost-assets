// /functions/api/posts/[id].js
// Pages Functions - /api/posts/:id 엔드포인트 (캐싱 적용)

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

    // GET: 글 상세 조회
    if (request.method === 'GET') {
        return handleGetPost(postId, env, corsHeaders);
    }

    // DELETE: 글 삭제
    if (request.method === 'DELETE') {
        return handleDeletePost(postId, request, env, corsHeaders);
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

// 글 상세 조회 (캐싱 적용)
async function handleGetPost(postId, env, corsHeaders) {
    try {
        const post = await env.FROST_POSTS.get(`post:${postId}`);
        
        if (!post) {
            return new Response(JSON.stringify({ error: 'Post not found' }), {
                status: 404,
                headers: { 
                    ...corsHeaders, 
                    'Content-Type': 'application/json',
                    // 없는 글도 10초간 캐시 (반복 조회 방지)
                    'Cache-Control': 'public, max-age=10'
                }
            });
        }

        const parsed = JSON.parse(post);
        delete parsed.password; // 비밀번호 숨김

        return new Response(JSON.stringify(parsed), {
            headers: { 
                ...corsHeaders, 
                'Content-Type': 'application/json',
                // 30초 캐시
                'Cache-Control': 'public, max-age=30, s-maxage=30'
            }
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
        
        const post = await env.FROST_POSTS.get(`post:${postId}`);
        if (!post) {
            return new Response(JSON.stringify({ error: 'Post not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const parsed = JSON.parse(post);
        
        if (parsed.password !== password) {
            return new Response(JSON.stringify({ error: 'Invalid password' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

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
