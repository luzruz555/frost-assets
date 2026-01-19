// /functions/api/posts.js
// D1 버전 - 글 목록 조회 + 글 작성 + 개념글

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

// 글 저장
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
        const { id, type, title, author, content, password, isNotice } = data;

        await env.FROST_DB.prepare(`
            INSERT INTO posts (id, type, title, author, content, password, is_notice, created_at, comment_count, likes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
        `).bind(id, type, title, author, content, password, isNotice ? 1 : 0, Date.now()).run();

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
        const limit = Math.min(parseInt(url.searchParams.get('limit')) || 15, 50);
        const type = url.searchParams.get('type');
        const noticeOnly = url.searchParams.get('noticeOnly') === 'true';
        const bestOnly = url.searchParams.get('bestOnly') === 'true';

        // 공지 조회
        const notices = await env.FROST_DB.prepare(`
            SELECT id, type, title, author, is_notice as isNotice, created_at as createdAt, comment_count as commentCount, likes
            FROM posts WHERE is_notice = 1 ORDER BY created_at DESC
        `).all();

        // 개념글 (추천 10개 이상)
        if (bestOnly) {
            const bestPosts = await env.FROST_DB.prepare(`
                SELECT id, type, title, author, is_notice as isNotice, created_at as createdAt, comment_count as commentCount, likes
                FROM posts WHERE is_notice = 0 AND likes >= 10 ORDER BY likes DESC, created_at DESC LIMIT 50
            `).all();

            return new Response(JSON.stringify({
                posts: bestPosts.results.map(p => ({ ...p, isNotice: false })),
                total: bestPosts.results.length,
                page: 1,
                totalPages: 1
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 공지만 요청한 경우
        if (noticeOnly) {
            return new Response(JSON.stringify({
                posts: notices.results.map(p => ({ ...p, isNotice: true })),
                total: notices.results.length,
                page: 1,
                totalPages: 1
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 일반 글 조회
        let query = `SELECT id, type, title, author, is_notice as isNotice, created_at as createdAt, comment_count as commentCount, likes FROM posts WHERE is_notice = 0`;
        const params = [];

        if (type) {
            query += ` AND type = ?`;
            params.push(type);
        }

        // 총 개수
        let countQuery = `SELECT COUNT(*) as total FROM posts WHERE is_notice = 0`;
        if (type) {
            countQuery += ` AND type = ?`;
        }
        const countResult = await env.FROST_DB.prepare(countQuery).bind(...params).first();
        const total = countResult.total;

        // 페이지네이션
        const offset = (page - 1) * limit;
        query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const postsResult = await env.FROST_DB.prepare(query).bind(...params).all();

        const totalPages = Math.ceil(total / limit);

        // 1페이지면 공지 포함
        const posts = page === 1 
            ? [...notices.results.map(p => ({ ...p, isNotice: true })), ...postsResult.results.map(p => ({ ...p, isNotice: false }))]
            : postsResult.results.map(p => ({ ...p, isNotice: false }));

        return new Response(JSON.stringify({
            posts,
            notices: notices.results.length,
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
