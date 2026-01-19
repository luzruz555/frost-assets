// /functions/api/admin/logs.js
// 관리 내역 조회 + 추가

export async function onRequest(context) {
    const { request, env } = context;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const adminKey = request.headers.get('X-Admin-Key');
    if (adminKey !== 'luzruz555') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    if (request.method === 'GET') {
        try {
            const logs = await env.FROST_DB.prepare(`
                SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT 50
            `).all();

            return new Response(JSON.stringify({ logs: logs.results }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }

    if (request.method === 'POST') {
        try {
            const { action, postId, postTitle, adminName } = await request.json();
            const id = `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

            await env.FROST_DB.prepare(`
                INSERT INTO admin_logs (id, action, post_id, post_title, admin_name, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind(id, action, postId || null, postTitle || null, adminName, Date.now()).run();

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

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}
