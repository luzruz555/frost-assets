// Cloudflare Worker - 글 저장/조회 API
// KV 바인딩 필요: FROST_POSTS

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS 헤더
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        // Preflight 요청 처리
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // ═══════════════════════════════════════════
        // 라우팅
        // ═══════════════════════════════════════════

        // 기존 이미지 API
        if (path === '/api' && url.searchParams.has('m')) {
            return handleImageAPI(url);
        }

        // 글 저장 (봇에서 호출)
        if (path === '/api/posts' && request.method === 'POST') {
            return handleSavePost(request, env, corsHeaders);
        }

        // 글 목록 조회
        if (path === '/api/posts' && request.method === 'GET') {
            return handleGetPosts(url, env, corsHeaders);
        }

        // 글 상세 조회
        if (path.startsWith('/api/posts/') && request.method === 'GET') {
            const postId = path.split('/api/posts/')[1];
            return handleGetPost(postId, env, corsHeaders);
        }

        // 글 삭제
        if (path.startsWith('/api/posts/') && request.method === 'DELETE') {
            const postId = path.split('/api/posts/')[1];
            return handleDeletePost(postId, request, env, corsHeaders);
        }

        // 홈페이지 이미지 생성 (글 목록 기반)
        if (path === '/api/home-image') {
            return handleHomeImage(env);
        }

        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }
};

// ═══════════════════════════════════════════
// 글 저장 (승인된 글)
// ═══════════════════════════════════════════
async function handleSavePost(request, env, corsHeaders) {
    try {
        // 인증 확인
        const auth = request.headers.get('Authorization');
        if (!auth || auth !== `Bearer ${env.WORKER_SECRET}`) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const data = await request.json();
        const { id, type, title, author, content, password, approvedAt, approvedBy } = data;

        // 글 데이터
        const post = {
            id,
            type,
            title,
            author,
            content,
            password, // 실제로는 해시 권장
            approvedAt,
            approvedBy,
            createdAt: Date.now(),
            comments: [],
            likes: 0
        };

        // KV에 저장
        await env.FROST_POSTS.put(`post:${id}`, JSON.stringify(post));

        // 글 목록 인덱스 업데이트
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

        // 최대 100개 유지
        if (index.length > 100) {
            index.pop();
        }

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

// ═══════════════════════════════════════════
// 글 목록 조회
// ═══════════════════════════════════════════
async function handleGetPosts(url, env, corsHeaders) {
    try {
        const page = parseInt(url.searchParams.get('page')) || 1;
        const limit = Math.min(parseInt(url.searchParams.get('limit')) || 10, 20);
        const type = url.searchParams.get('type'); // 필터링

        const indexKey = 'posts:index';
        const existingIndex = await env.FROST_POSTS.get(indexKey);
        let index = existingIndex ? JSON.parse(existingIndex) : [];

        // 타입 필터링
        if (type) {
            index = index.filter(p => p.type === type);
        }

        // 페이지네이션
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

// ═══════════════════════════════════════════
// 글 상세 조회
// ═══════════════════════════════════════════
async function handleGetPost(postId, env, corsHeaders) {
    try {
        const post = await env.FROST_POSTS.get(`post:${postId}`);
        
        if (!post) {
            return new Response(JSON.stringify({ error: 'Post not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const parsed = JSON.parse(post);
        // 비밀번호 제외하고 반환
        delete parsed.password;

        return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

// ═══════════════════════════════════════════
// 글 삭제
// ═══════════════════════════════════════════
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
        
        // 비밀번호 확인
        if (parsed.password !== password) {
            return new Response(JSON.stringify({ error: 'Invalid password' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // KV에서 삭제
        await env.FROST_POSTS.delete(`post:${postId}`);

        // 인덱스에서도 제거
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

// ═══════════════════════════════════════════
// 홈 이미지 생성 (최신 글 4개)
// ═══════════════════════════════════════════
async function handleHomeImage(env) {
    try {
        const indexKey = 'posts:index';
        const existingIndex = await env.FROST_POSTS.get(indexKey);
        const index = existingIndex ? JSON.parse(existingIndex) : [];

        // 최신 4개
        const latest = index.slice(0, 4);

        // 기존 이미지 API 형식으로 변환
        const typeMap = { free: '자유', info: '정보', trade: '거래', help: '질문' };
        const listParam = latest.map(p => 
            `${typeMap[p.type] || p.type}|${p.title}|${p.author}|${p.commentCount || 0}`
        ).join('/./');

        // 기존 이미지 API로 리다이렉트
        const imageUrl = `https://frostc.pages.dev/api?m=h&l=${encodeURIComponent(listParam)}`;
        return Response.redirect(imageUrl, 302);

    } catch (error) {
        return new Response('Error generating image', { status: 500 });
    }
}

// ═══════════════════════════════════════════
// 기존 이미지 API (이전 코드 유지)
// ═══════════════════════════════════════════
async function handleImageAPI(url) {
    // 기존 이미지 생성 로직...
    // (이전에 만든 코드 그대로)
    return new Response('Image API - implement existing logic', { status: 200 });
}
