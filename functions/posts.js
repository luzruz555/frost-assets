// /functions/api/posts.js
// Pages Functions - /api/posts 엔드포인트

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    // POST: 글 저장 (봇에서 호출)
    if (request.method === 'POST') {
        return handleSavePost(request, env, corsHeaders);
    }

    // GET: 글 목록 조회
    if (request.method === 'GET') {
        return handleGetPosts(url, env, corsHeaders);
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

// 글 저장 (승인된 글)
async function handleSavePost(request, env, corsHeaders) {
    try {
        const auth = request.headers.get('Authorization');
        if (!auth || auth !== `Bearer ${env.WORKER_SECRET}`) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const data = await request.json();
        const { id, type, title, author, content, password, approvedAt, approvedBy } = data;

        const post = {
            id,
            type,
            title,
            author,
            content,
            password,
            approvedAt,
            approvedBy,
            createdAt: Date.now(),
            comments: [],
            likes: 0
        };

        await env.FROST_POSTS.put(`post:${id}`, JSON.stringify(post));

        // 인덱스 업데이트
        const indexKey = 'posts:index';
        const existingIndex = await env.FROST_POSTS.get(indexKey);
        const index = existingIndex ? JSON.parse(existingIndex) : [];
        
        index.unshift({
            id,
            type,
            title,
            author,
            createdAt: post.createdAt,
            commentCount: 0
        });

        if (index.length > 100) index.pop();
        await env.FROST_POSTS.put(indexKey, JSON.stringify(index));

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

// 글 목록 조회
async function handleGetPosts(url, env, corsHeaders) {
    try {
        const page = parseInt(url.searchParams.get('page')) || 1;
        const limit = Math.min(parseInt(url.searchParams.get('limit')) || 10, 20);
        const type = url.searchParams.get('type');

        const indexKey = 'posts:index';
        const existingIndex = await env.FROST_POSTS.get(indexKey);
        let index = existingIndex ? JSON.parse(existingIndex) : [];

        if (type) {
            index = index.filter(p => p.type === type);
        }

        const start = (page - 1) * limit;
        const posts = index.slice(start, start + limit);

        return new Response(JSON.stringify({
            posts,
            total: index.length,
            page,
            totalPages: Math.ceil(index.length / limit)
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
