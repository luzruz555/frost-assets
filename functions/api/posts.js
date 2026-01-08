// /functions/api/posts.js
// Pages Functions - /api/posts 엔드포인트 (공지 지원)

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

    if (request.method === 'POST') {
        return handleSavePost(request, env, corsHeaders);
    }

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
        const { id, type, title, author, content, password, isNotice, approvedAt, approvedBy } = data;

        const post = {
            id,
            type,
            title,
            author,
            content,
            password,
            isNotice: isNotice || false,
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
        
        const indexEntry = {
            id,
            type,
            title,
            author,
            isNotice: isNotice || false,
            createdAt: post.createdAt,
            commentCount: 0
        };

        // 공지면 맨 앞에, 일반 글이면 공지 다음에 추가
        if (isNotice) {
            index.unshift(indexEntry);
        } else {
            // 공지가 아닌 첫 번째 글 위치 찾기
            const firstNonNoticeIndex = index.findIndex(p => !p.isNotice);
            if (firstNonNoticeIndex === -1) {
                index.push(indexEntry);
            } else {
                index.splice(firstNonNoticeIndex, 0, indexEntry);
            }
        }

        // 일반 글만 100개 제한 (공지는 제외)
        const notices = index.filter(p => p.isNotice);
        const regularPosts = index.filter(p => !p.isNotice);
        if (regularPosts.length > 100) {
            regularPosts.pop();
        }
        const newIndex = [...notices, ...regularPosts];

        await env.FROST_POSTS.put(indexKey, JSON.stringify(newIndex));

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
        const limit = Math.min(parseInt(url.searchParams.get('limit')) || 15, 20);
        const type = url.searchParams.get('type');

        const indexKey = 'posts:index';
        const existingIndex = await env.FROST_POSTS.get(indexKey);
        let index = existingIndex ? JSON.parse(existingIndex) : [];

        // 공지와 일반 글 분리
        let notices = index.filter(p => p.isNotice);
        let regularPosts = index.filter(p => !p.isNotice);

        // 타입 필터링 (일반 글만, 공지는 항상 표시)
        if (type) {
            regularPosts = regularPosts.filter(p => p.type === type);
        }

        // 페이지네이션 (일반 글만)
        const total = regularPosts.length;
        const totalPages = Math.ceil(total / limit);
        const start = (page - 1) * limit;
        const paginatedPosts = regularPosts.slice(start, start + limit);

        // 첫 페이지면 공지 포함
        const posts = page === 1 
            ? [...notices, ...paginatedPosts]
            : paginatedPosts;

        return new Response(JSON.stringify({
            posts,
            notices: notices.length,
            total,
            page,
            totalPages
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
